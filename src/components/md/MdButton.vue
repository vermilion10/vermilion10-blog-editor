<script setup lang="ts">
import MdIcon from './MdIcon.vue';
import type { IconName } from '../../lib/icons';

// MD3 common buttons. Filled is for the one primary action on a screen,
// tonal for secondary emphasis, outlined and text for everything else.
withDefaults(defineProps<{
  variant?: 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';
  icon?: IconName;
  loading?: boolean;
  type?: 'button' | 'submit';
}>(), { variant: 'text', type: 'button' });
</script>

<template>
  <button
    :type="type"
    class="md-button state-layer type-label-large"
    :class="`md-button--${variant}`"
  >
    <span v-if="loading" class="md-spinner" aria-hidden="true"></span>
    <MdIcon v-else-if="icon" :name="icon" :size="18" />
    <slot />
  </button>
</template>

<style>
.md-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  min-width: 48px;
  padding: 0 24px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  white-space: nowrap;
  transition: box-shadow var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard);
}

/* 48px touch target around the 40px visual. */
.md-button::after {
  content: '';
  position: absolute;
  inset: -4px 0;
}

.md-button:has(> .md-icon, > .md-spinner) {
  padding-left: 16px;
}

.md-button--filled {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
}

.md-button--danger {
  background: var(--md-sys-color-error);
  color: var(--md-sys-color-on-error);
}

.md-button--tonal {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}

.md-button--outlined {
  border: 1px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface-variant);
}

.md-button--text {
  padding: 0 12px;
  color: var(--md-sys-color-primary);
}

.md-button--text:has(> .md-icon) {
  padding: 0 16px 0 12px;
}

.md-button:disabled {
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
  color: color-mix(in srgb, var(--md-sys-color-on-surface) 38%, transparent);
  border-color: transparent;
}

.md-button--text:disabled,
.md-button--outlined:disabled {
  background: transparent;
}

.md-button--outlined:disabled {
  border-color: color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
}

.md-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: md-spin 0.8s linear infinite;
}

@keyframes md-spin {
  to { transform: rotate(360deg); }
}
</style>
