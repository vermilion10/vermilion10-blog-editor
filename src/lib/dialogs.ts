import { reactive } from 'vue';

// App-wide MD3 dialogs driven by promises, so any code (including ProseMirror
// node views, which live outside Vue) can ask a question and await the answer.
// DialogHost.vue renders whichever request is open.

export interface ConfirmOptions {
  headline: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
}

export interface PromptOptions {
  headline: string;
  label: string;
  value: string;
  confirmLabel?: string;
  supporting?: string;
  multiline?: boolean;
  mono?: boolean;
  /** Show a live render of the value with the blog's renderer. */
  preview?: boolean;
}

interface Pending<T, R> {
  options: T;
  resolve: (result: R) => void;
}

export const dialogs = reactive({
  confirm: null as Pending<ConfirmOptions, boolean> | null,
  prompt: null as Pending<PromptOptions, string | null> | null,
});

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  dialogs.confirm?.resolve(false);
  return new Promise((resolve) => {
    dialogs.confirm = { options, resolve: (v) => { dialogs.confirm = null; resolve(v); } };
  });
}

/** Resolves to the entered text, or null when cancelled. */
export function promptDialog(options: PromptOptions): Promise<string | null> {
  dialogs.prompt?.resolve(null);
  return new Promise((resolve) => {
    dialogs.prompt = { options, resolve: (v) => { dialogs.prompt = null; resolve(v); } };
  });
}
