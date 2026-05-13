// Singleton wrapper around the breeding Web Worker. Tracks request IDs so
// concurrent calls don't cross-talk. The worker is created lazily on first
// use (and survives across screens), keeping its module-level Dexie
// connection warm.

import type { BreedingValueRun, TraitCode } from './types';

type GEBVRow = { trait: TraitCode; gebv: number; modelVersion: string; usedLine: string | null };

type DonePayload =
  | { type: 'done'; run: BreedingValueRun; elapsedMs: number }
  | { type: 'done'; result: GEBVRow[]; elapsedMs: number };

type ErrorPayload = { type: 'error'; error: string };

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

type AnyResponse = (DonePayload | ErrorPayload) & { id: string };

function sendRequest<T>(payload: object): Promise<T> {
  const w = getWorker();
  const id = String(nextId++);
  return new Promise<T>((resolve, reject) => {
    const handler = (e: MessageEvent<AnyResponse>) => {
      const data = e.data;
      if (data.id !== id) return;
      w.removeEventListener('message', handler);
      if (data.type === 'error') {
        reject(new Error(data.error));
      } else {
        resolve(data as unknown as T);
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ id, ...payload });
  });
}

export async function runEvaluationOnWorker(args: {
  trait: TraitCode;
  method: 'PBLUP' | 'ssGBLUP';
  panelId?: string;
  lineId?: string;
}): Promise<{ run: BreedingValueRun; elapsedMs: number }> {
  const r = await sendRequest<{ run: BreedingValueRun; elapsedMs: number }>({
    type: 'runEvaluation',
    payload: args,
  });
  return r;
}

export async function predictGEBVOnWorker(args: {
  dosage: Uint8Array;
  panelId: string;
  lineId?: string | null;
}): Promise<{ result: GEBVRow[]; elapsedMs: number }> {
  const buf = args.dosage.buffer.slice(
    args.dosage.byteOffset,
    args.dosage.byteOffset + args.dosage.byteLength,
  ) as ArrayBuffer;
  const r = await sendRequest<{ result: GEBVRow[]; elapsedMs: number }>({
    type: 'predictGEBV',
    payload: { dosage: buf, panelId: args.panelId, lineId: args.lineId },
  });
  return r;
}
