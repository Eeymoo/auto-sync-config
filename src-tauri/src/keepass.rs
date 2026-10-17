use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use keepass_rs::{
    Argon2KdfEngine, CompositeKey, Database, DatabaseVersion, Entry, EntryField, Group, KdfEngine,
    NodeId, ProtectedString,
};
use serde::{Deserialize, Serialize};

const JX3_GROUP: &str = "jx3";
const CHARACTERS_FIELD: &str = "asc_characters";
const DEFAULT_VAULT_FILE: &str = "jx3-accounts.kdbx";
const AUTO_LOCK_AFTER: Duration = Duration::from_secs(5 * 60);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub unlocked: bool,
    pub path: Option<String>,
    pub name: Option<String>,
    pub hello_available: bool,
    pub hello_enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub server: String,
    #[serde(default)]
    pub level: Option<u32>,
    #[serde(default)]
    pub sect: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CharactersDoc {
    #[serde(default = "doc_version")]
    version: u32,
    #[serde(default)]
    characters: Vec<Character>,
}

fn doc_version() -> u32 {
    1
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub id: String,
    pub title: String,
    pub username: String,
    pub note: String,
    pub characters: Vec<Character>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    pub title: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub characters: Vec<Character>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialsInput {
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub key_file: Option<String>,
    #[serde(default)]
    pub key_file_base64: Option<String>,
}

pub struct VaultState {
    db: Option<Database>,
    path: Option<PathBuf>,
    key: Option<CompositeKey>,
    last_used: Option<Instant>,
    fingerprint: Option<(u64, u64)>,
    backup_done: bool,
}

impl VaultState {
    pub fn new() -> Self {
        Self {
            db: None,
            path: None,
            key: None,
            last_used: None,
            fingerprint: None,
            backup_done: false,
        }
    }

    fn is_unlocked(&self) -> bool {
        self.db.is_some() && self.key.is_some()
    }

    fn lock(&mut self) {
        self.db = None;
        self.key = None;
        self.last_used = None;
        self.fingerprint = None;
        self.backup_done = false;
    }

    /// Returns true and clears state when the idle timeout elapsed.
    fn auto_lock_check(&mut self) -> bool {
        if self.is_unlocked()
            && self
                .last_used
                .is_some_and(|t| t.elapsed() >= AUTO_LOCK_AFTER)
        {
            self.lock();
            return true;
        }
        false
    }

    fn touch(&mut self) {
        self.last_used = Some(Instant::now());
    }

    fn open_db(&mut self) -> Result<&mut Database, String> {
        self.auto_lock_check();
        self.touch();
        self.db.as_mut().ok_or_else(|| "密码库未解锁".to_string())
    }

    fn db(&mut self) -> Result<&Database, String> {
        self.auto_lock_check();
        self.touch();
        self.db.as_ref().ok_or_else(|| "密码库未解锁".to_string())
    }
}

pub type SharedVault = Mutex<VaultState>;

/// Result of scanning the JX3 userdata directory for accounts and roles.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScannedAccount {
    pub username: String,
    pub characters: Vec<Character>,
    /// True when an account with this username already exists in the vault.
    pub exists: bool,
}

