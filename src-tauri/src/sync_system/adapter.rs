use super::model::{
    AdapterPack, AdapterSummary, GroupSummary, RoleEndpoint, SyncRole, VariantSummary,
};
use encoding_rs::GBK;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

const BUILTIN_JX3: &str = include_str!("../../sync-sources/jx3.json");

#[derive(Debug, Clone)]
pub struct AdapterRegistry {
    packs: BTreeMap<String, AdapterPack>,
}

impl AdapterRegistry {
    pub fn load(external_directory: Option<&Path>) -> Result<Self, String> {
        let builtin: AdapterPack = serde_json::from_str(BUILTIN_JX3)
            .map_err(|error| format!("内置 JX3 适配源无效: {error}"))?;
        validate_pack(&builtin)?;

        let mut packs = BTreeMap::from([(builtin.id.clone(), builtin)]);
        if let Some(directory) = external_directory {
            fs::create_dir_all(directory)
                .map_err(|error| format!("创建同步源目录失败 {}: {error}", directory.display()))?;
            let mut files = fs::read_dir(directory)
                .map_err(|error| format!("读取同步源目录失败 {}: {error}", directory.display()))?
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json"))
                .collect::<Vec<_>>();
            files.sort();

            for path in files {
                let content = fs::read_to_string(&path)
                    .map_err(|error| format!("读取适配源失败 {}: {error}", path.display()))?;
                let pack: AdapterPack = serde_json::from_str(&content)
                    .map_err(|error| format!("解析适配源失败 {}: {error}", path.display()))?;
                validate_pack(&pack)?;
                packs.insert(pack.id.clone(), pack);
            }
        }

        Ok(Self { packs })
    }

    pub fn get(&self, id: &str) -> Result<&AdapterPack, String> {
        self.packs
            .get(id)
            .ok_or_else(|| format!("未找到同步适配源: {id}"))
    }

    pub fn summaries(&self) -> Vec<AdapterSummary> {
        self.packs
            .values()
            .map(|pack| AdapterSummary {
                id: pack.id.clone(),
                name: pack.name.clone(),
                version: pack.version.clone(),
                variants: pack
                    .variants
                    .iter()
                    .map(|(id, variant)| VariantSummary {
                        id: id.clone(),
                        label: variant.label.clone(),
                    })
                    .collect(),
                groups: pack
                    .groups
                    .iter()
                    .map(|group| GroupSummary {
                        id: group.id.clone(),
                        name: group.name.clone(),
                        description: group.description.clone(),
                        default_enabled: group.default_enabled,
                    })
                    .collect(),
            })
            .collect()
    }
}

pub fn validate_pack(pack: &AdapterPack) -> Result<(), String> {
    if pack.schema_version != 1 {
        return Err(format!(
            "适配源 {} 使用不支持的 schemaVersion {}",
            pack.id, pack.schema_version
        ));
    }
    if pack.id.trim().is_empty() || pack.variants.is_empty() || pack.groups.is_empty() {
        return Err("适配源必须包含 id、variants 和 groups".to_string());
    }
    if !pack
        .id
        .chars()
        .all(|value| value.is_ascii_alphanumeric() || value == '-' || value == '_')
    {
        return Err(format!("适配源 id 只能包含字母、数字、- 和 _: {}", pack.id));
    }
    if pack.role_catalog.levels != ["account", "area", "server", "role"] {
        return Err(format!(
            "适配源 {} 的 roleCatalog.levels 目前必须为 account/area/server/role",
            pack.id
        ));
    }
    if let Some(metadata) = &pack.role_metadata {
        if pack.role_id.is_none() {
            return Err(format!(
                "适配源 {} 配置了 roleMetadata，但没有配置 roleId",
                pack.id
            ));
        }
        safe_relative_path(&metadata.fight_stat_directory)?;
        if let Some(directory) = &metadata.log_directory {
            safe_relative_path(directory)?;
        }
    }

    let mut group_ids = HashSet::new();
    for group in &pack.groups {
        if !group_ids.insert(&group.id) {
            return Err(format!("适配源 {} 存在重复分组 {}", pack.id, group.id));
        }
        let mut rule_ids = HashSet::new();
        for rule in &group.files {
            if !rule_ids.insert(&rule.id) {
                return Err(format!("分组 {} 存在重复规则 {}", group.id, rule.id));
            }
            if rule.target.trim().is_empty() {
                return Err(format!("规则 {}/{} 缺少 target", group.id, rule.id));
            }
            if rule.inline_base64.is_none() && rule.source_candidates.is_empty() {
                return Err(format!(
                    "规则 {}/{} 必须提供 sourceCandidates 或 inlineBase64",
                    group.id, rule.id
                ));
            }
        }
    }
    Ok(())
}

