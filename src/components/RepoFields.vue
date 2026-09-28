<script setup lang="ts">
import type { RepoConfig } from '../lib/github';
import MdTextField from './md/MdTextField.vue';

const config = defineModel<RepoConfig>({ required: true });
</script>

<template>
  <div class="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
    <MdTextField v-model.trim="config.owner" label="Owner" required autocomplete="off" />
    <MdTextField v-model.trim="config.repo" label="Repository" required autocomplete="off" />
    <MdTextField v-model.trim="config.branch" label="Branch" required autocomplete="off" />
    <MdTextField v-model.trim="config.postsDir" label="Posts folder" mono required autocomplete="off" />
  </div>
</template>
