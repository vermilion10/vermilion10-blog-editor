import type { EncodeRequest, WorkerRequest, WorkerResponse } from './types';

type Encoded = Extract<WorkerResponse, { type: 'encoded' }>;
// Omit that keeps the union (plain Omit would merge its members).
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

/**
 * One worker per open image dialog. Requests are answered in order; callers
 * that fire several encodes while settings change just use the latest result.
 */
export class ImageProcessor {
  private worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private waiting = new Map<number, { resolve: (r: WorkerResponse) => void }>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      this.waiting.get(e.data.id)?.resolve(e.data);
      this.waiting.delete(e.data.id);
    };
  }

  private send(msg: WithoutId<WorkerRequest>): Promise<WorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, { resolve });
      this.worker.postMessage({ ...msg, id } as WorkerRequest);
    });
  }

  async load(file: Blob): Promise<{ width: number; height: number }> {
    const res = await this.send({ type: 'load', file });
    if (res.type === 'error') throw new Error(res.message);
    if (res.type !== 'loaded') throw new Error('Unexpected worker reply.');
    return { width: res.width, height: res.height };
  }

  async encode(request: EncodeRequest): Promise<Encoded> {
    const res = await this.send({ type: 'encode', request });
    if (res.type === 'error') throw new Error(res.message);
    if (res.type !== 'encoded') throw new Error('Unexpected worker reply.');
    return res;
  }

  dispose() {
    this.worker.terminate();
    this.waiting.clear();
  }
}
