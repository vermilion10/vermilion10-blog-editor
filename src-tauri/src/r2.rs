//! Cloudflare R2 access through its S3-compatible API.
//!
//! Requests are signed here with the stored R2 API token, so the secret never
//! enters the web view. Only what writing a post needs is exposed: check a
//! key, list a folder, and upload a new object. Uploads refuse to replace an
//! existing key because the CDN serves objects as immutable for a year, so a
//! replaced file would never reach browsers that already cached it.

use std::sync::LazyLock;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use rusty_s3::actions::ListObjectsV2;
use rusty_s3::{Bucket, Credentials, S3Action, UrlStyle};
use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request};

const CONFIG_KEY: &str = "r2-config";
const SIGN_FOR: Duration = Duration::from_secs(300);

static HTTP: LazyLock<reqwest::Client> = LazyLock::new(|| {
  reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .build()
    .expect("http client")
});

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct R2Config {
  account_id: String,
  bucket: String,
  access_key_id: String,
  secret_access_key: String,
}

/// What the UI may know about the stored configuration (no secret).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct R2Status {
  account_id: String,
  bucket: String,
  access_key_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct R2Object {
  key: String,
  size: u64,
  last_modified: String,
}

struct Client {
  bucket: Bucket,
  credentials: Credentials,
}

fn client_for(config: &R2Config) -> Result<Client, String> {
  let account = config.account_id.trim();
  if account.is_empty() || !account.chars().all(|c| c.is_ascii_alphanumeric()) {
    return Err("The account ID should be the 32-character ID from the Cloudflare dashboard.".into());
  }
  let endpoint = format!("https://{account}.r2.cloudflarestorage.com")
    .parse()
    .map_err(|e| format!("invalid endpoint: {e}"))?;
  let bucket = Bucket::new(endpoint, UrlStyle::Path, config.bucket.trim().to_string(), "auto")
    .map_err(|e| format!("invalid bucket: {e}"))?;
  let credentials = Credentials::new(config.access_key_id.trim(), config.secret_access_key.trim());
  Ok(Client { bucket, credentials })
}

fn load_config(app: &tauri::AppHandle) -> Result<R2Config, String> {
  let raw = crate::secret::load(app, CONFIG_KEY)?.ok_or("R2 is not set up yet. Add a token under Settings.")?;
  serde_json::from_str(&raw).map_err(|e| format!("stored R2 settings are unreadable: {e}"))
}

fn check_key(key: &str) -> Result<(), String> {
  if key.is_empty() || key.starts_with('/') || key.contains("..") || key.contains('\\') || key.len() > 512 {
    return Err(format!("invalid object key: {key:?}"));
  }
  Ok(())
}

/// A network failure, without the signed URL (it carries the access key ID
/// and a signature, which don't belong in the UI).
fn net_err(e: reqwest::Error) -> String {
  if e.is_timeout() {
    "R2 did not answer in time. Check your connection and try again.".into()
  } else if e.is_connect() || e.is_request() {
    // Cloudflare refuses the TLS handshake for account IDs that don't exist.
    "Could not connect to R2. Check the account ID (the 32-character ID in the Cloudflare dashboard) and your connection.".into()
  } else {
    format!("network error: {}", e.without_url())
  }
}

async fn describe_failure(res: reqwest::Response) -> String {
  let status = res.status();
  let body = res.text().await.unwrap_or_default();
  let code = body
    .split("<Code>")
    .nth(1)
    .and_then(|s| s.split("</Code>").next())
    .unwrap_or("");
  match (status.as_u16(), code) {
    (401 | 403, _) => "R2 rejected the token. Check that it has Object Read & Write on this bucket.".into(),
    (404, "NoSuchBucket") => "R2 has no bucket with that name on this account.".into(),
    _ if !code.is_empty() => format!("R2 error {status}: {code}"),
    _ => format!("R2 error {status}"),
  }
}

async fn head(client: &Client, key: &str) -> Result<Option<u64>, String> {
  let url = client.bucket.head_object(Some(&client.credentials), key).sign(SIGN_FOR);
  let res = HTTP.head(url).send().await.map_err(net_err)?;
  match res.status().as_u16() {
    200 => Ok(Some(res.content_length().unwrap_or(0))),
    404 => Ok(None),
    _ => Err(describe_failure(res).await),
  }
}

