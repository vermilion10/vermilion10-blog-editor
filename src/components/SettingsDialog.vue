<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MdDialog from './md/MdDialog.vue';
import MdButton from './md/MdButton.vue';
import MdSegmented from './md/MdSegmented.vue';
import MdTextField from './md/MdTextField.vue';
import MdIcon from './md/MdIcon.vue';
import RepoFields from './RepoFields.vue';
import { signOut, state, updateConfig } from '../lib/store';
import { DEFAULT_SEED, SEED_PRESETS, isValidHex, theme } from '../lib/theme';

const emit = defineEmits<{ close: [] }>();

const config = ref({ ...state.config });
const busy = ref(false);
const error = ref('');

const repoChanged = computed(() => JSON.stringify(config.value) !== JSON.stringify(state.config));

// Appearance applies immediately; the hex field only commits valid colors.
const hex = ref(theme.seed);
watch(() => theme.seed, (s) => { if (s.toLowerCase() !== hex.value.toLowerCase()) hex.value = s; });
watch(hex, (h) => {
  const v = h.trim().startsWith('#') ? h.trim() : `#${h.trim()}`;
  if (isValidHex(v)) theme.seed = v.toLowerCase();
});
const hexError = computed(() => (isValidHex(hex.value.trim().startsWith('#') ? hex.value.trim() : `#${hex.value.trim()}`) ? '' : 'Use a 6-digit hex color like #f97316'));

async function save() {
  if (!repoChanged.value) return emit('close');
  busy.value = true;
  error.value = '';
  try {
    await updateConfig(config.value);
    emit('close');
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}

async function logout() {
  await signOut();
  emit('close');
}
</script>

<template>
  <MdDialog headline="Settings" @close="emit('close')">
    <form id="settings" class="space-y-8" @submit.prevent="save">
      <section>
        <h3 class="type-title-medium mb-4 text-on-surface">Appearance</h3>
        <MdSegmented
          v-model="theme.mode"
          label="Theme"
          :options="[
            { value: 'dark', label: 'Dark', icon: 'dark_mode' },
            { value: 'light', label: 'Light', icon: 'light_mode' },
          ]"
        />

        <p class="type-label-large mt-6 mb-3 text-on-surface">Theme color</p>
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme color">
          <button
            v-for="p in SEED_PRESETS"
            :key="p.hex"
            type="button"
            role="radio"
            class="flex size-12 items-center justify-center rounded-full"
            :aria-checked="theme.seed === p.hex"
            :aria-label="p.name"
            :title="p.name"
            @click="theme.seed = p.hex"
          >
            <span class="flex size-9 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface-container-high" :class="{ 'ring-2 ring-on-surface': theme.seed === p.hex }" :style="{ background: p.hex }">
              <MdIcon v-if="theme.seed === p.hex" name="check" :size="20" />
            </span>
          </button>
          <label class="relative flex size-12 cursor-pointer items-center justify-center rounded-full" title="Custom color">
            <span class="flex size-9 items-center justify-center rounded-full border border-outline text-on-surface-variant">
              <MdIcon name="palette" :size="20" />
            </span>
            <input v-model="theme.seed" type="color" class="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom theme color" />
          </label>
        </div>
        <div class="mt-4 flex items-start gap-3">
          <MdTextField v-model="hex" label="Hex" mono class="max-w-[180px] flex-1" autocomplete="off" :error="hexError || undefined" />
          <MdButton v-if="theme.seed !== DEFAULT_SEED" class="mt-2" @click="theme.seed = DEFAULT_SEED">Reset to orange</MdButton>
        </div>
      </section>

      <section>
        <h3 class="type-title-medium mb-4 text-on-surface">Repository</h3>
        <RepoFields v-model="config" />
        <p v-if="error" class="type-body-medium mt-4 rounded-md bg-error-container p-3 text-on-error-container">{{ error }}</p>
      </section>

      <section>
        <h3 class="type-title-medium mb-2 text-on-surface">Account</h3>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="type-body-medium">Signed in to GitHub as <b class="text-on-surface">{{ state.login }}</b></span>
          <MdButton variant="outlined" icon="logout" @click="logout">Sign out</MdButton>
        </div>
      </section>
    </form>
    <template #actions>
      <MdButton @click="emit('close')">{{ repoChanged ? 'Cancel' : 'Done' }}</MdButton>
      <MdButton v-if="repoChanged" type="submit" form="settings" :loading="busy" :disabled="busy">Save repository</MdButton>
    </template>
  </MdDialog>
</template>