/// Scans `userdata` under the given game path for account directories and
/// their role folders, without reading any file contents (dirs only).
pub fn scan_userdata(
    game_path: String,
    state: &SharedVault,
    role_sects: &HashMap<(String, String), String>,
) -> Result<Vec<ScannedAccount>, String> {
    let userdata = PathBuf::from(&game_path).join("userdata");
    if !userdata.is_dir() {
        return Err(format!("userdata 目录不存在: {}", userdata.display()));
    }

    let mut result: Vec<ScannedAccount> = Vec::new();
    let accounts = fs::read_dir(&userdata).map_err(|e| format!("无法读取 userdata: {e}"))?;
    for entry in accounts.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let username = entry.file_name().to_string_lossy().to_string();
        if username == "fight_stat" {
            continue;
        }

        let mut characters: Vec<Character> = Vec::new();
        if let Ok(regions) = fs::read_dir(&path) {
            for region in regions.flatten() {
                let region_path = region.path();
                if !region_path.is_dir() {
                    continue;
                }
                if let Ok(servers) = fs::read_dir(&region_path) {
                    for server in servers.flatten() {
                        let server_path = server.path();
                        if !server_path.is_dir() {
                            continue;
                        }
                        let server_name = server.file_name().to_string_lossy().to_string();
                        if let Ok(roles) = fs::read_dir(&server_path) {
                            for role in roles.flatten() {
                                if !role.path().is_dir() {
                                    continue;
                                }
                                // Role folder names may carry "@隐归" style suffixes; strip them.
                                let raw = role.file_name().to_string_lossy().to_string();
                                let name = raw.split('@').next().unwrap_or(&raw).to_string();
                                let sect = role_sects
                                    .get(&(raw.clone(), server_name.clone()))
                                    .or_else(|| {
                                        role_sects.get(&(name.clone(), server_name.clone()))
                                    })
                                    .cloned()
                                    .unwrap_or_default();
                                characters.push(Character {
                                    id: String::new(),
                                    name,
                                    server: server_name.clone(),
                                    level: None,
                                    sect,
                                    note: String::new(),
                                });
                            }
                        }
                    }
                }
            }
        }

        result.push(ScannedAccount {
            username,
            characters,
            exists: false,
        });
    }

    // Mark accounts that already exist in the vault.
    if let Some(db) = state.lock().map_err(|_| "内部状态错误".to_string())?.db.as_ref() {
        if let Some(group_id) = find_jx3_group(db) {
            let existing: Vec<String> = db
                .get_entries_in_group(&group_id)
                .iter()
                .map(|e| e.username.as_str().to_string())
                .collect();
            for acc in &mut result {
                acc.exists = existing.iter().any(|u| u == &acc.username);
            }
        }
    }

    result.sort_by(|a, b| a.username.cmp(&b.username));
    Ok(result)
}

/// Imports selected scanned accounts. Skips accounts whose username already
/// exists. Returns the number imported.
pub fn import_accounts(state: &SharedVault, accounts: Vec<AccountInput>) -> Result<u32, String> {
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    let mut imported = 0u32;
    {
        let db = guard.open_db()?;
        let group_id = ensure_jx3_group(db)?;
        let mut existing: Vec<String> = db
            .get_entries_in_group(&group_id)
            .iter()
            .map(|e| e.username.as_str().to_string())
            .collect();

        for input in accounts {
            let username = input.username.trim();
            if existing.iter().any(|u| u == username) {
                continue;
            }
            let entry_id = new_entry_id();
            let mut entry = Entry::new(entry_id);
            entry.title = input.title.trim().to_string();
            entry.username = ProtectedString::new_plain(username);
            entry.password = ProtectedString::new_protected(&input.password);
            entry.notes = ProtectedString::new_plain(&input.note);
            write_characters(&mut entry, normalize_characters(input.characters))?;
            entry.autotype_enabled = true;
            if db.add_entry(entry, &group_id) {
                imported += 1;
                // Keep the in-memory snapshot in sync so duplicates within the
                // same batch are skipped too.
                existing.push(username.to_string());
            }
        }
        if imported > 0 {
            guard.db.as_mut().unwrap().mark_modified();
        }
    }
    if imported > 0 {
        save_atomic(&mut guard)?;
    }
    Ok(imported)
}

fn map_db_error(e: &keepass_rs::DatabaseError) -> String {
    use keepass_rs::DatabaseError::*;
    match e {
        InvalidKey | InvalidCredentials => "解锁失败：主密码或密钥文件不正确".to_string(),
        DecryptionError(_) => "解锁失败：主密码或密钥文件不正确".to_string(),
        Io(io) => format!("文件读写失败：{io}"),
        other => format!("密码库错误：{other:?}"),
    }
}

fn file_fingerprint(path: &Path) -> Result<(u64, u64), String> {
    let meta = fs::metadata(path).map_err(|e| format!("无法读取文件信息：{e}"))?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok((meta.len(), modified))
}

