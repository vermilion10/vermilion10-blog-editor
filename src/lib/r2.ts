import { reactive } from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';

// R2 goes through the Rust side (src-tauri/src/r2.rs), which signs requests
// with the stored token. The web view never sees the secret. In a plain
// browser (npm run dev) there is no Rust side, so uploads are unavailable.

export interface R2Status {
  accountId: string;
  bucket: string;
  accessKeyId: string;
}

export interface R2Config extends R2Status {
  secretAccessKey: string;
}

export interface R2Object {
  key: string;
  size: number;
  lastModified: string;
}

export const r2Available = isTauri();

export const r2 = reactive({
  loaded: false,
  status: null as R2Status | null,
});

export async function loadR2Status(): Promise<void> {
  if (!r2Available) {
    r2.loaded = true;
    return;
  }
  try {
    r2.status = await invoke<R2Status | null>('r2_status');
  } finally {
    r2.loaded = true;
  }
}

/** Verifies the token against the bucket, then stores it. */
export async function saveR2(config: R2Config): Promise<void> {
  await invoke('r2_save', { config });
  r2.status = { accountId: config.accountId, bucket: config.bucket, accessKeyId: config.accessKeyId };
}

export async function clearR2(): Promise<void> {
  await invoke('r2_clear');
  r2.status = null;
}

export function headObject(key: string): Promise<number | null> {
  return invoke<number | null>('r2_head', { key });
}

export function listObjects(prefix: string): Promise<R2Object[]> {
  return invoke<R2Object[]>('r2_list', { prefix });
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  await invoke('r2_put', bytes, { headers: { 'x-key': key, 'x-content-type': contentType } });
}

// --- Key conventions ------------------------------------------------------------
//
// Posts keep their images under posts/<year>/<slug>/, matching the keys the
// existing posts already use.

export const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

export function postFolder(postPath: string, published: string): string {
  const slug = postPath.split('/').pop()!.replace(/\.md$/, '');
  const year = /^\d{4}/.test(published) ? published.slice(0, 4) : String(new Date().getFullYear());
  return `posts/${year}/${slug}/`;
}

/** A file name safe for a key: lowercase ASCII, dashes, one extension. */
export function safeName(name: string, ext: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  return `${base}.${ext}`;
}

export function withExtension(key: string, ext: string): string {
  return key.replace(/\.[^./]+$/, '') + `.${ext}`;
}

/** `cover.webp` -> `cover.v2.webp`, `cover.v2.webp` -> `cover.v3.webp`. */
export function nextVersion(key: string): string {
  const m = key.match(/^(.*?)(?:\.v(\d+))?(\.[^./]+)$/);
  if (!m) return `${key}.v2`;
  return `${m[1]}.v${m[2] ? Number(m[2]) + 1 : 2}${m[3]}`;
}

/** The first free key starting from `key`, bumping the version as needed. */
export async function freeKey(key: string): Promise<string> {
  let candidate = key;
  for (let i = 0; i < 20; i++) {
    if ((await headObject(candidate)) === null) return candidate;
    candidate = nextVersion(candidate);
  }
  throw new Error(`Could not find a free name near ${key}.`);
}
