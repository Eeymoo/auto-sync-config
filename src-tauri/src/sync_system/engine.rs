use super::adapter::{
    endpoint_variables, expand_template, resolve_data_root, safe_relative_path, AdapterRegistry,
};
use super::model::{
    AdapterPack, FileRule, FileRuleMode, JournalEntry, PlannedFile, SyncAction,
    SyncExecutionResult, SyncPlan, SyncRequest, SyncTransitionResult, TransactionJournal,
    TransactionState, TransactionSummary, TargetState,
};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone)]
enum ResolvedSource {
    File(PathBuf),
    Inline(Vec<u8>),
}

#[derive(Debug, Clone)]
struct ResolvedFile {
    planned: PlannedFile,
    target_relative: PathBuf,
    source: ResolvedSource,
}

struct InternalPlan {
    public: SyncPlan,
    resolved: Vec<ResolvedFile>,
    target_data_root: PathBuf,
}

pub fn plan_sync(registry: &AdapterRegistry, request: &SyncRequest) -> Result<SyncPlan, String> {
    Ok(build_plan(registry, request)?.public)
}

pub fn execute_sync(
    registry: &AdapterRegistry,
    request: &SyncRequest,
    history_root: &Path,
) -> Result<SyncExecutionResult, String> {
    let plan = build_plan(registry, request)?;
    fs::create_dir_all(history_root)
        .map_err(|error| format!("创建同步事务目录失败 {}: {error}", history_root.display()))?;

    let transaction_id = Uuid::new_v4().to_string();
    let transaction_root = history_root.join(&transaction_id);
    let incoming_root = transaction_root.join("incoming");
    let backup_root = transaction_root.join("backup");
    fs::create_dir_all(&incoming_root)
        .map_err(|error| format!("创建 after 快照失败 {}: {error}", incoming_root.display()))?;
    fs::create_dir_all(&backup_root)
        .map_err(|error| format!("创建 before 快照失败 {}: {error}", backup_root.display()))?;

    let changed = plan
        .resolved
        .iter()
        .filter(|file| file.planned.action != SyncAction::Unchanged)
        .collect::<Vec<_>>();
    let unchanged_files = plan.resolved.len() - changed.len();
    let mut entries = Vec::with_capacity(changed.len());

    // Stage every incoming snapshot first, then capture the post-sync target
    // state, then touch the target. Once the journal reaches Preparing the
    // transaction is recoverable.
    for (index, file) in changed.iter().enumerate() {
        let incoming_relative = format!("incoming/{index:06}.bin");
        let incoming_path = transaction_root.join(&incoming_relative);
        write_source_snapshot(&file.source, &incoming_path)?;
        let staged_hash = sha256_file(&incoming_path)?;
        if staged_hash != file.planned.sha256 {
            return Err(format!("after 快照校验失败: {}", file.planned.logical_path));
        }

        let target = secure_target_path(&plan.target_data_root, &file.target_relative)?;
        let (existed_before, backup_relative, sha256_before) = if target.is_file() {
            let relative = format!("backup/{index:06}.bin");
            let backup_path = transaction_root.join(&relative);
            fs::copy(&target, &backup_path).map_err(|error| {
                format!(
                    "保存 before 快照失败 {} -> {}: {error}",
                    target.display(),
                    backup_path.display()
                )
            })?;
            let hash = sha256_file(&backup_path)?;
            (true, Some(relative), Some(hash))
        } else if target.exists() {
            return Err(format!("目标不是普通文件: {}", target.display()));
        } else {
            (false, None, None)
        };

        entries.push(JournalEntry {
            target_relative: path_to_portable(&file.target_relative),
            incoming_relative,
            backup_relative,
            existed_before,
            sha256_before,
            sha256_after: file.planned.sha256.clone(),
            target_state_after: TargetState::Present(staged_hash),
            target_state_before_transition: None,
        });
    }

    let mut journal = TransactionJournal {
        schema_version: 1,
        id: transaction_id.clone(),
        adapter_id: plan.public.adapter_id.clone(),
        adapter_version: plan.public.adapter_version.clone(),
        created_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        state: TransactionState::Preparing,
        target_data_root: plan.target_data_root.to_string_lossy().into_owned(),
        entries,
    };
    save_journal(&transaction_root, &journal)?;

    if let Err(apply_error) = apply_entries(&transaction_root, &journal, false) {
        match restore_before(&transaction_root, &journal, false) {
            Ok(_) => journal.state = TransactionState::RolledBack,
            Err(rollback_error) => {
                journal.state = TransactionState::Failed;
                let _ = save_journal(&transaction_root, &journal);
                return Err(format!(
                    "同步失败且自动回滚未完成。同步错误: {apply_error}; 回滚错误: {rollback_error}; 事务: {transaction_id}"
                ));
            }
        }
        save_journal(&transaction_root, &journal)?;
        return Err(format!(
            "同步失败，已自动回滚: {apply_error}; 事务: {transaction_id}"
        ));
    }

    journal.state = TransactionState::Committed;
    save_journal(&transaction_root, &journal)?;
    Ok(SyncExecutionResult {
        transaction_id,
        changed_files: changed.len(),
        unchanged_files,
        history_path: transaction_root.to_string_lossy().into_owned(),
        warnings: plan.public.warnings,
    })
}

