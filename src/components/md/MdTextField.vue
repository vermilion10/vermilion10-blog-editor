<script setup lang="ts">
import { computed, useAttrs, useId } from 'vue';

// MD3 outlined text field. The label rests inside the field and floats into
// a notch in the outline once the field has focus or a value.
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  label: string;
  multiline?: boolean;
  select?: boolean;
  supporting?: string;
  error?: string;
  mono?: boolean;
  rows?: number;
  /** Keep the label floated, for inputs that always show something (dates). */
  floatLabel?: boolean;
}>();

const model = defineModel<string>({ default: '' });
const id = useId();

// Layout classes go on the wrapper; every other attribute (type, required,
// autocomplete, list...) belongs to the control itself.
const attrs = useAttrs();
const controlAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});
const describedBy = computed(() => (props.error || props.supporting ? `${id}-support` : undefined));
</script>

<template>
  <div :class="attrs.class" :style="(attrs.style as string)">
    <div class="md-field" :class="{ 'is-error': error, 'is-select': select, 'is-floating': select || floatLabel, 'is-multiline': multiline }">
      <select
        v-if="select"
        :id="id"
        v-model="model"
        class="md-field__input type-body-large"
        :aria-describedby="describedBy"
        v-bind="controlAttrs"
      >
        <slot />
      </select>
      <textarea
        v-else-if="multiline"
        :id="id"
        v-model="model"
        class="md-field__input type-body-large"
        :class="{ 'font-mono !text-[0.8125rem]': mono }"
        :rows="rows ?? 3"
        placeholder=" "
        :aria-describedby="describedBy"
        :aria-invalid="!!error"
        v-bind="controlAttrs"
      ></textarea>
      <input
        v-else
        :id="id"
        v-model="model"
        class="md-field__input type-body-large"
        :class="{ 'font-mono !text-[0.8125rem]': mono }"
        placeholder=" "
        :aria-describedby="describedBy"
        :aria-invalid="!!error"
        v-bind="controlAttrs"
      />
      <label :for="id" class="md-field__label">{{ label }}</label>
      <fieldset class="md-field__outline" aria-hidden="true"><legend><span>{{ label }}</span></legend></fieldset>
      <div v-if="$slots.trailing" class="md-field__trailing"><slot name="trailing" /></div>
    </div>
    <p
      v-if="error || supporting"
      :id="`${id}-support`"
      class="type-body-small mt-1 px-4"
      :class="error ? 'text-error' : 'text-on-surface-variant'"
    >{{ error || supporting }}</p>
  </div>
</template>

<style>
.md-field {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 56px;
}

.md-field__input {
  flex: 1;
  min-width: 0;
  align-self: stretch;
  padding: 16px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  font-family: inherit;
  caret-color: var(--md-sys-color-primary);
}

.md-field.is-multiline .md-field__input {
  resize: vertical;
  min-height: 56px;
}

.md-field.is-select .md-field__input {
  appearance: auto;
  padding-right: 12px;
  cursor: pointer;
}

.md-field.is-select .md-field__input option {
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
}

/* Native date pickers and similar controls follow the theme. */
.md-field__input::-webkit-calendar-picker-indicator {
  filter: var(--picker-filter, none);
  cursor: pointer;
}
:root[data-theme='dark'] .md-field__input::-webkit-calendar-picker-indicator {
  filter: invert(0.8);
}

.md-field__label {
  position: absolute;
  left: 16px;
  top: 16px;
  max-width: calc(100% - 32px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  line-height: 1.5rem;
  color: var(--md-sys-color-on-surface-variant);
  pointer-events: none;
  transform-origin: left top;
  transition: transform var(--md-sys-motion-duration-short) var(--md-sys-motion-easing-standard),
    color var(--md-sys-motion-duration-short) linear;
}

.md-field__outline {
  position: absolute;
  inset: -6px 0 0;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-extra-small);
  pointer-events: none;
  min-width: 0;
}

.md-field__outline legend {
  padding: 0;
  height: 12px;
  font-size: 0.75rem;
  line-height: 12px;
  white-space: nowrap;
  visibility: hidden;
  max-width: 0.01px;
  transition: max-width 50ms linear;
}

.md-field__outline legend span {
  display: inline-block;
  padding: 0 4px;
}

.md-field__trailing {
  display: flex;
  padding-right: 4px;
}

.md-field:hover .md-field__outline {
  border-color: var(--md-sys-color-on-surface);
}

/* Floated: focused, filled in, or a select (which always shows a value). */
.md-field:focus-within .md-field__label,
.md-field:has(.md-field__input:not(:placeholder-shown)) .md-field__label,
.md-field.is-floating .md-field__label {
  transform: translateY(-24px) scale(0.75);
  max-width: calc((100% - 32px) / 0.75);
}

.md-field:focus-within .md-field__outline legend,
.md-field:has(.md-field__input:not(:placeholder-shown)) .md-field__outline legend,
.md-field.is-floating .md-field__outline legend {
  max-width: 100%;
  transition-duration: 100ms;
}

.md-field:focus-within .md-field__outline {
  border: 2px solid var(--md-sys-color-primary);
  padding: 0 11px;
}

.md-field:focus-within .md-field__label {
  color: var(--md-sys-color-primary);
}

.md-field.is-error .md-field__outline {
  border-color: var(--md-sys-color-error);
}

.md-field.is-error .md-field__label {
  color: var(--md-sys-color-error);
}

/* The browser's focus ring would double the field's own focus outline. */
.md-field__input:focus-visible {
  outline: none;
}
</style>
