// React hooks tying the breeding service to UI components. All queries are
// reactive via dexie-react-hooks so dashboards update live as runs complete.

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../db/database';
import { resetAndReseedBreedingData, seedBreedingDataIfEmpty } from './seed';
import {
  proposeMatingPlan,
  simulateGenotypeFor,
  genotypeQC,
} from './service';
import { predictGEBVOnWorker, runEvaluationOnWorker, type EvaluationProgress } from './workerClient';
import type { Animal, BreedingValueRun, MatingPlan, TraitCode } from './types';

export type { EvaluationProgress };

let seedPromise: Promise<unknown> | null = null;

export function useEnsureBreedingSeeded(): { ready: boolean; status: string } {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Initialising breeding population…');
  useEffect(() => {
    if (!seedPromise) {
      seedPromise = (async () => {
        const r = await seedBreedingDataIfEmpty();
        if (r.seeded) {
          setStatus(`Seeded ${r.nAnimals} animals · ${r.nGenotypes} genotypes · ${r.nPhenotypes} phenotypes`);
        } else {
          setStatus(`${r.nAnimals} animals on file`);
        }
      })();
    }
    seedPromise.then(() => setReady(true)).catch((e) => setStatus('Seed error: ' + (e as Error).message));
  }, []);
  return { ready, status };
}

export function useLines() {
  return useLiveQuery(() => db.lines.toArray(), [], []);
}

export function useAnimals(lineId?: string): Animal[] | undefined {
  return useLiveQuery(
    () => (lineId ? db.animals.where('lineId').equals(lineId).toArray() : db.animals.toArray()),
    [lineId],
  );
}

export function useGenerationCounts(lineId?: string) {
  return useLiveQuery(async () => {
    const all = lineId ? await db.animals.where('lineId').equals(lineId).toArray() : await db.animals.toArray();
    const counts = new Map<number, { total: number; genotyped: number; broodstock: number }>();
    const genoIds = new Set((await db.genotypes.toArray()).map((g) => g.animalId));
    for (const a of all) {
      const c = counts.get(a.generation) ?? { total: 0, genotyped: 0, broodstock: 0 };
      c.total++;
      if (genoIds.has(a.id)) c.genotyped++;
      if (a.stage === 'broodstock') c.broodstock++;
      counts.set(a.generation, c);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [lineId]);
}

export function useLatestRunPerTrait() {
  return useLiveQuery(async () => {
    const runs = await db.bvRuns.toArray();
    runs.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    const latest = new Map<TraitCode, BreedingValueRun>();
    for (const r of runs) {
      if (r.trait === 'multi') continue;
      const t = r.trait as TraitCode;
      if (!latest.has(t)) latest.set(t, r);
    }
    return latest;
  });
}

export function useGeneticProgress(trait: TraitCode) {
  return useLiveQuery(async () => {
    const animals = await db.animals.toArray();
    const runs = await db.bvRuns.where('trait').equals(trait).toArray();
    runs.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    const latest = runs[0];
    if (!latest) return null;
    const bvs = await db.breedingValues.where('[runId+trait]').equals([latest.id, trait]).toArray();
    const idGen = new Map(animals.map((a) => [a.id, { gen: a.generation, line: a.lineId }]));
    type Bucket = { sum: number; count: number; sumAcc: number };
    const byGen = new Map<string, Bucket>();
    for (const bv of bvs) {
      const meta = idGen.get(bv.animalId);
      if (!meta) continue;
      const k = `${meta.line}|${meta.gen}`;
      const b = byGen.get(k) ?? { sum: 0, count: 0, sumAcc: 0 };
      b.sum += bv.ebv;
      b.sumAcc += bv.accuracy;
      b.count++;
      byGen.set(k, b);
    }
    const points: { line: string; generation: number; meanEBV: number; meanAccuracy: number; n: number }[] = [];
    for (const [k, v] of byGen) {
      const [line, gen] = k.split('|');
      points.push({
        line,
        generation: Number(gen),
        meanEBV: v.sum / v.count,
        meanAccuracy: v.sumAcc / v.count,
        n: v.count,
      });
    }
    points.sort((a, b) => a.line.localeCompare(b.line) || a.generation - b.generation);
    return { trait, run: latest, points };
  }, [trait]);
}

export function useGenotypeCount() {
  return useLiveQuery(() => db.genotypes.count(), []);
}

// Mutation wrappers --------------------------------------------------------

// Force Dexie's react-hooks layer to re-run live queries whose results
// may have been changed by writes from the worker context (which Dexie's
// internal observable doesn't see). We nudge by performing a no-op put on
// a tiny housekeeping row in a table the live queries depend on.
async function nudgeLiveQueries() {
  // Touch each table that downstream live queries read.
  const stamp = new Date().toISOString();
  await db.bvRuns.toCollection().limit(1).modify({ /* no-op */ }).catch(() => {});
  void stamp;
}

export function useRunEvaluation() {
  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [progress, setProgress] = useState<EvaluationProgress | null>(null);
  const fn = useCallback(
    async (trait: TraitCode, method: 'PBLUP' | 'ssGBLUP', panelId?: string, lineId?: string) => {
      setRunning(true);
      setLastError(null);
      setProgress(null);
      try {
        const { run } = await runEvaluationOnWorker(
          { trait, method, panelId, lineId },
          (p) => setProgress(p),
        );
        await nudgeLiveQueries();
        return run;
      } catch (e) {
        setLastError((e as Error).message);
        throw e;
      } finally {
        setRunning(false);
      }
    },
    [],
  );
  return { runEvaluation: fn, running, lastError, progress };
}

export function usePredictGEBV() {
  return useCallback(async (animalId: string) => {
    const g = await db.genotypes.get(animalId);
    if (!g) throw new Error('animal not genotyped');
    const animal = await db.animals.get(animalId);
    const buf = await g.dosage.arrayBuffer();
    const { result, elapsedMs } = await predictGEBVOnWorker({
      dosage: new Uint8Array(buf),
      panelId: g.panelId,
      lineId: animal?.lineId,
    });
    return { result, ms: elapsedMs };
  }, []);
}

export function useGenotypeAction() {
  return useCallback(async (animalId: string, panelId: string) => {
    await simulateGenotypeFor(animalId, panelId);
  }, []);
}

export function useResetAndReseed() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const fn = useCallback(async () => {
    setBusy(true);
    try {
      const r = await resetAndReseedBreedingData((m) => setProgress(m));
      return r;
    } finally {
      setBusy(false);
    }
  }, []);
  return { reseed: fn, busy, progress };
}

export function useGenotypeQC(panelId: string | null) {
  return useLiveQuery(async () => (panelId ? await genotypeQC(panelId) : null), [panelId]);
}

export function useProposeMatingPlan() {
  return useCallback(
    (...args: Parameters<typeof proposeMatingPlan>) => proposeMatingPlan(...args),
    [],
  );
}

export type { MatingPlan };

// -------------------------------------------------------------------------
// Batch / live-action hooks

import type { Batch, ProgramStatus } from './types';
import { selectCandidate, deselectCandidate, cullAnimal } from './service';

// All batches, latest first by spawn date.
export function useBatches(): Batch[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.batches.toArray();
    all.sort((a, b) => b.spawnDate.localeCompare(a.spawnDate));
    return all;
  }, []);
}