pub fn undo_transaction(
    history_root: &Path,
    transaction_id: &str,
) -> Result<SyncTransitionResult, String> {
    let (transaction_root, mut journal) = load_transaction(history_root, transaction_id)?;
    if journal.state != TransactionState::Committed {
        return Err(format!(
            "事务 {} 当前状态为 {:?}，不能撤销（仅已提交的事务可撤销）",
            transaction_id, journal.state
        ));
    }
    let restored = match restore_before(&transaction_root, &journal, true) {
        Ok(restored) => restored,
        Err(error) => {
            // A conflict or mid-restore failure leaves the journal unchanged;
            // the transaction stays Committed and can be retried.
            return Err(format!("撤销失败: {error}"));
        }
    };
    // Record the state undo restored to, so a later redo can verify nothing
    // changed before it re-applies.
    let restored_states = undo_restored_states(&journal);
    apply_transition_state(&mut journal, restored_states);
    journal.state = TransactionState::RolledBack;
    save_journal(&transaction_root, &journal)?;
    Ok(SyncTransitionResult {
        transaction_id: transaction_id.to_string(),
        state: journal.state,
        restored_files: restored,
    })
}

pub fn redo_transaction(
    history_root: &Path,
    transaction_id: &str,
) -> Result<SyncTransitionResult, String> {
    let (transaction_root, mut journal) = load_transaction(history_root, transaction_id)?;
    if journal.state != TransactionState::RolledBack {
        return Err(format!(
            "事务 {} 当前状态为 {:?}，不能重做",
            transaction_id, journal.state
        ));
    }
    match apply_entries(&transaction_root, &journal, true) {
        Ok(()) => {}
        Err(error) => {
            // Leave the journal RolledBack so the user can retry the redo
            // after resolving the conflict.
            return Err(format!("重做失败: {error}"));
        }
    }
    // Record the state redo applied, so a later undo can verify nothing
    // changed before it rolls back.
    let applied_states = redo_applied_states(&journal);
    apply_transition_state(&mut journal, applied_states);
    journal.state = TransactionState::Committed;
    save_journal(&transaction_root, &journal)?;
    Ok(SyncTransitionResult {
        transaction_id: transaction_id.to_string(),
        state: journal.state,
        restored_files: journal.entries.len(),
    })
}

pub fn list_transactions(history_root: &Path) -> Result<Vec<TransactionSummary>, String> {
    if !history_root.is_dir() {
        return Ok(Vec::new());
    }
    let mut transactions = Vec::new();
    for entry in fs::read_dir(history_root)
        .map_err(|error| format!("读取事务目录失败 {}: {error}", history_root.display()))?
    {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(content) = read_journal_content(&path) else {
            continue;
        };
        let Ok(journal) = serde_json::from_str::<TransactionJournal>(&content) else {
            continue;
        };
        transactions.push(TransactionSummary {
            id: journal.id,
            adapter_id: journal.adapter_id,
            adapter_version: journal.adapter_version,
            created_unix_ms: journal.created_unix_ms,
            state: journal.state,
            file_count: journal.entries.len(),
            target_data_root: journal.target_data_root,
        });
    }
    transactions.sort_by_key(|transaction| std::cmp::Reverse(transaction.created_unix_ms));
    Ok(transactions)
}

