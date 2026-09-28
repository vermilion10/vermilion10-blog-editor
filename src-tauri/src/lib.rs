mod r2;
mod secret;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      secret::secret_get,
      secret::secret_set,
      secret::secret_delete,
      r2::r2_status,
      r2::r2_save,
      r2::r2_clear,
      r2::r2_head,
      r2::r2_list,
      r2::r2_put,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
