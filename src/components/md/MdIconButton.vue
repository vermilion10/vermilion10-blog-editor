<script setup lang="ts">
import MdIcon from './MdIcon.vue';
import type { IconName } from '../../lib/icons';

// Icon-only buttons always carry a label: it becomes the accessible name and
// the tooltip, since the icon alone doesn't say what the button does.
withDefaults(defineProps<{
  icon: IconName;
  label: string;
  variant?: 'standard' | 'filled' | 'tonal';
  selected?: boolean;
}>(), { variant: 'standard' });
</script>

<template>
  <button
    type="button"
    class="md-icon-button state-layer"
    :class="[`md-icon-button--${variant}`, { 'is-selected': selected }]"
    :aria-label="label"
    :title="label"
  >
    <MdIcon :name="icon" />
  </button>
</template>

<style>
.md-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
}

.md-icon-button::after {
  content: '';
  position: absolute;
  inset: -4px;
}

.md-icon-button.is-selected {
  color: var(--md-sys-color-primary);
}

.md-icon-button--filled {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
}

.md-icon-button--tonal {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}

.md-icon-button:disabled {
  background: transparent;
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
}

.md-icon-button--filled:disabled,
.md-icon-button--tonal:disabled {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
}
</style>