fn build_plan(registry: &AdapterRegistry, request: &SyncRequest) -> Result<InternalPlan, String> {
    let pack = registry.get(&request.adapter_id)?;
    let source_data_root = resolve_data_root(
        pack,
        Path::new(&request.source.root),
        &request.source.variant,
    )?;
    let target_data_root = resolve_data_root(
        pack,
        Path::new(&request.target.root),
        &request.target.variant,
    )?;
    let (source_variables, source_role_id) =
        endpoint_variables(pack, &request.source, &source_data_root)?;
    let (target_variables, target_role_id) =
        endpoint_variables(pack, &request.target, &target_data_root)?;

    let selected_groups = selected_groups(pack, &request.groups)?;
    let selected_ids = selected_groups
        .iter()
        .map(|group| group.id.clone())
        .collect::<Vec<_>>();
    let mut warnings = Vec::new();
    let needs_role_id = selected_groups.iter().any(|group| {
        group.files.iter().any(|rule| {
            rule.target.contains("{roleId}")
                || rule
                    .source_candidates
                    .iter()
                    .any(|candidate| candidate.contains("{roleId}"))
        })
    });
    if needs_role_id && (source_role_id.is_none() || target_role_id.is_none()) {
        warnings.push(
            "部分角色插件规则需要 roleId；未能解析的一侧将跳过这些规则。请先用相应角色登录游戏。"
                .to_string(),
        );
    }

    let mut resolved = Vec::<ResolvedFile>::new();
    let mut target_indexes = HashMap::<String, usize>::new();
    for group in selected_groups {
        for rule in &group.files {
            let files = resolve_rule(
                pack,
                &group.id,
                rule,
                &source_data_root,
                &target_data_root,
                &source_variables,
                &target_variables,
                &mut warnings,
            )?;
            for file in files {
                let key = target_key(&file.target_relative);
                if let Some(index) = target_indexes.get(&key).copied() {
                    warnings.push(format!(
                        "{} 覆盖了同一目标上的较早规则 {}",
                        file.planned.logical_path, resolved[index].planned.logical_path
                    ));
                    resolved[index] = file;
                } else {
                    target_indexes.insert(key, resolved.len());
                    resolved.push(file);
                }
            }
        }
    }

    resolved.sort_by(|left, right| left.target_relative.cmp(&right.target_relative));
    let public = SyncPlan {
        adapter_id: pack.id.clone(),
        adapter_version: pack.version.clone(),
        source_data_root: source_data_root.to_string_lossy().into_owned(),
        target_data_root: target_data_root.to_string_lossy().into_owned(),
        groups: selected_ids,
        files: resolved.iter().map(|file| file.planned.clone()).collect(),
        warnings,
    };
    Ok(InternalPlan {
        public,
        resolved,
        target_data_root,
    })
}

