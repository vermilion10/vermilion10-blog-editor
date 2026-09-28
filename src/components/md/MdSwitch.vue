<script setup lang="ts">
import { useId } from 'vue';

// A list row with a label (and optional supporting text) and a trailing
// switch. The whole row is the touch target.
defineProps<{ label: string; supporting?: string }>();
const model = defineModel<boolean>({ default: false });
const id = useId();
</script>

<template>
  <label :for="id" class="state-layer flex min-h-14 cursor-pointer items-center gap-4 rounded-md px-4 py-2">
    <span class="min-w-0 flex-1">
      <span class="type-body-large block text-on-surface">{{ label }}</span>
      <span v-if="supporting" class="type-body-medium block text-on-surface-variant">{{ supporting }}</span>
    </span>
    <input :id="id" v-model="model" type="checkbox" role="switch" class="md-switch" />
  </label>
</template>

<style>
.md-switch {
  appearance: none;
  position: relative;
  flex-shrink: 0;
  width: 52px;
  height: 32px;
  margin: 0;
  border-radius: 9999px;
  border: 2px solid var(--md-sys-color-outline);
  background: var(--md-sys-color-surface-container-highest);
  cursor: pointer;
  transition: background var(--md-sys-motion-duration-short) linear,
    border-color var(--md-sys-motion-duration-short) linear;
}

.md-switch::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--md-sys-color-outline);
  transform: translateY(-50%);
  transition: all var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-emphasized-decelerate);
}

.md-switch:checked {
  background: var(--md-sys-color-primary);
  border-color: var(--md-sys-color-primary);
}

.md-switch:checked::before {
  left: 22px;
  width: 24px;
  height: 24px;
  background: var(--md-sys-color-on-primary);
}
</style>