/// Builds the composite key. Existing vaults may open with key file alone.
fn build_key(input: &CredentialsInput) -> Result<CompositeKey, String> {
    let mut key = CompositeKey::new();
    if !input.password.is_empty() {
        key = key.with_password(input.password.as_bytes());
    }
    if let Some(kf) = &input.key_file {
        let data = fs::read(kf).map_err(|e| format!("无法读取密钥文件：{e}"))?;
        key = key.with_key_file(&data);
    } else if let Some(b64) = &input.key_file_base64 {
        let data = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("密钥文件数据无效：{e}"))?;
        key = key.with_key_file(&data);
    }
    if !key.has_password() && !key.has_key_file() {
        return Err("需要主密码或密钥文件".to_string());
    }
    Ok(key)
}

fn new_key_bytes() -> Result<Vec<u8>, String> {
    let mut buf = vec![0u8; 32];
    getrandom::getrandom(&mut buf).map_err(|e| format!("无法生成随机密钥：{e}"))?;
    Ok(buf)
}

fn new_entry_id() -> NodeId {
    NodeId::new_uuid()
}

fn node_id_string(id: &NodeId) -> String {
    match id {
        NodeId::Uuid(u) => u.hyphenated().to_string(),
        NodeId::Int(i) => i.to_string(),
    }
}

fn parse_node_id(s: &str) -> Result<NodeId, String> {
    if let Ok(u) = uuid::Uuid::parse_str(s) {
        return Ok(NodeId::Uuid(u));
    }
    if let Ok(i) = s.parse::<i32>() {
        return Ok(NodeId::Int(i));
    }
    Err("无效的条目 ID".to_string())
}

fn find_jx3_group(db: &Database) -> Option<NodeId> {
    let root_id = db.root_group_id?;
    let root = db.groups.get(&root_id)?;
    root.child_group_ids
        .iter()
        .find(|id| {
            db.groups
                .get(id)
                .is_some_and(|g| g.title == JX3_GROUP && !db.is_recycle_bin(id))
        })
        .copied()
}

fn ensure_jx3_group(db: &mut Database) -> Result<NodeId, String> {
    if let Some(id) = find_jx3_group(db) {
        return Ok(id);
    }
    let root_id = db
        .root_group_id
        .ok_or_else(|| "密码库缺少根分组".to_string())?;
    let id = new_entry_id();
    let mut group = Group::new(id);
    group.title = JX3_GROUP.to_string();
    if !db.add_group(group, &root_id) {
        return Err("创建 jx3 分组失败".to_string());
    }
    db.mark_modified();
    Ok(id)
}

fn read_characters(entry: &Entry) -> Vec<Character> {
    entry
        .custom_fields
        .iter()
        .find(|f| f.name == CHARACTERS_FIELD)
        .and_then(|f| serde_json::from_str::<CharactersDoc>(f.value.as_str()).ok())
        .map(|doc| doc.characters)
        .unwrap_or_default()
}

fn write_characters(entry: &mut Entry, characters: Vec<Character>) -> Result<(), String> {
    let doc = CharactersDoc {
        version: doc_version(),
        characters,
    };
    let json = serde_json::to_string(&doc).map_err(|e| format!("角色数据序列化失败：{e}"))?;
    entry.custom_fields.retain(|f| f.name != CHARACTERS_FIELD);
    entry.custom_fields.push(EntryField {
        name: CHARACTERS_FIELD.to_string(),
        value: ProtectedString::new_protected(&json),
        is_protected: true,
    });
    Ok(())
}

fn to_summary(entry: &Entry) -> AccountSummary {
    AccountSummary {
        id: node_id_string(&entry.id),
        title: entry.title.clone(),
        username: entry.username.as_str().to_string(),
        note: entry.notes.as_str().to_string(),
        characters: read_characters(entry),
    }
}

fn normalize_characters(mut characters: Vec<Character>) -> Vec<Character> {
    for c in &mut characters {
        if c.id.is_empty() {
            c.id = uuid::Uuid::new_v4().hyphenated().to_string();
        }
    }
    characters
}