#[allow(clippy::too_many_arguments)]
fn resolve_rule(
    _pack: &AdapterPack,
    group_id: &str,
    rule: &FileRule,
    source_root: &Path,
    target_root: &Path,
    source_variables: &HashMap<String, String>,
    target_variables: &HashMap<String, String>,
    warnings: &mut Vec<String>,
) -> Result<Vec<ResolvedFile>, String> {
    let target_template = match expand_template(&rule.target, target_variables) {
        Ok(value) => value,
        Err(error) if rule.optional => {
            warnings.push(format!("跳过可选规则 {group_id}/{}: {error}", rule.id));
            return Ok(Vec::new());
        }
        Err(error) => return Err(format!("解析目标规则 {group_id}/{} 失败: {error}", rule.id)),
    };
    let target_relative = safe_relative_path(&target_template)?;

    if let Some(value) = &rule.inline_base64 {
        if rule.mode != FileRuleMode::File {
            return Err(format!("内嵌数据规则必须是 file: {group_id}/{}", rule.id));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(value)
            .map_err(|error| format!("内嵌数据解码失败 {group_id}/{}: {error}", rule.id))?;
        return Ok(vec![resolved_file(
            group_id,
            rule,
            format!("inline:{group_id}/{}", rule.id),
            target_root,
            target_relative,
            ResolvedSource::Inline(bytes),
            None,
        )?]);
    }

    let source = find_source_candidate(
        source_root,
        &rule.source_candidates,
        source_variables,
        rule.mode,
    )?;
    let Some(source) = source else {
        let message = format!("来源缺少规则 {group_id}/{} 的文件", rule.id);
        if rule.optional {
            warnings.push(message);
            return Ok(Vec::new());
        }
        return Err(message);
    };

    match rule.mode {
        FileRuleMode::File => Ok(vec![resolved_file(
            group_id,
            rule,
            source.to_string_lossy().into_owned(),
            target_root,
            target_relative,
            ResolvedSource::File(source.clone()),
            Some(&source),
        )?]),
        FileRuleMode::Directory => {
            let mut children = fs::read_dir(&source)
                .map_err(|error| format!("读取规则目录失败 {}: {error}", source.display()))?
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.is_file())
                .collect::<Vec<_>>();
            children.sort();
            let mut result = Vec::new();
            for child in children {
                let file_name = child
                    .file_name()
                    .ok_or_else(|| format!("文件缺少名称: {}", child.display()))?;
                result.push(resolved_file(
                    group_id,
                    rule,
                    child.to_string_lossy().into_owned(),
                    target_root,
                    target_relative.join(file_name),
                    ResolvedSource::File(child.clone()),
                    Some(&child),
                )?);
            }
            Ok(result)
        }
    }
}

fn resolved_file(
    group_id: &str,
    rule: &FileRule,
    source_label: String,
    target_root: &Path,
    target_relative: PathBuf,
    source: ResolvedSource,
    source_path: Option<&Path>,
) -> Result<ResolvedFile, String> {
    let (size, sha256) = match &source {
        ResolvedSource::File(path) => {
            let metadata = fs::metadata(path)
                .map_err(|error| format!("读取来源文件信息失败 {}: {error}", path.display()))?;
            (metadata.len(), sha256_file(path)?)
        }
        ResolvedSource::Inline(bytes) => (bytes.len() as u64, sha256_bytes(bytes)),
    };
    let target = secure_target_path(target_root, &target_relative)?;
    if let Some(path) = source_path {
        if target.exists() {
            let source_canonical = path.canonicalize().map_err(|error| error.to_string())?;
            let target_canonical = target.canonicalize().map_err(|error| error.to_string())?;
            if source_canonical == target_canonical {
                return Ok(ResolvedFile {
                    planned: PlannedFile {
                        group_id: group_id.to_string(),
                        rule_id: rule.id.clone(),
                        logical_path: logical_path(group_id, &rule.id, &target_relative),
                        source: source_label,
                        target: target.to_string_lossy().into_owned(),
                        size,
                        sha256,
                        action: SyncAction::Unchanged,
                    },
                    target_relative,
                    source,
                });
            }
        }
    }
    let action = if target.is_file() {
        if sha256_file(&target)? == sha256 {
            SyncAction::Unchanged
        } else {
            SyncAction::Replace
        }
    } else if target.exists() {
        return Err(format!("同步目标不是普通文件: {}", target.display()));
    } else {
        SyncAction::Create
    };
    Ok(ResolvedFile {
        planned: PlannedFile {
            group_id: group_id.to_string(),
            rule_id: rule.id.clone(),
            logical_path: logical_path(group_id, &rule.id, &target_relative),
            source: source_label,
            target: target.to_string_lossy().into_owned(),
            size,
            sha256,
            action,
        },
        target_relative,
        source,
    })
}

fn selected_groups<'a>(
    pack: &'a AdapterPack,
    requested: &[String],
) -> Result<Vec<&'a super::model::SyncGroup>, String> {
    if requested.is_empty() {
        return Ok(pack
            .groups
            .iter()
            .filter(|group| group.default_enabled)
            .collect());
    }
    let requested = requested.iter().cloned().collect::<HashSet<_>>();
    let known = pack
        .groups
        .iter()
        .map(|group| group.id.clone())
        .collect::<HashSet<_>>();
    let unknown = requested.difference(&known).cloned().collect::<Vec<_>>();
    if !unknown.is_empty() {
        return Err(format!("未知同步分组: {}", unknown.join(", ")));
    }
    Ok(pack
        .groups
        .iter()
        .filter(|group| requested.contains(&group.id))
        .collect())
}