pub fn resolve_data_root(
    pack: &AdapterPack,
    installation_root: &Path,
    variant_id: &str,
) -> Result<PathBuf, String> {
    let variant = pack
        .variants
        .get(variant_id)
        .ok_or_else(|| format!("适配源 {} 不支持变体 {}", pack.id, variant_id))?;
    let installation_root = installation_root
        .canonicalize()
        .map_err(|error| format!("游戏目录不可用 {}: {error}", installation_root.display()))?;

    for relative in &variant.data_roots {
        let relative = safe_relative_path(relative)?;
        let candidate = installation_root.join(relative);
        if !candidate.is_dir() {
            continue;
        }
        let markers_exist = pack.root_markers.iter().all(|marker| {
            safe_relative_path(marker)
                .map(|path| candidate.join(path).exists())
                .unwrap_or(false)
        });
        if markers_exist {
            return candidate
                .canonicalize()
                .map_err(|error| format!("解析数据目录失败 {}: {error}", candidate.display()));
        }
    }

    Err(format!(
        "{} 中没有找到 {} 变体的数据目录",
        installation_root.display(),
        variant_id
    ))
}

pub fn scan_roles(
    pack: &AdapterPack,
    installation_root: &Path,
    variant_id: &str,
) -> Result<Vec<SyncRole>, String> {
    let data_root = resolve_data_root(pack, installation_root, variant_id)?;
    let base = data_root.join(safe_relative_path(&pack.role_catalog.base)?);
    if !base.is_dir() {
        return Ok(Vec::new());
    }

    let ignored = pack
        .role_catalog
        .ignore
        .iter()
        .map(|value| value.to_ascii_lowercase())
        .collect::<HashSet<_>>();
    let mut roles = Vec::new();
    for account in child_directories(&base)? {
        let account_name = file_name(&account)?;
        if ignored.contains(&account_name.to_ascii_lowercase()) {
            continue;
        }
        for area in child_directories(&account)? {
            let area_name = file_name(&area)?;
            for server in child_directories(&area)? {
                let server_name = file_name(&server)?;
                for role in child_directories(&server)? {
                    roles.push(SyncRole {
                        account: account_name.clone(),
                        area: area_name.clone(),
                        server: server_name.clone(),
                        role: file_name(&role)?,
                    });
                }
            }
        }
    }
    roles.sort_by(|left, right| {
        (&left.account, &left.area, &left.server, &left.role).cmp(&(
            &right.account,
            &right.area,
            &right.server,
            &right.role,
        ))
    });
    Ok(roles)
}

/// Reads optional role metadata produced by JX3 plugins. The identity used by
/// callers stays role/server; account and sync paths remain independent from
/// this best-effort enrichment.
pub fn scan_role_sects(
    pack: &AdapterPack,
    installation_root: &Path,
    variant_id: &str,
) -> Result<HashMap<(String, String), String>, String> {
    let Some(metadata) = &pack.role_metadata else {
        return Ok(HashMap::new());
    };
    if metadata.hook != "jx3-my-role-metadata-v1" {
        return Err(format!(
            "适配源 {} 使用不支持的角色元数据 hook: {}",
            pack.id, metadata.hook
        ));
    }
    let role_id = pack
        .role_id
        .as_ref()
        .ok_or_else(|| format!("适配源 {} 缺少 roleId 配置", pack.id))?;
    let variant = pack
        .variants
        .get(variant_id)
        .ok_or_else(|| format!("适配源 {} 不支持变体 {}", pack.id, variant_id))?;
    let variables = variant
        .variables
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<HashMap<_, _>>();
    let data_root = resolve_data_root(pack, installation_root, variant_id)?;
    let mut result = HashMap::new();

    for search_root in &role_id.search_roots {
        let expanded = expand_template(search_root, &variables)?;
        let root = data_root.join(safe_relative_path(&expanded)?);
        if !root.is_dir() {
            continue;
        }
        for role_directory in child_directories(&root)? {
            let info_path = role_directory.join(safe_relative_path(&role_id.info_file)?);
            let Ok(bytes) = fs::read(&info_path) else {
                continue;
            };
            let text = decode_jx3_text(&bytes);
            let Some(name) = lua_string_field(&text, "name") else {
                continue;
            };
            let Some(server) = lua_string_field(&text, "server") else {
                continue;
            };
            let uid = lua_string_field(&text, "uid").or_else(|| {
                role_directory
                    .file_name()
                    .and_then(|value| value.to_str())
                    .and_then(|value| value.split('@').next())
                    .map(str::to_string)
            });
            let Some(uid) = uid else {
                continue;
            };
            if let Some(sect) = detect_jx3_role_sect(metadata, &role_directory, &uid) {
                result.insert((name, server), sect);
            }
        }
    }

    Ok(result)
}