fn validate_account(input: &AccountInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("请填写账号名称".to_string());
    }
    if input.username.trim().is_empty() {
        return Err("请填写账号".to_string());
    }
    for c in &input.characters {
        if c.name.trim().is_empty() {
            return Err("角色名称不能为空".to_string());
        }
    }
    Ok(())
}

fn save_atomic(state: &mut VaultState) -> Result<(), String> {
    let path = state
        .path
        .clone()
        .ok_or_else(|| "未选择密码库".to_string())?;
    let key = state
        .key
        .as_ref()
        .ok_or_else(|| "密码库未解锁".to_string())?;
    let db = state
        .db
        .as_ref()
        .ok_or_else(|| "密码库未解锁".to_string())?;

    // Refuse to overwrite a file changed externally since open/last save.
    let current = file_fingerprint(&path)?;
    if let Some(fp) = state.fingerprint {
        if fp != current {
            return Err("密码库文件已被外部修改，为避免数据丢失请重新解锁后再编辑".to_string());
        }
    }

    // Keep one encrypted backup before the first modification of this session.
    if path.exists() && !state.backup_done {
        let backup = path.with_extension("kdbx.bak");
        fs::copy(&path, &backup).map_err(|e| format!("创建备份失败：{e}"))?;
        state.backup_done = true;
    }

    let tmp = path.with_extension("kdbx.tmp");
    let write_result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&tmp).map_err(|e| format!("写入失败：{e}"))?;
        keepass_rs::save_database(&mut file, db, key).map_err(|e| map_db_error(&e))?;
        drop(file);
        // Verify the written file can actually be reopened before replacing.
        let check = fs::File::open(&tmp).map_err(|e| format!("验证失败：{e}"))?;
        keepass_rs::open_database(check, key).map_err(|e| map_db_error(&e))?;
        fs::rename(&tmp, &path).map_err(|e| format!("替换文件失败：{e}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    write_result?;
    state.fingerprint = Some(file_fingerprint(&path)?);
    Ok(())
}

pub fn create_vault(
    state: &SharedVault,
    path: Option<String>,
    password: String,
    use_key_file: bool,
) -> Result<(VaultStatus, Option<String>), String> {
    if password.is_empty() {
        return Err("主密码不能为空".to_string());
    }
    let path = match path {
        Some(p) => PathBuf::from(p),
        None => default_vault_path()?,
    };
    if path.exists() {
        return Err("目标文件已存在，请换一个文件名".to_string());
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("创建目录失败：{e}"))?;
    }

    let mut key = CompositeKey::new().with_password(password.as_bytes());
    // The generated key file must be handed back to the caller; without it the
    // vault can never be reopened once this session ends.
    let key_file_base64 = if use_key_file {
        let bytes = new_key_bytes()?;
        key = key.with_key_file(&bytes);
        Some(base64::engine::general_purpose::STANDARD.encode(bytes))
    } else {
        None
    };

    let mut db = Database::new(DatabaseVersion::KDBX4);
    db.kdf_parameters = Some(Argon2KdfEngine::argon2id().default_parameters());
    db.name = "剑网3账号".to_string();
    let root_id = new_entry_id();
    let mut root = Group::new(root_id);
    root.title = "剑网3账号".to_string();
    db.groups.insert(root_id, root);
    db.root_group_id = Some(root_id);
    ensure_jx3_group(&mut db)?;

    let mut file = fs::File::create(&path).map_err(|e| format!("创建密码库失败：{e}"))?;
    keepass_rs::save_database(&mut file, &db, &key).map_err(|e| map_db_error(&e))?;
    drop(file);
    // Round-trip check so creation never reports success on a broken file.
    let check = fs::File::open(&path).map_err(|e| format!("验证失败：{e}"))?;
    let loaded = keepass_rs::open_database(check, &key).map_err(|e| map_db_error(&e))?;

    let fp = file_fingerprint(&path)?;
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    guard.db = Some(loaded);
    guard.path = Some(path.clone());
    guard.key = Some(key);
    guard.touch();
    guard.fingerprint = Some(fp);
    guard.backup_done = true; // brand new file, no pre-existing content to preserve
    Ok((status_of(&guard), key_file_base64))
}