fn find_source_candidate(
    source_root: &Path,
    candidates: &[String],
    variables: &HashMap<String, String>,
    mode: FileRuleMode,
) -> Result<Option<PathBuf>, String> {
    for candidate in candidates {
        let expanded = match expand_template(candidate, variables) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let relative = safe_relative_path(&expanded)?;
        let path = source_root.join(relative);
        let exists = match mode {
            FileRuleMode::File => path.is_file(),
            FileRuleMode::Directory => path.is_dir(),
        };
        if exists {
            let canonical = path
                .canonicalize()
                .map_err(|error| format!("解析来源路径失败 {}: {error}", path.display()))?;
            if !canonical.starts_with(source_root) {
                return Err(format!("来源路径越界: {}", canonical.display()));
            }
            return Ok(Some(canonical));
        }
    }
    Ok(None)
}

fn apply_entries(
    transaction_root: &Path,
    journal: &TransactionJournal,
    guard_conflicts: bool,
) -> Result<(), String> {
    let target_root = canonical_target_root(&journal.target_data_root)?;
    for (index, entry) in journal.entries.iter().enumerate() {
        if guard_conflicts {
            check_target_state(&target_root, entry)?;
        }
        let relative = safe_relative_path(&entry.target_relative)?;
        let target = secure_target_path(&target_root, &relative)?;
        let incoming = transaction_root.join(safe_relative_path(&entry.incoming_relative)?);
        if sha256_file(&incoming)? != entry.sha256_after {
            return Err(format!("after 快照已损坏: {}", incoming.display()));
        }
        replace_file(&incoming, &target, &journal.id, index)?;
    }
    Ok(())
}

fn restore_before(
    transaction_root: &Path,
    journal: &TransactionJournal,
    guard_conflicts: bool,
) -> Result<usize, String> {
    let target_root = canonical_target_root(&journal.target_data_root)?;
    let mut restored = 0;
    for (index, entry) in journal.entries.iter().enumerate().rev() {
        if guard_conflicts {
            check_target_state(&target_root, entry)?;
        }
        let relative = safe_relative_path(&entry.target_relative)?;
        let target = secure_target_path(&target_root, &relative)?;
        if entry.existed_before {
            let backup_relative = entry
                .backup_relative
                .as_ref()
                .ok_or_else(|| format!("事务缺少 before 快照: {}", entry.target_relative))?;
            let backup = transaction_root.join(safe_relative_path(backup_relative)?);
            if let Some(expected) = &entry.sha256_before {
                if sha256_file(&backup)? != *expected {
                    return Err(format!("before 快照已损坏: {}", backup.display()));
                }
            }
            replace_file(&backup, &target, &journal.id, index)?;
        } else if target.is_file() {
            fs::remove_file(&target)
                .map_err(|error| format!("撤销新文件失败 {}: {error}", target.display()))?;
        } else if target.exists() {
            return Err(format!("撤销目标不是普通文件: {}", target.display()));
        }
        restored += 1;
    }
    Ok(restored)
}

/// States an undo restores to: the pre-sync content (or absent if the file
/// did not exist before the transaction).
fn undo_restored_states(journal: &TransactionJournal) -> Vec<TargetState> {
    journal
        .entries
        .iter()
        .map(|entry| match &entry.sha256_before {
            Some(hash) => TargetState::Present(hash.clone()),
            None => TargetState::Absent,
        })
        .collect()
}

/// States a redo applies: the post-sync content.
fn redo_applied_states(journal: &TransactionJournal) -> Vec<TargetState> {
    journal
        .entries
        .iter()
        .map(|entry| TargetState::Present(entry.sha256_after.clone()))
        .collect()
}