fn detect_jx3_role_sect(
    rule: &super::model::RoleMetadataRule,
    role_directory: &Path,
    uid: &str,
) -> Option<String> {
    let fight_stat_directory =
        role_directory.join(safe_relative_path(&rule.fight_stat_directory).ok()?);
    for path in newest_files(&fight_stat_directory, false, 256) {
        let Ok(bytes) = fs::read(path) else {
            continue;
        };
        let text = decode_jx3_text(&bytes);
        let Some(force_id) = parse_my_fight_stat_force_id(&text, uid) else {
            continue;
        };
        if let Some(sect) = rule.force_map.get(&force_id.to_string()) {
            return Some(sect.clone());
        }
    }

    let log_directory = rule.log_directory.as_ref()?;
    let log_directory = role_directory.join(safe_relative_path(log_directory).ok()?);
    for path in newest_files(&log_directory, true, 256) {
        let Ok(bytes) = fs::read(path) else {
            continue;
        };
        let text = decode_jx3_text(&bytes);
        let Some(mount_id) = parse_role_bind_mount(&text, uid) else {
            continue;
        };
        if let Some(sect) = rule.mount_map.get(&mount_id.to_string()) {
            return Some(sect.clone());
        }
    }

    None
}

fn newest_files(directory: &Path, recursive: bool, limit: usize) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_files(directory, recursive, 0, &mut files);
    files.sort_by(|left, right| {
        let left_modified = fs::metadata(left).and_then(|value| value.modified()).ok();
        let right_modified = fs::metadata(right).and_then(|value| value.modified()).ok();
        right_modified
            .cmp(&left_modified)
            .then_with(|| right.cmp(left))
    });
    files.truncate(limit);
    files
}

fn collect_files(directory: &Path, recursive: bool, depth: usize, result: &mut Vec<PathBuf>) {
    if !directory.is_dir() || depth > 4 {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            result.push(path);
        } else if recursive && path.is_dir() {
            collect_files(&path, true, depth + 1, result);
        }
    }
}

fn lua_string_field(text: &str, field: &str) -> Option<String> {
    let marker = format!("{field}=\"");
    let value = text.split_once(&marker)?.1;
    let end = value.find('"')?;
    Some(value[..end].to_string())
}

fn parse_my_fight_stat_force_id(text: &str, uid: &str) -> Option<u32> {
    let player_marker = format!("::U{uid}/");
    let player_id = take_ascii_digits(text.split_once(&player_marker)?.1)?;
    let force_table = text.split_once("[10]={")?.1;
    let force_table = force_table.split_once('}')?.0;
    let force_marker = format!("[{player_id}]=");
    take_ascii_digits(force_table.split_once(&force_marker)?.1)
}

fn parse_role_bind_mount(text: &str, uid: &str) -> Option<u32> {
    let uid_marker = format!("jx3id={uid}");
    for section in text.split("/role/bind").skip(1) {
        let body = &section[..section.len().min(4096)];
        if body.starts_with("/love") || !body.contains(&uid_marker) {
            continue;
        }
        let mount = body.split_once("mount=")?.1;
        return take_ascii_digits(mount);
    }
    None
}

fn take_ascii_digits(value: &str) -> Option<u32> {
    let end = value
        .find(|character: char| !character.is_ascii_digit())
        .unwrap_or(value.len());
    if end == 0 {
        return None;
    }
    value[..end].parse().ok()
}