pub fn open_vault(
    state: &SharedVault,
    path: String,
    input: CredentialsInput,
) -> Result<VaultStatus, String> {
    let path = PathBuf::from(&path);
    let key = build_key(&input)?;
    let file = fs::File::open(&path).map_err(|e| format!("无法打开密码库：{e}"))?;
    let db = keepass_rs::open_database(file, &key).map_err(|e| map_db_error(&e))?;
    if db.is_read_only {
        return Err("该密码库以只读方式打开，无法编辑".to_string());
    }
    let fp = file_fingerprint(&path)?;
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    guard.db = Some(db);
    guard.path = Some(path);
    guard.key = Some(key);
    guard.touch();
    guard.fingerprint = Some(fp);
    guard.backup_done = false;
    Ok(status_of(&guard))
}

pub fn unlock_with_hello(
    state: &SharedVault,
    path: String,
    password: String,
    key_file_base64: Option<String>,
) -> Result<VaultStatus, String> {
    open_vault(
        state,
        path,
        CredentialsInput {
            password,
            key_file: None,
            key_file_base64,
        },
    )
}

pub fn lock_vault(state: &SharedVault) -> Result<(), String> {
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    guard.lock();
    Ok(())
}

fn status_of(state: &VaultState) -> VaultStatus {
    VaultStatus {
        unlocked: state.is_unlocked(),
        path: state.path.as_ref().map(|p| p.to_string_lossy().to_string()),
        name: state.db.as_ref().map(|d| d.name.clone()),
        hello_available: hello::check_available(),
        hello_enabled: hello::has_stored_credentials(),
    }
}

pub fn get_status(state: &SharedVault) -> Result<VaultStatus, String> {
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    guard.auto_lock_check();
    Ok(status_of(&guard))
}

pub fn list_accounts(state: &SharedVault) -> Result<Vec<AccountSummary>, String> {
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    let db = guard.db()?;
    let group_id = match find_jx3_group(db) {
        Some(id) => id,
        None => return Ok(Vec::new()),
    };
    let mut accounts: Vec<AccountSummary> = db
        .get_entries_in_group(&group_id)
        .into_iter()
        .map(to_summary)
        .collect();
    accounts.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(accounts)
}

pub fn save_account(
    state: &SharedVault,
    id: Option<String>,
    input: AccountInput,
) -> Result<AccountSummary, String> {
    validate_account(&input)?;
    let characters = normalize_characters(input.characters.clone());
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    let mut created_id: Option<NodeId> = None;
    {
        let db = guard.open_db()?;
        let group_id = ensure_jx3_group(db)?;
        match &id {
            None => {
                let entry_id = new_entry_id();
                let mut entry = Entry::new(entry_id);
                entry.title = input.title.trim().to_string();
                entry.username = ProtectedString::new_plain(input.username.trim());
                entry.password = ProtectedString::new_protected(&input.password);
                entry.notes = ProtectedString::new_plain(&input.note);
                write_characters(&mut entry, characters)?;
                entry.autotype_enabled = true;
                if !db.add_entry(entry, &group_id) {
                    return Err("添加账号失败".to_string());
                }
                created_id = Some(entry_id);
            }
            Some(id) => {
                let entry_id = parse_node_id(id)?;
                let entry = db
                    .get_entry_mut(&entry_id)
                    .ok_or_else(|| "账号不存在".to_string())?;
                entry.title = input.title.trim().to_string();
                entry.username = ProtectedString::new_plain(input.username.trim());
                if !input.password.is_empty() {
                    entry.password = ProtectedString::new_protected(&input.password);
                }
                entry.notes = ProtectedString::new_plain(&input.note);
                write_characters(entry, characters)?;
                entry.last_modification_time = keepass_rs::DateInstant::now();
            }
        }
        let db = guard.db.as_mut().unwrap();
        db.mark_modified();
    }
    save_atomic(&mut guard)?;

    // Return the updated summary.
    let db = guard
        .db
        .as_ref()
        .ok_or_else(|| "密码库未解锁".to_string())?;
    let entry = match (&id, created_id) {
        (Some(id), _) => db.get_entry(&parse_node_id(id)?),
        (None, Some(entry_id)) => db.get_entry(&entry_id),
        (None, None) => None,
    };
    entry
        .map(to_summary)
        .ok_or_else(|| "读取保存结果失败".to_string())
}