/// Persist captured transition states onto the journal entries. The first
/// transition's snapshot is authoritative: it records the state the very
/// first undo rolls back to (and the first redo expects). Later transitions
/// must not overwrite it, or redo would compare against the pre-undo state
/// instead of the post-undo one.
fn apply_transition_state(journal: &mut TransactionJournal, states: Vec<TargetState>) {
    for (entry, state) in journal.entries.iter_mut().zip(states) {
        if entry.target_state_before_transition.is_none() {
            entry.target_state_before_transition = Some(state);
        }
    }
}
/// Refuse to overwrite data that changed away from the state this transition
/// expects. Without this check, undo or redo of an old transaction would
/// silently discard edits made to the target files in the meantime.
fn check_target_state(
    target_root: &Path,
    entry: &JournalEntry,
) -> Result<(), String> {
    // The first undo after a fresh commit has no transition snapshot; fall
    // back to the post-commit state recorded when the transaction ran.
    let expected = entry
        .target_state_before_transition
        .as_ref()
        .unwrap_or(&entry.target_state_after);
    let relative = safe_relative_path(&entry.target_relative)?;
    let target = secure_target_path(target_root, &relative)?;
    let current = if target.is_file() {
        if entry.target_relative.contains("addon") {
        }
        Some(sha256_file(&target)?)
    } else if target.exists() {
        return Err(format!("目标不是普通文件: {}", target.display()));
    } else {
        None
    };
    let matches = match (expected, &current) {
        (TargetState::Present(expected), Some(actual)) => expected == actual,
        (TargetState::Absent, None) => true,
        _ => false,
    };
    if !matches && entry.target_relative.contains("addon") {
    }
    if matches {
        Ok(())
    } else {
        Err(format!(
            "目标文件在事务后已被修改: {}。为避免覆盖较新的数据，已停止。",
            entry.target_relative
        ))
    }
}

fn write_source_snapshot(source: &ResolvedSource, target: &Path) -> Result<(), String> {
    match source {
        ResolvedSource::File(path) => fs::copy(path, target)
            .map(|_| ())
            .map_err(|error| format!("固化 after 快照失败 {}: {error}", path.display())),
        ResolvedSource::Inline(bytes) => fs::write(target, bytes)
            .map_err(|error| format!("写入内嵌 after 快照失败 {}: {error}", target.display())),
    }
}

fn replace_file(
    source: &Path,
    target: &Path,
    transaction_id: &str,
    index: usize,
) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| format!("目标路径缺少父目录: {}", target.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("创建目标目录失败 {}: {error}", parent.display()))?;
    let temp = parent.join(format!(".sync-{transaction_id}-{index:06}.tmp"));
    fs::copy(source, &temp).map_err(|error| {
        format!(
            "写入目标临时文件失败 {} -> {}: {error}",
            source.display(),
            temp.display()
        )
    })?;
    if target.is_file() {
        fs::remove_file(target)
            .map_err(|error| format!("替换目标文件失败 {}: {error}", target.display()))?;
    } else if target.exists() {
        let _ = fs::remove_file(&temp);
        return Err(format!("目标不是普通文件: {}", target.display()));
    }
    fs::rename(&temp, target).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("提交目标文件失败 {}: {error}", target.display())
    })
}

fn save_journal(transaction_root: &Path, journal: &TransactionJournal) -> Result<(), String> {
    let content = serde_json::to_vec_pretty(journal)
        .map_err(|error| format!("序列化事务日志失败: {error}"))?;
    let target = transaction_root.join("journal.json");
    let temporary = transaction_root.join("journal.json.tmp");
    let previous = transaction_root.join("journal.json.bak");
    fs::write(&temporary, content)
        .map_err(|error| format!("写入事务日志失败 {}: {error}", temporary.display()))?;
    if target.exists() {
        if previous.exists() {
            fs::remove_file(&previous)
                .map_err(|error| format!("清理旧事务日志失败 {}: {error}", previous.display()))?;
        }
        fs::rename(&target, &previous).map_err(|error| {
            format!(
                "保存上一版事务日志失败 {} -> {}: {error}",
                target.display(),
                previous.display()
            )
        })?;
    }
    if let Err(error) = fs::rename(&temporary, &target) {
        if previous.exists() {
            let _ = fs::rename(&previous, &target);
        }
        return Err(format!("提交事务日志失败 {}: {error}", target.display()));
    }
    if previous.exists() {
        fs::remove_file(&previous)
            .map_err(|error| format!("清理上一版事务日志失败 {}: {error}", previous.display()))?;
    }
    Ok(())
}

