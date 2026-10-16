#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod keepass;

use keepass::{
    AccountInput, AccountSummary, CredentialsInput, SharedVault, VaultState, VaultStatus,
};
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .manage::<SharedVault>(Mutex::new(VaultState::new()))
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
            hello_enable,
            hello_disable,
            hello_unlock,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/* ---------- 密码库命令 ---------- */

#[tauri::command]
fn vault_create(
    state: tauri::State<SharedVault>,
    path: Option<String>,
    password: String,
    use_key_file: bool,
) -> Result<VaultStatus, String> {
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