async fn list(client: &Client, prefix: &str, limit: usize) -> Result<Vec<R2Object>, String> {
  let mut out = Vec::new();
  let mut token: Option<String> = None;
  loop {
    let mut action = client.bucket.list_objects_v2(Some(&client.credentials));
    action.with_prefix(prefix);
    action.with_max_keys(limit.min(1000));
    if let Some(t) = &token {
      action.with_continuation_token(t.clone());
    }
    let res = HTTP.get(action.sign(SIGN_FOR)).send().await.map_err(net_err)?;
    if !res.status().is_success() {
      return Err(describe_failure(res).await);
    }
    let text = res.text().await.map_err(net_err)?;
    let parsed = ListObjectsV2::parse_response(&text).map_err(|e| format!("unexpected R2 response: {e}"))?;
    out.extend(parsed.contents.into_iter().map(|c| R2Object { key: c.key, size: c.size, last_modified: c.last_modified }));
    token = parsed.next_continuation_token;
    if token.is_none() || out.len() >= limit {
      break;
    }
  }
  out.truncate(limit);
  Ok(out)
}

#[tauri::command]
pub async fn r2_status(app: tauri::AppHandle) -> Result<Option<R2Status>, String> {
  match crate::secret::load(&app, CONFIG_KEY)? {
    None => Ok(None),
    Some(raw) => {
      let c: R2Config = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
      Ok(Some(R2Status { account_id: c.account_id, bucket: c.bucket, access_key_id: c.access_key_id }))
    }
  }
}

/// Verifies the credentials against the bucket, then stores them.
#[tauri::command]
pub async fn r2_save(app: tauri::AppHandle, config: R2Config) -> Result<(), String> {
  let client = client_for(&config)?;
  list(&client, "", 1).await?;
  let raw = serde_json::to_string(&config).map_err(|e| e.to_string())?;
  crate::secret::save(&app, CONFIG_KEY, &raw)
}

#[tauri::command]
pub async fn r2_clear(app: tauri::AppHandle) -> Result<(), String> {
  crate::secret::remove(&app, CONFIG_KEY)
}

/// Size of the object at `key`, or null when there is none.
#[tauri::command]
pub async fn r2_head(app: tauri::AppHandle, key: String) -> Result<Option<u64>, String> {
  check_key(&key)?;
  let client = client_for(&load_config(&app)?)?;
  head(&client, &key).await
}

#[tauri::command]
pub async fn r2_list(app: tauri::AppHandle, prefix: String) -> Result<Vec<R2Object>, String> {
  let client = client_for(&load_config(&app)?)?;
  list(&client, &prefix, 500).await
}

/// JSON form of an upload, used where raw bodies can't be sent (Android's
/// WebView has no way to pass a request body to the app, so Tauri sends JSON).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutJson {
  key: String,
  content_type: String,
  /// The file, base64-encoded.
  data: String,
}

/// Uploads a new object. Desktop sends the file as a raw body with `x-key` and
/// `x-content-type` headers; Android sends `PutJson`.
#[tauri::command]
pub async fn r2_put(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
  let (key, content_type, bytes) = match request.body() {
    InvokeBody::Raw(bytes) => {
      let header = |name: &str| {
        request
          .headers()
          .get(name)
          .and_then(|v| v.to_str().ok())
          .map(str::to_string)
          .ok_or(format!("missing {name} header"))
      };
      (header("x-key")?, header("x-content-type")?, bytes.clone())
    }
    InvokeBody::Json(value) => {
      let put: PutJson = serde_json::from_value(value.clone()).map_err(|e| format!("bad upload request: {e}"))?;
      let bytes = BASE64.decode(put.data.as_bytes()).map_err(|e| format!("bad upload data: {e}"))?;
      (put.key, put.content_type, bytes)
    }
  };
  check_key(&key)?;

  let client = client_for(&load_config(&app)?)?;
  if head(&client, &key).await?.is_some() {
    return Err(format!("{key} already exists. Objects are cached as immutable, so pick a new name."));
  }
  let url = client.bucket.put_object(Some(&client.credentials), &key).sign(SIGN_FOR);
  let res = HTTP
    .put(url)
    .header("content-type", content_type)
    .body(bytes)
    .send()
    .await
    .map_err(net_err)?;
  if !res.status().is_success() {
    return Err(describe_failure(res).await);
  }
  Ok(())
}
