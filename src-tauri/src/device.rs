//! Device services that need platform code. On Android these are served by
//! the Kotlin class `DevicePlugin` (gen/android/app/src/main/java/.../DevicePlugin.kt):
//! Keystore-backed secret storage and the wallpaper-derived system accent color.
//! Desktop builds don't register anything here.

use tauri::plugin::{Builder, TauriPlugin};

#[cfg(target_os = "android")]
mod android {
  use serde::Deserialize;
  use serde_json::json;
  use tauri::plugin::PluginHandle;
  use tauri::{AppHandle, Manager, Wry};

  pub struct Device(pub PluginHandle<Wry>);

  #[derive(Deserialize)]
  struct Value {
    value: Option<String>,
  }

  fn handle(app: &AppHandle) -> tauri::State<'_, Device> {
    app.state::<Device>()
  }

  pub fn secret_get(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    handle(app)
      .0
      .run_mobile_plugin::<Value>("secretGet", json!({ "key": key }))
      .map(|v| v.value)
      .map_err(|e| e.to_string())
  }

  pub fn secret_set(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    handle(app)
      .0
      .run_mobile_plugin::<serde_json::Value>("secretSet", json!({ "key": key, "value": value }))
      .map(|_| ())
      .map_err(|e| e.to_string())
  }

  pub fn secret_delete(app: &AppHandle, key: &str) -> Result<(), String> {
    handle(app)
      .0
      .run_mobile_plugin::<serde_json::Value>("secretDelete", json!({ "key": key }))
      .map(|_| ())
      .map_err(|e| e.to_string())
  }

  pub fn set_system_bars(app: &AppHandle, light: bool) -> Result<(), String> {
    handle(app)
      .0
      .run_mobile_plugin::<serde_json::Value>("setSystemBars", json!({ "light": light }))
      .map(|_| ())
      .map_err(|e| e.to_string())
  }

  pub fn system_accent(app: &AppHandle) -> Option<String> {
    handle(app).0.run_mobile_plugin::<Value>("dynamicColor", json!({})).ok().and_then(|v| v.value)
  }
}

#[cfg(target_os = "android")]
pub use android::{secret_delete, secret_get, secret_set};

// Typed to the default Wry runtime, which is what the app runs on, so the
// Android plugin handle can be stored without generics.
pub fn init() -> TauriPlugin<tauri::Wry> {
  Builder::new("device")
    .setup(|_app, _api| {
      #[cfg(target_os = "android")]
      {
        use tauri::Manager;
        let handle = _api.register_android_plugin("dev.vermilion10.blogeditor", "DevicePlugin")?;
        _app.manage(android::Device(handle));
      }
      Ok(())
    })
    .build()
}

/// The wallpaper-derived accent color as `#rrggbb`, where the platform has
/// one (Android 12+). Null elsewhere.
#[tauri::command]
pub async fn system_accent(app: tauri::AppHandle) -> Option<String> {
  #[cfg(target_os = "android")]
  {
    android::system_accent(&app)
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = app;
    None
  }
}

/// Dark (`light: true`) or light system bar icons, to match the app theme.
/// Only Android draws the app under its system bars; elsewhere this does nothing.
#[tauri::command]
pub async fn set_system_bars(app: tauri::AppHandle, light: bool) -> Result<(), String> {
  #[cfg(target_os = "android")]
  {
    android::set_system_bars(&app, light)
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = (app, light);
    Ok(())
  }
}
