<script setup lang="ts">
import { ref } from 'vue';
import { state, signIn } from '../lib/store';
import { openExternal } from '../lib/platform';
import { theme, toggleThemeMode } from '../lib/theme';
import RepoFields from './RepoFields.vue';
import MdTextField from './md/MdTextField.vue';
import MdButton from './md/MdButton.vue';
import MdIcon from './md/MdIcon.vue';
import MdIconButton from './md/MdIconButton.vue';

const token = ref('');
const config = ref({ ...state.config });
const busy = ref(false);
const error = ref(state.authError);
const showRepo = ref(!config.value.owner || !config.value.repo);

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'
  + '?name=vermilion10-blog-editor&description=Blog+editor+publishing&contents=write';

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await signIn(token.value.trim(), config.value);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="safe-area relative flex h-full items-start justify-center overflow-y-auto bg-surface">
    <div class="flex w-full justify-center px-4 py-10 min-[600px]:my-auto">
    <MdIconButton
      class="!absolute top-[calc(12px+env(safe-area-inset-top))] right-[calc(12px+env(safe-area-inset-right))]"
      :icon="theme.mode === 'dark' ? 'light_mode' : 'dark_mode'"
      :label="theme.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="toggleThemeMode"
    />
    <form class="w-full max-w-[440px] rounded-xl bg-surface-container-low p-6 min-[600px]:p-8" @submit.prevent="submit">
      <h1 class="type-headline-small mb-2 text-on-surface">vermilion10 Blog Editor</h1>
      <p class="type-body-medium mb-8 text-on-surface-variant">Sign in with a GitHub token that can push to the blog repository.</p>

      <MdTextField
        v-model="token"
        label="Personal access token"
        type="password"
        mono
        autocomplete="off"
        required
        :error="error || undefined"
      />
      <p class="type-body-small mt-3 px-4 text-on-surface-variant">
        Use a
        <button type="button" class="font-medium text-primary underline-offset-2 hover:underline" @click="openExternal(TOKEN_URL)">fine-grained token</button>
        limited to the blog repository, with Contents set to Read and write. It is kept in the system credential manager.
      </p>

      <div class="mt-6">
        <button
          type="button"
          class="state-layer type-label-large -mx-3 flex min-h-12 items-center gap-2 rounded-full pr-4 pl-2 text-on-surface-variant"
          :aria-expanded="showRepo"
          @click="showRepo = !showRepo"
        >
          <MdIcon name="chevron_right" :size="20" class="transition-transform duration-150" :class="{ 'rotate-90': showRepo }" />
          {{ config.owner && config.repo ? `${config.owner}/${config.repo} @ ${config.branch}` : 'Repository' }}
        </button>
        <div v-if="showRepo" class="mt-3"><RepoFields v-model="config" /></div>
      </div>

      <MdButton variant="filled" type="submit" class="mt-8 w-full" :loading="busy" :disabled="busy || !token.trim()">
        {{ busy ? 'Checking access' : 'Sign in' }}
      </MdButton>
    </form>
    </div>
  </div>
</template>
