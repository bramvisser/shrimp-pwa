/// <reference lib="webworker" />
//
// Web Worker for the breeding compute. Runs ssGBLUP / PBLUP off the main
// thread so the UI stays responsive while the solver iterates. The worker
// opens its own Dexie connection (shares the underlying IndexedDB), runs
// the existing service routines, and posts back a `done` event. The main
// thread then nudges Dexie's live-query layer so dashboards update.

import { runEvaluation, predictGEBV } from './service';
import type { TraitCode } from './types';

declare const self: DedicatedWorkerGlobalScope;

type RunMsg = {
  id: string;
  type: 'runEvaluation';
  payload: {
    trait: TraitCode;
    method: 'PBLUP' | 'ssGBLUP';
    panelId?: string;
    lineId?: string;
  };
};

type PredictMsg = {
  id: string;
  type: 'predictGEBV';
  payload: {
    dosage: ArrayBuffer;
    panelId: string;
    lineId?: string | null;
  };
};

type IncomingMsg = RunMsg | PredictMsg;

self.addEventListener('message', async (e: MessageEvent<IncomingMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'runEvaluation') {
      const t0 = performance.now();
      const run = await runEvaluation(msg.payload);
      self.postMessage({
        id: msg.id,
        type: 'done',
        run,
        elapsedMs: performance.now() - t0,
      });
    } else if (msg.type === 'predictGEBV') {
      const dosage = new Uint8Array(msg.payload.dosage);
      const t0 = performance.now();
      const result = await predictGEBV(dosage, msg.payload.panelId, msg.payload.lineId);
      self.postMessage({
        id: msg.id,
        type: 'done',
        result,
        elapsedMs: performance.now() - t0,
      });
    }
  } catch (err) {
    self.postMessage({
      id: msg.id,
      type: 'error',
      error: (err as Error).message,
    });
  }
});

export {};