pub fn endpoint_variables(
    pack: &AdapterPack,
    endpoint: &RoleEndpoint,
    data_root: &Path,
) -> Result<(HashMap<String, String>, Option<String>), String> {
    let variant = pack
        .variants
        .get(&endpoint.variant)
        .ok_or_else(|| format!("适配源 {} 不支持变体 {}", pack.id, endpoint.variant))?;
    let mut variables = variant
        .variables
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<HashMap<_, _>>();
    variables.insert("account".into(), endpoint.role.account.clone());
    variables.insert("area".into(), endpoint.role.area.clone());
    variables.insert("server".into(), endpoint.role.server.clone());
    variables.insert("role".into(), endpoint.role.role.clone());

    let role_id = match &pack.role_id {
        Some(rule) if rule.hook == "jx3-role-id-v1" => {
            resolve_jx3_role_id(rule, data_root, &endpoint.role, &variables)?
        }
        Some(rule) => return Err(format!("不支持的角色 ID Hook: {}", rule.hook)),
        None => None,
    };
    if let Some(value) = &role_id {
        variables.insert("roleId".into(), value.clone());
    }
    Ok((variables, role_id))
}

pub fn expand_template(
    template: &str,
    variables: &HashMap<String, String>,
) -> Result<String, String> {
    let mut value = template.to_string();
    for (key, replacement) in variables {
        value = value.replace(&format!("{{{key}}}"), replacement);
    }
    if let Some(start) = value.find('{') {
        let remaining = &value[start..];
        return Err(format!("路径模板缺少变量: {remaining}"));
    }
    Ok(value)
}

pub fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let normalized = value.replace('\\', "/");
    let path = Path::new(&normalized);
    let mut safe = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => safe.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("不安全的相对路径: {value}"));
            }
        }
    }
    Ok(safe)
}

fn resolve_jx3_role_id(
    rule: &super::model::RoleIdRule,
    data_root: &Path,
    role: &SyncRole,
    variables: &HashMap<String, String>,
) -> Result<Option<String>, String> {
    for search_root in &rule.search_roots {
        let expanded = expand_template(search_root, variables)?;
        let root = data_root.join(safe_relative_path(&expanded)?);
        if !root.is_dir() {
            continue;
        }
        let mut matches = Vec::new();
        find_directories_named(&root, &role.role, 0, &mut matches)?;
        for role_directory in matches {
            let Some(parent) = role_directory.parent() else {
                continue;
            };
            let info_path = parent.join(safe_relative_path(&rule.info_file)?);
            let Ok(bytes) = fs::read(&info_path) else {
                continue;
            };
            let text = decode_jx3_text(&bytes);
            if text.contains(&format!("relserver=\"{}\"", role.server))
                || text.contains(&format!("server=\"{}\"", role.server))
            {
                let parent_name = file_name(parent)?;
                return Ok(parent_name.split('@').next().map(str::to_string));
            }
        }
    }
    Ok(None)
}

fn decode_jx3_text(bytes: &[u8]) -> String {
    let payload = if bytes.starts_with(b"CNDK") && bytes.len() >= 16 {
        &bytes[16..]
    } else {
        bytes
    };
    if let Ok(value) = std::str::from_utf8(payload) {
        return value.to_string();
    }
    let (value, _, _) = GBK.decode(payload);
    value.into_owned()
}

fn find_directories_named(
    directory: &Path,
    name: &str,
    depth: usize,
    result: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if depth > 8 {
        return Ok(());
    }
    for child in child_directories(directory)? {
        if child.file_name().and_then(|value| value.to_str()) == Some(name) {
            result.push(child.clone());
        }
        find_directories_named(&child, name, depth + 1, result)?;
    }
    Ok(())
}

fn child_directories(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = fs::read_dir(directory)
        .map_err(|error| format!("读取目录失败 {}: {error}", directory.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    result.sort();
    Ok(result)
}

fn file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .ok_or_else(|| format!("目录名不是有效文本: {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::{parse_my_fight_stat_force_id, parse_role_bind_mount};

    #[test]
    fn parses_local_force_from_my_fight_stat() {
        let text = r#"return {"zhcn_hd::双线区_天鹅坪::1::0::42/1::U252201579167740672/42",[10]={[42]=214,[99]=3}}"#;
        assert_eq!(
            parse_my_fight_stat_force_id(text, "252201579167740672"),
            Some(214)
        );
    }

    #[test]
    fn parses_mount_from_role_bind_log() {
        let text = "POST /role/bind [BODY]mount=29&jx3id=252201579167740672[/BODY]";
        assert_eq!(parse_role_bind_mount(text, "252201579167740672"), Some(29));
    }
}
