#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize Sentry for error tracking (opt-in via SENTRY_DSN env var)
    let _sentry_guard = init_sentry();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
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
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn init_sentry() -> Option<sentry::ClientInitGuard> {
    std::env::var("SENTRY_DSN").ok().map(|dsn| {
        sentry::init((
            dsn,
            sentry::ClientOptions {
                release: sentry::release_name!(),
                attach_stacktrace: true,
                send_default_pii: false,
                ..Default::default()
            },
        ))
    })
}

mod commands;