pub fn delete_account(state: &SharedVault, id: String) -> Result<(), String> {
    let entry_id = parse_node_id(&id)?;
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    {
        let db = guard.open_db()?;
        let in_jx3 = find_jx3_group(db).is_some_and(|g| {
            db.groups
                .get(&g)
                .is_some_and(|grp| grp.child_entry_ids.contains(&entry_id))
        });
        if !in_jx3 {
            return Err("该账号不在 jx3 分组中".to_string());
        }
        db.remove_entry(&entry_id, true)
            .ok_or_else(|| "账号不存在".to_string())?;
        db.mark_modified();
    }
    save_atomic(&mut guard)
}

/// Reveals credentials by entry ID. This is also the seam a future
/// auto-login command will call without re-exposing secrets to the frontend.
pub fn get_credentials(state: &SharedVault, id: String) -> Result<(String, String), String> {
    let entry_id = parse_node_id(&id)?;
    let mut guard = state.lock().map_err(|_| "内部状态错误".to_string())?;
    let db = guard.db()?;
    let entry = db
        .get_entry(&entry_id)
        .ok_or_else(|| "账号不存在".to_string())?;
    Ok((
        entry.username.as_str().to_string(),
        entry.password.as_str().to_string(),
    ))
}

pub fn default_vault_path() -> Result<PathBuf, String> {
    let base = std::env::var("APPDATA").map_err(|_| "无法定位应用数据目录".to_string())?;
    Ok(PathBuf::from(base)
        .join("com.eeymoo.auto-sync-config")
        .join(DEFAULT_VAULT_FILE))
}

pub fn default_vault_path_string() -> Result<String, String> {
    Ok(default_vault_path()?.to_string_lossy().to_string())
}

