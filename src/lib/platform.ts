import { invoke, isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

// The app also runs in a plain browser (`npm run dev`) for quick UI work.
// There the token falls back to localStorage, which is fine for development
// and never used by the packaged app.
const inTauri = isTauri();
const LOCAL_PREFIX = 'secret:';

export async function getSecret(key: string): Promise<string | null> {
  if (inTauri) return invoke<string | null>('secret_get', { key });
  try { return localStorage.getItem(LOCAL_PREFIX + key); } catch { return null; }
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (inTauri) return invoke('secret_set', { key, value });
  try { localStorage.setItem(LOCAL_PREFIX + key, value); } catch { /* storage blocked */ }
}

export async function deleteSecret(key: string): Promise<void> {
  if (inTauri) return invoke('secret_delete', { key });
  try { localStorage.removeItem(LOCAL_PREFIX + key); } catch { /* storage blocked */ }
}

export async function openExternal(url: string): Promise<void> {
  if (inTauri) return openUrl(url);
  window.open(url, '_blank', 'noopener');
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export function removeKey(key: string): void {
  try { localStorage.removeItem(key); } catch { /* storage blocked */ }
}