// Just the batches that have pending farm-floor decisions right now —
// status='selection' (keepersort), 'mating' (broodstock pairing), or
// 'spawning' (matings being executed). Used by the home-screen action board.
export function useActiveBatches(): Batch[] | undefined {
  return useLiveQuery(async () => {
    const open: Batch['status'][] = ['selection', 'mating', 'spawning', 'family-tank'];
    const rows = await db.batches.where('status').anyOf(open).toArray();
    rows.sort((a, b) => a.spawnDate.localeCompare(b.spawnDate));
    return rows;
  }, []);
}

// Candidates from one batch (NP, programStatus = candidate or selected), with
// the tagW phenotype joined in so the keepersort UI can show something useful
// even before BLUP runs. Sorted by descending TagW as a placeholder index.
export function useBatchCandidates(batchId: string | null) {
  return useLiveQuery(async () => {
    if (!batchId) return [];
    const animals = await db.animals
      .where('batchId').equals(batchId)
      .filter((a) => a.tier === 'NP' && a.testSite === undefined)
      .toArray();
    const tagWPhenos = await db.phenotypes
      .where('animalId').anyOf(animals.map((a) => a.id))
      .filter((p) => p.trait === 'TagW')
      .toArray();
    const tagW = new Map(tagWPhenos.map((p) => [p.animalId, p.value]));
    const rows = animals.map((a) => ({
      animal: a,
      tagW: tagW.get(a.id) ?? null,
    }));
    rows.sort((x, y) => (y.tagW ?? -Infinity) - (x.tagW ?? -Infinity));
    return rows;
  }, [batchId]);
}

export function useSelectAction() {
  return useCallback(
    async (animalId: string, actor: string, status: ProgramStatus) => {
      if (status === 'selected') return selectCandidate(animalId, actor);
      if (status === 'deselected') return deselectCandidate(animalId, actor);
      if (status === 'culled') return cullAnimal(animalId, actor);
      throw new Error(`unsupported transition: ${status}`);
    },
    [],
  );
}
