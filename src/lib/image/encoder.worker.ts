/// <reference lib="webworker" />
// Image processing off the main thread: decode, resize and encode with the
// Squoosh codecs (via jSquash), so a large photo never freezes the editor.

// Encoders only: decoding is done by the web view (createImageBitmap), so the
// codec packages' decoders would just add size to the app.
import encodeWebp from '@jsquash/webp/encode.js';
import encodeAvif from '@jsquash/avif/encode.js';
import encodeJpeg from '@jsquash/jpeg/encode.js';
import encodePng from '@jsquash/png/encode.js';
import { optimise as optimisePng } from '@jsquash/oxipng';
import resize from '@jsquash/resize';
import type { EncodeRequest, WorkerRequest, WorkerResponse } from './types';

let source: ImageData | null = null;
const resized = new Map<number, ImageData>();

async function decode(file: Blob): Promise<ImageData> {
  // createImageBitmap applies EXIF orientation; re-encoding drops the EXIF
  // block itself (camera model, GPS position).
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function sized(maxWidth: number): Promise<ImageData> {
  const img = source!;
  if (!maxWidth || img.width <= maxWidth) return img;
  const hit = resized.get(maxWidth);
  if (hit) return hit;
  const height = Math.round((img.height * maxWidth) / img.width);
  const out = await resize(img, { width: maxWidth, height, method: 'lanczos3', fitMethod: 'stretch', premultiply: true, linearRGB: true });
  resized.set(maxWidth, out);
  return out;
}

async function encodeOnce(img: ImageData, req: EncodeRequest, quality: number): Promise<ArrayBuffer> {
  switch (req.format) {
    case 'webp':
      return req.lossless
        ? encodeWebp(img, { lossless: 1, quality: 75, method: 4, exact: 1 })
        : encodeWebp(img, { quality, method: 4, use_sharp_yuv: 1 });
    case 'avif':
      return req.lossless
        ? encodeAvif(img, { lossless: true, speed: 8 })
        : encodeAvif(img, { quality, speed: 8 });
    case 'jpeg':
      return encodeJpeg(img, { quality });
    case 'png':
      return optimisePng(await encodePng(img), { level: 2, interlace: false, optimiseAlpha: true });
  }
}

async function encode(req: EncodeRequest) {
  const img = await sized(req.maxWidth);
  const lossy = req.format !== 'png' && !req.lossless;

  // Target size: binary-search the highest quality that fits.
  if (lossy && req.targetBytes > 0) {
    let lo = 5;
    let hi = 95;
    let best: { bytes: ArrayBuffer; quality: number } | null = null;
    let smallest: { bytes: ArrayBuffer; quality: number } | null = null;
    while (lo <= hi) {
      const q = Math.round((lo + hi) / 2);
      const bytes = await encodeOnce(img, req, q);
      if (!smallest || bytes.byteLength < smallest.bytes.byteLength) smallest = { bytes, quality: q };
      if (bytes.byteLength <= req.targetBytes) {
        best = { bytes, quality: q };
        lo = q + 1;
      } else {
        hi = q - 1;
      }
    }
    const pick = best ?? smallest!;
    return { bytes: pick.bytes, quality: pick.quality, width: img.width, height: img.height, reachedTarget: !!best };
  }

  const bytes = await encodeOnce(img, req, req.quality);
  return { bytes, quality: req.quality, width: img.width, height: img.height, reachedTarget: true };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'load') {
      resized.clear();
      source = await decode(msg.file);
      const res: WorkerResponse = { id: msg.id, type: 'loaded', width: source.width, height: source.height };
      self.postMessage(res);
    } else {
      if (!source) throw new Error('No image loaded.');
      const out = await encode(msg.request);
      const res: WorkerResponse = { id: msg.id, type: 'encoded', ...out };
      self.postMessage(res, [out.bytes]);
    }
  } catch (err) {
    const res: WorkerResponse = { id: msg.id, type: 'error', message: (err as Error)?.message ?? String(err) };
    self.postMessage(res);
  }
};
