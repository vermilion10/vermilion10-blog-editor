<script setup lang="ts">
import { useId } from 'vue';

// MD3 continuous slider on a native range input (keyboard and screen reader
// support come with it).
defineProps<{ label: string; min: number; max: number; step?: number; disabled?: boolean; valueText?: string }>();
const model = defineModel<number>({ required: true });
const id = useId();
</script>

<template>
  <div :class="{ 'opacity-38': disabled }">
    <div class="mb-1 flex items-baseline justify-between">
      <label :for="id" class="type-label-large text-on-surface">{{ label }}</label>
      <span class="type-label-large text-primary tabular-nums">{{ valueText ?? model }}</span>
    </div>
    <input
      :id="id"
      v-model.number="model"
      type="range"
      class="md-slider"
      :min="min"
      :max="max"
      :step="step ?? 1"
      :disabled="disabled"
      :aria-valuetext="valueText"
      :style="{ '--fill': `${((model - min) / (max - min)) * 100}%` }"
    />
  </div>
</template>

<style>
.md-slider {
  width: 100%;
  height: 44px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.md-slider:disabled { cursor: default; }
.md-slider::-webkit-slider-runnable-track {
  height: 16px;
  border-radius: 9999px;
  background: linear-gradient(to right,
    var(--md-sys-color-primary) 0 var(--fill),
    var(--md-sys-color-secondary-container) var(--fill) 100%);
}
.md-slider::-webkit-slider-thumb {
  appearance: none;
  width: 4px;
  height: 44px;
  margin-top: -14px;
  border-radius: 2px;
  background: var(--md-sys-color-primary);
  box-shadow: 0 0 0 6px var(--md-sys-color-surface-container-high);
}
.md-slider:focus-visible { outline: none; }
.md-slider:focus-visible::-webkit-slider-thumb {
  outline: 3px solid var(--md-sys-color-secondary);
  outline-offset: 4px;
}
</style>