/// Windows Hello convenience unlock: verify the user, then read the
/// DPAPI-protected master credentials stored for this machine/user.
#[cfg(windows)]
pub mod hello {
    use super::*;
    use base64::Engine;
    use windows::core::HSTRING;
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
    };
    use windows::Win32::Foundation::{LocalFree, HLOCAL, HWND};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };
    use windows::Win32::System::WinRT::IUserConsentVerifierInterop;

    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct StoredCredentials {
        path: String,
        #[serde(default)]
        key_file: Option<String>,
        password_blob: String,
    }

    fn store_path() -> Result<PathBuf, String> {
        let base = std::env::var("APPDATA").map_err(|_| "无法定位应用数据目录".to_string())?;
        Ok(PathBuf::from(base)
            .join("com.eeymoo.auto-sync-config")
            .join("hello-credentials.json"))
    }

    pub fn has_stored_credentials() -> bool {
        store_path().map(|p| p.exists()).unwrap_or(false)
    }

    pub fn check_available() -> bool {
        (|| -> Result<bool, ()> {
            let op = UserConsentVerifier::CheckAvailabilityAsync().map_err(|_| ())?;
            let availability = op.get().map_err(|_| ())?;
            Ok(availability == UserConsentVerifierAvailability::Available)
        })()
        .unwrap_or(false)
    }

    fn verify(hwnd: isize) -> Result<(), String> {
        let availability = UserConsentVerifier::CheckAvailabilityAsync()
            .and_then(|op| op.get())
            .map_err(|e| format!("无法检测 Windows Hello：{e}"))?;
        if availability != UserConsentVerifierAvailability::Available {
            return Err("当前电脑未配置 Windows Hello（PIN 或生物识别）".to_string());
        }
        let message = HSTRING::from("验证身份以解锁密码库");
        let operation: windows::Foundation::IAsyncOperation<UserConsentVerificationResult> = unsafe {
            let interop: IUserConsentVerifierInterop =
                windows::core::factory::<UserConsentVerifier, IUserConsentVerifierInterop>()
                    .map_err(|e| format!("无法初始化 Windows Hello：{e}"))?;
            interop
                .RequestVerificationForWindowAsync(HWND(hwnd as *mut _), &message)
                .map_err(|e| format!("无法请求 Windows Hello 验证：{e}"))?
        };
        let result = operation
            .get()
            .map_err(|e| format!("Windows Hello 验证失败：{e}"))?;
        if result == UserConsentVerificationResult::Verified {
            Ok(())
        } else {
            Err("Windows Hello 验证未通过".to_string())
        }
    }

    fn dpapi_protect(data: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(
                &mut input,
                windows::core::PCWSTR::null(),
                None,
                None,
                None,
                0,
                &mut output,
            )
            .map_err(|e| format!("加密凭据失败：{e}"))?;
            let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            if !output.pbData.is_null() {
                let _ = LocalFree(HLOCAL(output.pbData as *mut _));
            }
            Ok(bytes)
        }
    }

    fn dpapi_unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(&mut input, None, None, None, None, 0, &mut output)
                .map_err(|e| format!("解密凭据失败：{e}"))?;
            let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            if !output.pbData.is_null() {
                let _ = LocalFree(HLOCAL(output.pbData as *mut _));
            }
            Ok(bytes)
        }
    }

    pub fn enable(
        hwnd: isize,
        path: String,
        password: String,
        key_file: Option<String>,
    ) -> Result<(), String> {
        verify(hwnd)?;
        let protected = dpapi_protect(password.as_bytes())?;
        let record = StoredCredentials {
            path,
            key_file,
            password_blob: base64::engine::general_purpose::STANDARD.encode(protected),
        };
        let file_path = store_path()?;
        if let Some(dir) = file_path.parent() {
            fs::create_dir_all(dir).map_err(|e| format!("创建目录失败：{e}"))?;
        }
        let json = serde_json::to_string(&record).map_err(|e| e.to_string())?;
        fs::write(&file_path, json).map_err(|e| format!("保存凭据失败：{e}"))
    }

    pub fn disable() -> Result<(), String> {
        let path = store_path()?;
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("删除凭据失败：{e}"))?;
        }
        Ok(())
    }

    pub fn verify_and_load(hwnd: isize) -> Result<(String, String, Option<Vec<u8>>), String> {
        verify(hwnd)?;
        let path = store_path()?;
        let json = fs::read_to_string(&path).map_err(|e| format!("读取凭据失败：{e}"))?;
        let record: StoredCredentials =
            serde_json::from_str(&json).map_err(|e| format!("凭据数据无效：{e}"))?;
        let blob = base64::engine::general_purpose::STANDARD
            .decode(&record.password_blob)
            .map_err(|e| format!("凭据数据无效：{e}"))?;
        let password_bytes = dpapi_unprotect(&blob)?;
        let password = String::from_utf8(password_bytes).map_err(|_| "凭据数据无效".to_string())?;
        let key_data = match &record.key_file {
            Some(kf) => Some(fs::read(kf).map_err(|e| format!("无法读取密钥文件：{e}"))?),
            None => None,
        };
        Ok((record.path, password, key_data))
    }
}