fn load_transaction(
    history_root: &Path,
    transaction_id: &str,
) -> Result<(PathBuf, TransactionJournal), String> {
    let id = Uuid::parse_str(transaction_id)
        .map_err(|_| format!("无效的事务 ID: {transaction_id}"))?
        .to_string();
    let transaction_root = history_root.join(id);
    let content = read_journal_content(&transaction_root)
        .map_err(|error| format!("读取事务 {} 失败: {error}", transaction_id))?;
    let journal = serde_json::from_str::<TransactionJournal>(&content)
        .map_err(|error| format!("解析事务 {} 失败: {error}", transaction_id))?;
    if journal.id != transaction_id {
        return Err(format!("事务日志 ID 不匹配: {transaction_id}"));
    }
    Ok((transaction_root, journal))
}

fn read_journal_content(transaction_root: &Path) -> Result<String, String> {
    let current = transaction_root.join("journal.json");
    match fs::read_to_string(&current) {
        Ok(content) => Ok(content),
        Err(current_error) => {
            let previous = transaction_root.join("journal.json.bak");
            fs::read_to_string(&previous).map_err(|previous_error| {
                format!("当前日志不可用 ({current_error})，上一版日志也不可用 ({previous_error})")
            })
        }
    }
}

fn secure_target_path(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let relative = safe_relative_path(&relative.to_string_lossy())?;
    let target = root.join(relative);
    let mut ancestor = target.as_path();
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| format!("目标路径没有有效父目录: {}", target.display()))?;
    }
    let canonical_ancestor = ancestor
        .canonicalize()
        .map_err(|error| format!("解析目标父目录失败 {}: {error}", ancestor.display()))?;
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("解析目标根目录失败 {}: {error}", root.display()))?;
    if !canonical_ancestor.starts_with(&canonical_root) {
        return Err(format!("目标路径越界: {}", target.display()));
    }
    Ok(target)
}

fn canonical_target_root(value: &str) -> Result<PathBuf, String> {
    Path::new(value)
        .canonicalize()
        .map_err(|error| format!("事务目标目录不可用 {value}: {error}"))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path)
        .map_err(|error| format!("读取文件失败 {}: {error}", path.display()))?;
    sha256_reader(file).map_err(|error| format!("计算文件摘要失败 {}: {error}", path.display()))
}

fn sha256_reader(mut reader: impl Read) -> io::Result<String> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn target_key(path: &Path) -> String {
    let value = path_to_portable(path);
    if cfg!(windows) {
        value.to_ascii_lowercase()
    } else {
        value
    }
}

