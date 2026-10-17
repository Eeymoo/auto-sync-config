#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keepass;
mod sync_system;

use keepass::{
    AccountInput, AccountSummary, CredentialsInput, ScannedAccount, SharedVault, VaultState,
    VaultStatus,
};
use std::sync::Mutex;
use tauri::Manager;

struct SyncExecutionLock(Mutex<()>);

fn main() {
    tauri::Builder::default()
        .manage::<SharedVault>(Mutex::new(VaultState::new()))
        .manage(SyncExecutionLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            launch_program,
            vault_create,
            vault_open,
            vault_lock,
            vault_status,
            vault_default_path,
            accounts_list,
            account_save,
            account_delete,
            account_credentials,
            scan_userdata_accounts,
            import_scanned_accounts,
            hello_enable,
            hello_disable,
            hello_unlock,
            sync_source_directory,
            sync_materialize_adapter_source,
            sync_list_adapters,
            sync_scan_roles,
            sync_plan,
            sync_execute,
            sync_list_transactions,
            sync_undo,
            sync_redo,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/* ---------- 同步系统 ---------- */

fn sync_app_data_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("无法确定应用数据目录: {error}"))
}

#[tauri::command]
fn sync_source_directory(app: tauri::AppHandle) -> Result<String, String> {
    let app_data = sync_app_data_directory(&app)?;
    Ok(sync_system::source_directory(&app_data)?
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
fn sync_materialize_adapter_source(
    app: tauri::AppHandle,
    adapter_id: String,
) -> Result<String, String> {
    let app_data = sync_app_data_directory(&app)?;
    Ok(
        sync_system::materialize_adapter_source(&app_data, &adapter_id)?
            .to_string_lossy()
            .into_owned(),
    )
}

#[tauri::command]
fn sync_list_adapters(
    app: tauri::AppHandle,
) -> Result<Vec<sync_system::model::AdapterSummary>, String> {
    let app_data = sync_app_data_directory(&app)?;
    Ok(sync_system::load_registry(&app_data)?.summaries())
}

#[tauri::command]
fn sync_scan_roles(
    app: tauri::AppHandle,
    adapter_id: String,
    root: String,
    variant: String,
) -> Result<Vec<sync_system::model::SyncRole>, String> {
    let app_data = sync_app_data_directory(&app)?;
    let registry = sync_system::load_registry(&app_data)?;
    let adapter = registry.get(&adapter_id)?;
    sync_system::scan_roles(adapter, std::path::Path::new(&root), &variant)
}

#[tauri::command]
fn sync_plan(
    app: tauri::AppHandle,
    request: sync_system::model::SyncRequest,
) -> Result<sync_system::model::SyncPlan, String> {
    let app_data = sync_app_data_directory(&app)?;
    let registry = sync_system::load_registry(&app_data)?;
    sync_system::plan_sync(&registry, &request)
}

#[tauri::command]
fn sync_execute(
    app: tauri::AppHandle,
    lock: tauri::State<SyncExecutionLock>,
    request: sync_system::model::SyncRequest,
) -> Result<sync_system::model::SyncExecutionResult, String> {
    let _guard = lock.0.lock().map_err(|_| "同步执行锁已损坏".to_string())?;
    let app_data = sync_app_data_directory(&app)?;
    let registry = sync_system::load_registry(&app_data)?;
    let history = sync_system::history_directory(&app_data)?;
    sync_system::execute_sync(&registry, &request, &history)
}

#[tauri::command]
fn sync_list_transactions(
    app: tauri::AppHandle,
) -> Result<Vec<sync_system::model::TransactionSummary>, String> {
    let app_data = sync_app_data_directory(&app)?;
    let history = sync_system::history_directory(&app_data)?;
    sync_system::list_transactions(&history)
}

#[tauri::command]
fn sync_undo(
    app: tauri::AppHandle,
    lock: tauri::State<SyncExecutionLock>,
    transaction_id: String,
) -> Result<sync_system::model::SyncTransitionResult, String> {
    let _guard = lock.0.lock().map_err(|_| "同步执行锁已损坏".to_string())?;
    let app_data = sync_app_data_directory(&app)?;
    let history = sync_system::history_directory(&app_data)?;
    sync_system::undo_transaction(&history, &transaction_id)
}

#[tauri::command]
fn sync_redo(
    app: tauri::AppHandle,
    lock: tauri::State<SyncExecutionLock>,
    transaction_id: String,
) -> Result<sync_system::model::SyncTransitionResult, String> {
    let _guard = lock.0.lock().map_err(|_| "同步执行锁已损坏".to_string())?;
    let app_data = sync_app_data_directory(&app)?;
    let history = sync_system::history_directory(&app_data)?;
    sync_system::redo_transaction(&history, &transaction_id)
}

/* ---------- 密码库命令 ---------- */

#[tauri::command]
fn vault_create(
    state: tauri::State<SharedVault>,
    path: Option<String>,
    password: String,
    use_key_file: bool,
) -> Result<(VaultStatus, Option<String>), String> {
    keepass::create_vault(&state, path, password, use_key_file)
}

#[tauri::command]
fn vault_open(
    state: tauri::State<SharedVault>,
    path: String,
    credentials: CredentialsInput,
) -> Result<VaultStatus, String> {
    keepass::open_vault(&state, path, credentials)
}

#[tauri::command]
fn vault_lock(state: tauri::State<SharedVault>) -> Result<(), String> {
    keepass::lock_vault(&state)
}

#[tauri::command]
fn vault_status(state: tauri::State<SharedVault>) -> Result<VaultStatus, String> {
    keepass::get_status(&state)
}

#[tauri::command]
fn vault_default_path() -> Result<String, String> {
    keepass::default_vault_path_string()
}

#[tauri::command]
fn accounts_list(state: tauri::State<SharedVault>) -> Result<Vec<AccountSummary>, String> {
    keepass::list_accounts(&state)
}

#[tauri::command]
fn account_save(
    state: tauri::State<SharedVault>,
    id: Option<String>,
    input: AccountInput,
) -> Result<AccountSummary, String> {
    keepass::save_account(&state, id, input)
}

#[tauri::command]
fn account_delete(state: tauri::State<SharedVault>, id: String) -> Result<(), String> {
    keepass::delete_account(&state, id)
}

/// 按条目 ID 取凭据；后续自动登录命令复用此入口，密码不落前端状态。
#[tauri::command]
fn account_credentials(
    state: tauri::State<SharedVault>,
    id: String,
) -> Result<(String, String), String> {
    keepass::get_credentials(&state, id)
}

#[tauri::command]
fn scan_userdata_accounts(
    app: tauri::AppHandle,
    state: tauri::State<SharedVault>,
    game_path: String,
) -> Result<Vec<ScannedAccount>, String> {
    let app_data = sync_app_data_directory(&app)?;
    let registry = sync_system::load_registry(&app_data)?;
    let adapter = registry.get("jx3")?;
    let variant = if std::path::Path::new(&game_path)
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("zhcn_exp"))
    {
        "experimental"
    } else {
        "official"
    };
    let role_sects =
        sync_system::scan_role_sects(adapter, std::path::Path::new(&game_path), variant)?;
    keepass::scan_userdata(game_path, &state, &role_sects)
}

#[tauri::command]
fn import_scanned_accounts(
    state: tauri::State<SharedVault>,
    accounts: Vec<AccountInput>,
) -> Result<u32, String> {
    keepass::import_accounts(&state, accounts)
}

/* ---------- Windows Hello 便捷解锁 ---------- */

fn main_window_handle(app: &tauri::AppHandle) -> isize {
    app.get_webview_window("main")
        .and_then(|w| w.hwnd().ok())
        .map(|h| h.0 as isize)
        .unwrap_or(0)
}

#[tauri::command]
fn hello_enable(
    app: tauri::AppHandle,
    path: String,
    password: String,
    key_file: Option<String>,
) -> Result<(), String> {
    keepass::hello::enable(main_window_handle(&app), path, password, key_file)
}

#[tauri::command]
fn hello_disable() -> Result<(), String> {
    keepass::hello::disable()
}

#[tauri::command]
fn hello_unlock(
    app: tauri::AppHandle,
    state: tauri::State<SharedVault>,
) -> Result<VaultStatus, String> {
    let (path, password, key_data) = keepass::hello::verify_and_load(main_window_handle(&app))?;
    keepass::unlock_with_hello(
        &state,
        path,
        password,
        key_data.map(|d| base64::Engine::encode(&base64::engine::general_purpose::STANDARD, d)),
    )
}

/// 以管理员权限启动外部程序(Windows ShellExecuteEx + runas)。
///
/// JX3ClientX64.exe 的 manifest 要求提权,CreateProcess 会报 os error 740;
/// ShellExecuteEx 使用 "runas" 动词让系统弹出标准 UAC 授权框。
#[cfg(windows)]
#[tauri::command]
fn launch_program(exe: String, args: Vec<String>) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(once(0)).collect()
    }

    let verb = to_wide("runas");
    let file = to_wide(&exe);
    let params = to_wide(&args.join(" "));
    // 工作目录设为 exe 所在目录,游戏客户端对此敏感。
    let dir = exe
        .rsplit_once('\\')
        .map(|(d, _)| d)
        .unwrap_or("")
        .to_string();
    let dir_w = to_wide(&dir);

    let result = unsafe {
        ShellExecuteW(
            None,
            windows::core::PCWSTR(verb.as_ptr()),
            windows::core::PCWSTR(file.as_ptr()),
            windows::core::PCWSTR(params.as_ptr()),
            windows::core::PCWSTR(dir_w.as_ptr()),
            SW_SHOWNORMAL,
        )
    };

    // ShellExecuteW 返回值 > 32 表示成功,<= 32 是错误码。
    let code = result.0 as isize;
    if code > 32 {
        Ok(())
    } else {
        Err(format!("启动失败 {}: ShellExecute 错误码 {}", exe, code))
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn launch_program(exe: String, args: Vec<String>) -> Result<(), String> {
    std::process::Command::new(&exe)
        .args(&args)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("启动失败 {}: {}", exe, e))
}
