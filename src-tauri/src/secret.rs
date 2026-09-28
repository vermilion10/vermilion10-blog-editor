//! Storage for tokens (GitHub, R2).
//!
//! On desktop they live in the OS credential store (Windows Credential
//! Manager, macOS Keychain, Secret Service on Linux). On Android they are
//! encrypted with a key held in the Android Keystore. Neither touches a plain
//! file.

#[cfg_attr(mobile, allow(dead_code))]
const SERVICE: &str = "vermilion10-blog-editor";

#[cfg(desktop)]
mod store {
  use super::SERVICE;

  fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())
  }

  pub fn get(_app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
      Ok(value) => Ok(Some(value)),
      Err(keyring::Error::NoEntry) => Ok(None),
      Err(e) => Err(e.to_string()),
    }
  }

  pub fn set(_app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
    entry(key)?.set_password(value).map_err(|e| e.to_string())
  }

  pub fn delete(_app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
      Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
      Err(e) => Err(e.to_string()),
    }
  }
}

// Android: AES-256-GCM with a key held in the Android Keystore (see
// device.rs and DevicePlugin.kt). Only ciphertext is stored.
#[cfg(target_os = "android")]
mod store {
  pub fn get(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    crate::device::secret_get(app, key)
  }

  pub fn set(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
    crate::device::secret_set(app, key, value)
  }

  pub fn delete(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    crate::device::secret_delete(app, key)
  }
}

fn check_key(key: &str) -> Result<(), String> {
  if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
    return Err(format!("invalid secret key: {key:?}"));
  }
  Ok(())
}

/// Secrets only Rust code may touch. The R2 credentials are used here to sign
/// requests and never need to reach the web view.
const RUST_ONLY: &[&str] = &["r2-config"];

fn check_js_key(key: &str) -> Result<(), String> {
  check_key(key)?;
  if RUST_ONLY.contains(&key) {
    return Err(format!("secret {key:?} is not readable from the web view"));
  }
  Ok(())
}

// Async so that on Android the call into Kotlin doesn't block the main thread.
#[tauri::command]
pub async fn secret_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
  check_js_key(&key)?;
  store::get(&app, &key)
}

#[tauri::command]
pub async fn secret_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
  check_js_key(&key)?;
  store::set(&app, &key, &value)
}

#[tauri::command]
pub async fn secret_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
  check_js_key(&key)?;
  store::delete(&app, &key)
}

// For other Rust modules.
pub(crate) fn load(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
  check_key(key)?;
  store::get(app, key)
}

pub(crate) fn save(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
  check_key(key)?;
  store::set(app, key, value)
}

pub(crate) fn remove(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
  check_key(key)?;
  store::delete(app, key)
}
