import { reactive } from 'vue';

// Images reach the upload dialog from several places (drop, paste, the Add
// image button, the cover field). Each caller says what should happen with
// the uploaded key; the dialog (ImageDialog.vue, hosted by App) works through
// the queue one image at a time.

export type ImageTarget =
  /** Insert `![alt](key)` wherever the caller decides. */
  | { kind: 'insert'; insert: (markdown: string) => void }
  /** Set the post's cover image. */
  | { kind: 'cover' };

export interface QueuedImage {
  file: File;
  target: ImageTarget;
}

export const imageQueue = reactive({
  items: [] as QueuedImage[],
  /** Position of the current item among those queued in the same batch. */
  batchIndex: 0,
  batchSize: 0,
  /** Bumped after every successful upload, for lists that show bucket contents. */
  uploaded: 0,
});

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Queues image files; returns how many were accepted. */
export function addImages(files: Iterable<File>, target: ImageTarget): number {
  const images = Array.from(files).filter(isImageFile);
  if (!images.length) return 0;
  if (!imageQueue.items.length) {
    imageQueue.batchIndex = 0;
    imageQueue.batchSize = 0;
  }
  imageQueue.batchSize += images.length;
  for (const file of images) imageQueue.items.push({ file, target });
  return images.length;
}

export function finishCurrentImage(): void {
  imageQueue.items.shift();
  imageQueue.batchIndex++;
}

export function cancelAllImages(): void {
  imageQueue.items.splice(0);
}

export function imageMarkdown(key: string, alt: string): string {
  return `![${alt.replace(/[[\]]/g, '')}](${key})`;
}

// Where "insert at the cursor" goes: App points this at whichever editor is
// showing (code or visual).
let cursorInserter: (markdown: string) => void = () => {};

export function setCursorInserter(fn: (markdown: string) => void): void {
  cursorInserter = fn;
}

export function insertAtCursor(markdown: string): void {
  cursorInserter(markdown);
}

/** Image files carried by a drop or paste, if any. */
export function imageFilesIn(data: DataTransfer | null): File[] {
  return data ? Array.from(data.files).filter(isImageFile) : [];
}
