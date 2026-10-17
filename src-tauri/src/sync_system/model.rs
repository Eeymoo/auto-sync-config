use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterPack {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub hook: Option<String>,
    pub root_markers: Vec<String>,
    pub variants: BTreeMap<String, VariantRule>,
    pub role_catalog: RoleCatalogRule,
    #[serde(default)]
    pub role_id: Option<RoleIdRule>,
    #[serde(default)]
    pub role_metadata: Option<RoleMetadataRule>,
    pub groups: Vec<SyncGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantRule {
    pub label: String,
    pub data_roots: Vec<String>,
    #[serde(default)]
    pub variables: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleCatalogRule {
    pub base: String,
    pub levels: Vec<String>,
    #[serde(default)]
    pub ignore: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleIdRule {
    pub hook: String,
    pub search_roots: Vec<String>,
    pub info_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleMetadataRule {
    pub hook: String,
    pub fight_stat_directory: String,
    #[serde(default)]
    pub log_directory: Option<String>,
    #[serde(default)]
    pub force_map: BTreeMap<String, String>,
    #[serde(default)]
    pub mount_map: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncGroup {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub default_enabled: bool,
    pub files: Vec<FileRule>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FileRuleMode {
    #[default]
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRule {
    pub id: String,
    #[serde(default)]
    pub mode: FileRuleMode,
    #[serde(default)]
    pub source_candidates: Vec<String>,
    pub target: String,
    #[serde(default)]
    pub optional: bool,
    #[serde(default)]
    pub inline_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterSummary {
    pub id: String,
    pub name: String,
    pub version: String,
    pub variants: Vec<VariantSummary>,
    pub groups: Vec<GroupSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantSummary {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub default_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncRole {
    pub account: String,
    pub area: String,
    pub server: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleEndpoint {
    pub root: String,
    pub variant: String,
    pub role: SyncRole,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRequest {
    pub adapter_id: String,
    pub source: RoleEndpoint,
    pub target: RoleEndpoint,
    #[serde(default)]
    pub groups: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SyncAction {
    Create,
    Replace,
    Unchanged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedFile {
    pub group_id: String,
    pub rule_id: String,
    pub logical_path: String,
    pub source: String,
    pub target: String,
    pub size: u64,
    pub sha256: String,
    pub action: SyncAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlan {
    pub adapter_id: String,
    pub adapter_version: String,
    pub source_data_root: String,
    pub target_data_root: String,
    pub groups: Vec<String>,
    pub files: Vec<PlannedFile>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TransactionState {
    Preparing,
    Committed,
    RolledBack,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub target_relative: String,
    pub incoming_relative: String,
    pub backup_relative: Option<String>,
    pub existed_before: bool,
    pub sha256_before: Option<String>,
    pub sha256_after: String,
    /// Content hash of the target file right after this transaction applied.
    /// Undo and redo verify the current file still matches this before
    /// touching it, so they never clobber edits made later.
    pub target_state_after: TargetState,
    /// Content hash of the target file right before the latest undo/redo
    /// transition, recorded at that time. The next transition verifies the
    /// current file still matches this before touching it.
    #[serde(default)]
    pub target_state_before_transition: Option<TargetState>,
}

/// What the target file looks like right now, used to detect edits made after
/// the transaction ran so undo/redo never silently overwrites newer data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TargetState {
    /// Expected content hash of the file at the target path.
    Present(String),
    Absent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionJournal {
    pub schema_version: u32,
    pub id: String,
    pub adapter_id: String,
    pub adapter_version: String,
    pub created_unix_ms: u128,
    pub state: TransactionState,
    pub target_data_root: String,
    pub entries: Vec<JournalEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncExecutionResult {
    pub transaction_id: String,
    pub changed_files: usize,
    pub unchanged_files: usize,
    pub history_path: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTransitionResult {
    pub transaction_id: String,
    pub state: TransactionState,
    pub restored_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionSummary {
    pub id: String,
    pub adapter_id: String,
    pub adapter_version: String,
    pub created_unix_ms: u128,
    pub state: TransactionState,
    pub file_count: usize,
    pub target_data_root: String,
}
