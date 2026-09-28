export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png';

export interface EncodeRequest {
  format: ImageFormat;
  /** 1–100, used for lossy encodes without a target size. */
  quality: number;
  lossless: boolean;
  /** 0 keeps the original width. */
  maxWidth: number;
  /** 0 turns the target size off. */
  targetBytes: number;
}

export type WorkerRequest =
  | { id: number; type: 'load'; file: Blob }
  | { id: number; type: 'encode'; request: EncodeRequest };

export type WorkerResponse =
  | { id: number; type: 'loaded'; width: number; height: number }
  | { id: number; type: 'encoded'; bytes: ArrayBuffer; quality: number; width: number; height: number; reachedTarget: boolean }
  | { id: number; type: 'error'; message: string };

export const MIME: Record<ImageFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export const EXT: Record<ImageFormat, string> = {
  webp: 'webp',
  avif: 'avif',
  jpeg: 'jpg',
  png: 'png',
};
