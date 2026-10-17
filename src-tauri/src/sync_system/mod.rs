mod adapter;
mod engine;
pub mod model;

use std::path::{Path, PathBuf};

pub use adapter::{scan_role_sects, scan_roles, AdapterRegistry};
pub use engine::{execute_sync, list_transactions, plan_sync, redo_transaction, undo_transaction};

pub fn source_directory(app_data_directory: &Path) -> Result<PathBuf, String> {
    let path = app_data_directory.join("sync-sources");
    std::fs::create_dir_all(&path)
        .map_err(|error| format!("创建同步源目录失败 {}: {error}", path.display()))?;
    Ok(path)
}

pub fn history_directory(app_data_directory: &Path) -> Result<PathBuf, String> {
    let path = app_data_directory.join("sync-history");
    std::fs::create_dir_all(&path)
        .map_err(|error| format!("创建同步历史目录失败 {}: {error}", path.display()))?;
    Ok(path)
}

pub fn load_registry(app_data_directory: &Path) -> Result<AdapterRegistry, String> {
    let sources = source_directory(app_data_directory)?;
    AdapterRegistry::load(Some(&sources))
}

pub fn materialize_adapter_source(
    app_data_directory: &Path,
    adapter_id: &str,
) -> Result<PathBuf, String> {
    let registry = load_registry(app_data_directory)?;
    let adapter = registry.get(adapter_id)?;
    let sources = source_directory(app_data_directory)?;
    let target = sources.join(format!("{}.json", adapter.id));
    if target.exists() {
        return Ok(target);
    }
    let content = serde_json::to_vec_pretty(adapter)
        .map_err(|error| format!("序列化适配源 {} 失败: {error}", adapter.id))?;
    let temporary = sources.join(format!("{}.json.tmp", adapter.id));
    std::fs::write(&temporary, content)
        .map_err(|error| format!("写入适配源副本失败 {}: {error}", temporary.display()))?;
    std::fs::rename(&temporary, &target)
        .map_err(|error| format!("提交适配源副本失败 {}: {error}", target.display()))?;
    Ok(target)
}