fn path_to_portable(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn logical_path(group_id: &str, rule_id: &str, target_relative: &Path) -> String {
    let file = target_relative
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(rule_id);
    format!("{group_id}/{rule_id}/{file}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync_system::model::{RoleEndpoint, SyncRole};

    #[test]
    fn sync_transaction_can_be_undone_and_redone() {
        let root = std::env::temp_dir().join(format!("auto-sync-config-test-{}", Uuid::new_v4()));
        let source_installation = root.join("source");
        let target_installation = root.join("target");
        let source_data = source_installation.join("bin/zhcn_hd");
        let target_data = target_installation.join("bin/zhcn_hd");
        let source_role = SyncRole {
            account: "source-account".into(),
            area: "电信区".into(),
            server: "一号服".into(),
            role: "来源角色".into(),
        };
        let target_role = SyncRole {
            account: "target-account".into(),
            area: "电信区".into(),
            server: "一号服".into(),
            role: "目标角色".into(),
        };

        create_test_data_root(&source_data, &source_role, b"source-async");
        create_test_data_root(&target_data, &target_role, b"target-async");
        let source_file = role_file(&source_data, &source_role, "addon.jx3dat");
        let target_file = role_file(&target_data, &target_role, "addon.jx3dat");
        fs::write(&source_file, b"after").unwrap();
        fs::write(&target_file, b"before").unwrap();
        let target_async_file =
            role_file(&target_data, &target_role, "userpreferencesasync.jx3dat");
        let async_before = fs::read(&target_async_file).unwrap();
        // Exact bytes of the built-in adapter's disable-server-sync payload,
        // decoded from the adapter JSON so the test can never drift from it.
        // The userdata group's preferences-async rule copies this file from the
        // source role, so after sync the target holds the source's content.
        let async_after = b"source-async".to_vec();

        let request = SyncRequest {
            adapter_id: "jx3".into(),
            source: RoleEndpoint {
                root: source_installation.to_string_lossy().into_owned(),
                variant: "official".into(),
                role: source_role,
            },
            target: RoleEndpoint {
                root: target_installation.to_string_lossy().into_owned(),
                variant: "official".into(),
                role: target_role,
            },
            groups: vec!["userdata".into()],
        };
        let registry = AdapterRegistry::load(None).unwrap();
        let plan = plan_sync(&registry, &request).unwrap();
        assert_eq!(
            plan.files
                .iter()
                .filter(|file| file.action != SyncAction::Unchanged)
                .count(),
            2
        );

        let history = root.join("history");
        let executed = execute_sync(&registry, &request, &history).unwrap();
        assert_eq!(fs::read(&target_file).unwrap(), b"after");
        assert_eq!(fs::read(&target_async_file).unwrap(), async_after);
        assert_eq!(executed.changed_files, 2);

        // Undo/redo must refuse to clobber edits made after the transaction.
        fs::write(&target_file, b"manual-edit").unwrap();
        assert!(undo_transaction(&history, &executed.transaction_id).is_err());
        assert_eq!(fs::read(&target_file).unwrap(), b"manual-edit");
        // Entries are processed in reverse-sorted order, so the async entry
        // (sorted after addon) is restored before the conflict aborts undo.
        assert_eq!(fs::read(&target_async_file).unwrap(), async_before);

        // Restore both files to their post-sync state for the clean undo.
        fs::write(&target_file, b"after").unwrap();
        fs::write(&target_async_file, &async_after).unwrap();
        undo_transaction(&history, &executed.transaction_id).unwrap();
        assert_eq!(fs::read(&target_file).unwrap(), b"before");
        assert_eq!(fs::read(&target_async_file).unwrap(), async_before);

        // Same guard on redo: any change since the undo aborts it.
        fs::write(&target_file, b"another-edit").unwrap();
        assert!(redo_transaction(&history, &executed.transaction_id).is_err());
        assert_eq!(fs::read(&target_file).unwrap(), b"another-edit");
        assert_eq!(fs::read(&target_async_file).unwrap(), async_before);

        // Redo applies entry 0 (addon) first and aborts on the conflict, so
        // only addon is re-applied; async still holds its post-undo content.
        // Restore both files to the post-undo state for the clean redo.
        fs::write(&target_file, b"before").unwrap();
        fs::write(&target_async_file, &async_before).unwrap();
        redo_transaction(&history, &executed.transaction_id).unwrap();
        assert_eq!(fs::read(&target_file).unwrap(), b"after");
        assert_eq!(fs::read(&target_async_file).unwrap(), async_after);

        fs::remove_dir_all(&root).unwrap();
    }

    fn create_test_data_root(root: &Path, role: &SyncRole, async_content: &[u8]) {
        fs::create_dir_all(root.join("interface")).unwrap();
        fs::create_dir_all(
            root.join("userdata")
                .join(&role.account)
                .join(&role.area)
                .join(&role.server)
                .join(&role.role),
        )
        .unwrap();
        fs::write(root.join("userdata/config.dat"), b"marker").unwrap();
        // The built-in adapter's disable-server-sync group always overwrites
        // this file with its inline payload; seed both sides with distinct
        // content so the replace (and thus undo/redo) is observable.
        fs::write(
            role_file(root, role, "userpreferencesasync.jx3dat"),
            async_content,
        )
        .unwrap();
    }

    fn role_file(root: &Path, role: &SyncRole, name: &str) -> PathBuf {
        root.join("userdata")
            .join(&role.account)
            .join(&role.area)
            .join(&role.server)
            .join(&role.role)
            .join(name)
    }
}