#[cfg(not(windows))]
pub mod hello {
    pub fn has_stored_credentials() -> bool {
        false
    }
    pub fn check_available() -> bool {
        false
    }
    pub fn enable(
        _hwnd: isize,
        _path: String,
        _password: String,
        _key_file: Option<String>,
    ) -> Result<(), String> {
        Err("Windows Hello 仅在 Windows 上可用".to_string())
    }
    pub fn disable() -> Result<(), String> {
        Ok(())
    }
    pub fn verify_and_load(_hwnd: isize) -> Result<(String, String, Option<Vec<u8>>), String> {
        Err("Windows Hello 仅在 Windows 上可用".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn test_db() -> Database {
        let mut db = Database::new(DatabaseVersion::KDBX4);
        db.kdf_parameters = Some(Argon2KdfEngine::argon2id().default_parameters());
        let root_id = NodeId::new_uuid();
        let mut root = Group::new(root_id);
        root.title = "Root".to_string();
        db.groups.insert(root_id, root);
        db.root_group_id = Some(root_id);
        db
    }

    #[test]
    fn jx3_group_is_created_under_root() {
        let mut db = test_db();
        let id = ensure_jx3_group(&mut db).unwrap();
        let root_id = db.root_group_id.unwrap();
        let root = db.groups.get(&root_id).unwrap();
        assert!(root.child_group_ids.contains(&id));
        // Second call returns the existing group instead of duplicating.
        assert_eq!(ensure_jx3_group(&mut db).unwrap(), id);
    }

    #[test]
    fn characters_round_trip_through_custom_field() {
        let mut entry = Entry::new(NodeId::new_uuid());
        let characters = vec![
            Character {
                id: "c1".to_string(),
                name: "琴萝".to_string(),
                server: "梦江南".to_string(),
                level: Some(120),
                sect: "changhai".to_string(),
                note: String::new(),
            },
            Character {
                id: "c2".to_string(),
                name: "道长".to_string(),
                server: "长安城".to_string(),
                level: None,
                sect: "chunyang".to_string(),
                note: "小号".to_string(),
            },
        ];
        write_characters(&mut entry, characters.clone()).unwrap();
        let loaded = read_characters(&entry);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].name, "琴萝");
        assert_eq!(loaded[0].level, Some(120));
        assert_eq!(loaded[1].sect, "chunyang");
    }

    #[test]
    fn characters_missing_field_returns_empty() {
        let entry = Entry::new(NodeId::new_uuid());
        assert!(read_characters(&entry).is_empty());
    }

    #[test]
    fn invalid_json_returns_empty_instead_of_failing() {
        let mut entry = Entry::new(NodeId::new_uuid());
        entry.custom_fields.push(EntryField {
            name: CHARACTERS_FIELD.to_string(),
            value: ProtectedString::new_plain("{broken"),
            is_protected: true,
        });
        assert!(read_characters(&entry).is_empty());
    }

    #[test]
    fn normalize_assigns_ids_to_new_characters() {
        let characters = normalize_characters(vec![Character {
            id: String::new(),
            name: "刀娘".to_string(),
            server: String::new(),
            level: None,
            sect: "badao".to_string(),
            note: String::new(),
        }]);
        assert!(!characters[0].id.is_empty());
    }

    #[test]
    fn validation_rejects_empty_username() {
        let input = AccountInput {
            title: "t".to_string(),
            username: " ".to_string(),
            password: "p".to_string(),
            note: String::new(),
            characters: vec![],
        };
        assert!(validate_account(&input).is_err());
    }

    #[test]
    fn create_save_reopen_vault_round_trip() {
        let dir = std::env::temp_dir().join(format!("asc-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.kdbx");
        let state: SharedVault = Mutex::new(VaultState::new());
        create_vault(
            &state,
            Some(path.to_string_lossy().to_string()),
            "pw123".to_string(),
            false,
        )
        .unwrap()
        .0;

        save_account(
            &state,
            None,
            AccountInput {
                title: "大号".to_string(),
                username: "user@example.com".to_string(),
                password: "secret".to_string(),
                note: String::new(),
                characters: vec![],
            },
        )
        .unwrap();
        lock_vault(&state).unwrap();

        let status = open_vault(
            &state,
            path.to_string_lossy().to_string(),
            CredentialsInput {
                password: "pw123".to_string(),
                key_file: None,
                key_file_base64: None,
            },
        )
        .unwrap();
        assert!(status.unlocked);
        let accounts = list_accounts(&state).unwrap();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].username, "user@example.com");
        let (_, password) = get_credentials(&state, accounts[0].id.clone()).unwrap();
        assert_eq!(password, "secret");

        lock_vault(&state).unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_with_wrong_password_fails() {
        let dir = std::env::temp_dir().join(format!("asc-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.kdbx");
        let state: SharedVault = Mutex::new(VaultState::new());
        create_vault(
            &state,
            Some(path.to_string_lossy().to_string()),
            "right".to_string(),
            false,
        )
        .unwrap()
        .0;
        lock_vault(&state).unwrap();
        let result = open_vault(
            &state,
            path.to_string_lossy().to_string(),
            CredentialsInput {
                password: "wrong".to_string(),
                key_file: None,
                key_file_base64: None,
            },
        );
        assert!(result.is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
