#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Second instance launched — focus the existing window instead of opening a new one
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::save_image,
            commands::open_image_files,
            commands::get_app_data_dir,
            commands::save_artwork_metadata,
            commands::load_artwork_metadata,
            commands::copy_image_to_app_data,
            commands::delete_artwork,
            commands::toggle_fullscreen,
            commands::get_seed_artworks,
            commands::check_first_run,
            commands::complete_first_run,
            commands::pick_library_folder,
            commands::import_seed_artworks,
            commands::log_startup,
            commands::finish_splash,
        ])
        .setup(|app| {
            commands::log_startup(app.handle().clone(), "rust: builder setup complete".to_string());
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}