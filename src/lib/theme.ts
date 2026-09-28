import { reactive, ref, watchEffect } from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  argbFromHex, hexFromArgb, Hct, MaterialDynamicColors, SchemeFidelity, type DynamicColor,
} from '@material/material-color-utilities';
import { readJson, writeJson } from './platform';

// MD3 color roles generated from one seed color. SchemeFidelity keeps the
// primary close to the seed itself, so the brand orange stays recognisably
// orange instead of drifting to the muted tone Tonal Spot would pick.

export const DEFAULT_SEED = '#f97316';

export const SEED_PRESETS = [
  { name: 'Vermilion orange', hex: DEFAULT_SEED },
  { name: 'Crimson', hex: '#dc2626' },
  { name: 'Rose', hex: '#e11d74' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Teal', hex: '#0d9488' },
  { name: 'Green', hex: '#16a34a' },
];

export type ThemeMode = 'dark' | 'light';

interface ThemePrefs {
  mode: ThemeMode;
  seed: string;
  /** Follow the wallpaper-derived system accent where the device has one. */
  useSystemColor: boolean;
}

const PREFS_KEY = 'theme';

export const theme = reactive<ThemePrefs>({
  mode: 'dark',
  seed: DEFAULT_SEED,
  useSystemColor: false,
  ...readJson<Partial<ThemePrefs>>(PREFS_KEY, {}),
});

const ROLES: Record<string, DynamicColor> = {
  'primary': MaterialDynamicColors.primary,
  'on-primary': MaterialDynamicColors.onPrimary,
  'primary-container': MaterialDynamicColors.primaryContainer,
  'on-primary-container': MaterialDynamicColors.onPrimaryContainer,
  'secondary': MaterialDynamicColors.secondary,
  'on-secondary': MaterialDynamicColors.onSecondary,
  'secondary-container': MaterialDynamicColors.secondaryContainer,
  'on-secondary-container': MaterialDynamicColors.onSecondaryContainer,
  'tertiary': MaterialDynamicColors.tertiary,
  'on-tertiary': MaterialDynamicColors.onTertiary,
  'tertiary-container': MaterialDynamicColors.tertiaryContainer,
  'on-tertiary-container': MaterialDynamicColors.onTertiaryContainer,
  'error': MaterialDynamicColors.error,
  'on-error': MaterialDynamicColors.onError,
  'error-container': MaterialDynamicColors.errorContainer,
  'on-error-container': MaterialDynamicColors.onErrorContainer,
  'surface': MaterialDynamicColors.surface,
  'surface-dim': MaterialDynamicColors.surfaceDim,
  'surface-bright': MaterialDynamicColors.surfaceBright,
  'surface-container-lowest': MaterialDynamicColors.surfaceContainerLowest,
  'surface-container-low': MaterialDynamicColors.surfaceContainerLow,
  'surface-container': MaterialDynamicColors.surfaceContainer,
  'surface-container-high': MaterialDynamicColors.surfaceContainerHigh,
  'surface-container-highest': MaterialDynamicColors.surfaceContainerHighest,
  'on-surface': MaterialDynamicColors.onSurface,
  'on-surface-variant': MaterialDynamicColors.onSurfaceVariant,
  'outline': MaterialDynamicColors.outline,
  'outline-variant': MaterialDynamicColors.outlineVariant,
  'inverse-surface': MaterialDynamicColors.inverseSurface,
  'inverse-on-surface': MaterialDynamicColors.inverseOnSurface,
  'inverse-primary': MaterialDynamicColors.inversePrimary,
  'scrim': MaterialDynamicColors.scrim,
  'shadow': MaterialDynamicColors.shadow,
};

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(hex);
}

/** The device's wallpaper accent (Android 12+), or null where there is none. */
export const systemAccent = ref<string | null>(null);

async function readSystemAccent() {
  if (!isTauri()) return;
  try {
    const hex = await invoke<string | null>('system_accent');
    systemAccent.value = hex && isValidHex(hex) ? hex : null;
  } catch {
    systemAccent.value = null;
  }
}

void readSystemAccent();
// The wallpaper may change while the app is in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && theme.useSystemColor) void readSystemAccent();
});

/** The seed actually in use. */
export function activeSeed(): string {
  return theme.useSystemColor && systemAccent.value ? systemAccent.value : theme.seed;
}

function applyTheme({ mode }: ThemePrefs, seed: string) {
  const source = Hct.fromInt(argbFromHex(isValidHex(seed) ? seed : DEFAULT_SEED));
  const scheme = new SchemeFidelity(source, mode === 'dark', 0);
  const root = document.documentElement;
  for (const [name, role] of Object.entries(ROLES)) {
    root.style.setProperty(`--md-sys-color-${name}`, hexFromArgb(role.getArgb(scheme)));
  }
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  // On Android the system bar icons sit over the app: dark icons on the light
  // theme, light icons on the dark one.
  if (isTauri()) void invoke('set_system_bars', { light: mode === 'light' }).catch(() => {});
}

watchEffect(() => {
  applyTheme(theme, activeSeed());
  writeJson(PREFS_KEY, { mode: theme.mode, seed: theme.seed, useSystemColor: theme.useSystemColor });
});

export function toggleThemeMode(): void {
  theme.mode = theme.mode === 'dark' ? 'light' : 'dark';
}
