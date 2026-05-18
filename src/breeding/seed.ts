// Batch-based seeder for the Speed (SP) + Strength (ST) breeding program.
//
// Mirrors the real Hendrix Genetics shrimp BP: each line runs three overlapping
// spawning batches per year (Jan / May / Sep). At "now" the latest fully-grown
// batch (G5_09 for each line) sits at the keepersort decision point with EBVs
// back, awaiting selection. Earlier historic batches are fully processed
// (selected → mated → inactive). The just-spawned batch (G6_01) is in the
// family-tank growth phase; an even more recent batch (G6_05) is planned but
// not yet spawned.
//
// Per batch we materialise:
//   • 72 full-sib families produced by 1:1 matings of selected broodstock from
//     prior batches (cross-batch mating allowed).
//   • Per family — NP candidates kept in the nucleus, plus single sibs sent to
//     Hawaii nucleus harvest (HBW + TagW), EMS challenge (EMS_SURV + EMS_DtD),
//     and the Indonesia + India commercial sentinels (OP).
//   • Genotypes at PL stage on a configurable subset of candidates (default
//     100M + 100F per batch, scaled from the production target of 900 + 900).
//
// Genetic gain emerges naturally because each cohort's parents are the top-
// indexed selected broodstock from the previous batches.

import { db } from '../db/database';
import {
  TRAITS,
  GCORR,
  makePanel,
  geneticCholesky,
  founderTrueBV,
  founderGenotype,
  offspringTrueBV,
  offspringGenotype,
  phenotypeFor,
  imputeFromFreq,
  indexFromTrueBV,
  resetIds,
  nextId,
} from './simulator';
import { makeRng, type Rng } from './math/rng';
import type {
  Animal,
  Batch,
  LifecycleEvent,
  Line,
  Mating,
  Phenotype,
  Sex,
  SnpPanel,
  TestSite,
  Tier,
  TraitCode,
} from './types';

// --------------------------------------------------------------------------
// Configuration

const LINES: Line[] = [
  {
    id: 'SP',
    name: 'Speed Line',
    kind: 'SPF',
    pathogenFocus: null,
    foundedAt: '2020-01-01',
    notes: 'Growth-focused nucleus line. Selection emphasis on HBW, TagW, OP.',
  },
  {
    id: 'ST',
    name: 'Strength Line',
    kind: 'SPF',
    pathogenFocus: 'EMS',
    foundedAt: '2020-01-01',
    notes: 'Disease-resistance nucleus line. Selection emphasis on EMS_SURV, EMS_DtD.',
  },
];

type SeederConfig = {
  foundersPerSex: number;
  yearsHistory: number;       // G1..GN (fully processed)
  batchSequences: number[];   // batch numbers within a year (e.g. [1, 5, 9])
  familiesPerBatch: number;
  candidatesPerFamilyNP: number;
  hawaiiSibsPerFamily: number;
  emsSibsPerFamily: number;
  indonesiaSentinelsPerFamily: number;
  indiaSentinelsPerFamily: number;
  selectedMperBatch: number;
  selectedFperBatch: number;
  genotypedPerSex: number;
  panelDensity: number;
  startYear: number;
  nowYear: number;
  nowWeek: number;
};

// Default configuration: scaled down from the production-grade numbers in the
// Hendrix BP deck so a browser-based PWA can seed in a few seconds and store
// the result in IndexedDB without strain. Easy to scale up via the in-app
// reseed action by editing this object.
const DEFAULT_CFG: SeederConfig = {
  foundersPerSex: 150,         // 300 founders/line (real: hundreds)
  yearsHistory: 5,             // G1..G5 fully processed, G6 in flight
  batchSequences: [1, 5, 9],   // Jan, May, Sep spawn waves
  familiesPerBatch: 72,        // real BP: 60–72
  candidatesPerFamilyNP: 3,    // real BP: ~10 candidates per family in NP
  hawaiiSibsPerFamily: 1,
  emsSibsPerFamily: 1,
  indonesiaSentinelsPerFamily: 1,
  indiaSentinelsPerFamily: 1,
  selectedMperBatch: 216,      // 72 matings × 3 reserve = realistic-ish for keepersort
  selectedFperBatch: 216,
  genotypedPerSex: 100,        // real BP: 900M + 900F
  panelDensity: 500,           // real BP: 50K
  startYear: 2020,
  nowYear: 2026,
  nowWeek: 20,                 // mid-May
};

// --------------------------------------------------------------------------
// Public API

export type SeedResult = {
  seeded: boolean;
  nAnimals: number;
  nBatches: number;
  nGenotypes: number;
  nPhenotypes: number;
  nMatings: number;
};

export async function seedBreedingDataIfEmpty(): Promise<SeedResult> {
  const existing = await db.animals.count();
  if (existing > 0) {
    return {
      seeded: false,
      nAnimals: existing,
      nBatches: await db.batches.count(),
      nGenotypes: await db.genotypes.count(),
      nPhenotypes: await db.phenotypes.count(),
      nMatings: await db.matings.count(),
    };
  }
  return runSeed();
}

export async function resetAndReseedBreedingData(
  onProgress?: (msg: string) => void,
): Promise<SeedResult> {
  onProgress?.('Clearing existing breeding tables…');
  await db.transaction(
    'rw',
    [
      db.lines,
      db.traits,
      db.geneticCorrelations,
      db.animals,
      db.phenotypes,
      db.challenges,
      db.snpPanels,
      db.genotypes,
      db.snpEffects,
      db.bvRuns,
      db.breedingValues,
      db.selectionIndices,
      db.matingPlans,
      db.decisionLog,
      db.batches,
      db.matings,
      db.lifecycleEvents,
    ],
    async () => {
      await Promise.all([
        db.lines.clear(),
        db.traits.clear(),
        db.geneticCorrelations.clear(),
        db.animals.clear(),
        db.phenotypes.clear(),
        db.challenges.clear(),
        db.snpPanels.clear(),
        db.genotypes.clear(),
        db.snpEffects.clear(),
        db.bvRuns.clear(),
        db.breedingValues.clear(),
        db.selectionIndices.clear(),
        db.matingPlans.clear(),
        db.decisionLog.clear(),
        db.batches.clear(),
        db.matings.clear(),
        db.lifecycleEvents.clear(),
      ]);
    },
  );
  return runSeed(onProgress);
}

// --------------------------------------------------------------------------
// Seeder body

async function runSeed(onProgress?: (msg: string) => void): Promise<SeedResult> {
  resetIds();
  const cfg = DEFAULT_CFG;
  const rng = makeRng(42);
  const panel = makePanel(rng, cfg.panelDensity);
  const { L } = geneticCholesky();

  await db.lines.bulkPut(LINES);
  await db.traits.bulkPut(TRAITS);
  await db.geneticCorrelations.bulkPut(GCORR);
  await db.snpPanels.put(panel);

  // Accumulators flushed to Dexie at the end (one bulk-put per table).
  const allAnimals: Animal[] = [];
  const allBatches: Batch[] = [];
  const allPhenotypes: Phenotype[] = [];
  const allMatings: Mating[] = [];
  const allEvents: LifecycleEvent[] = [];
  // Genotype Map per animal id — stored as Blob at the end.
  const genotypes = new Map<string, Uint8Array>();
  // Internal cache: every adult we'll need to draw gametes from has its
  // dosage stashed here, whether or not it's officially "genotyped".
  const adultGenotypes = new Map<string, Uint8Array>();

  for (const line of LINES) {
    onProgress?.(`Seeding line ${line.id} (${line.name})…`);
    seedLine({
      line,
      cfg,
      rng,
      L,
      panel,
      animals: allAnimals,
      batches: allBatches,
      phenotypes: allPhenotypes,
      matings: allMatings,
      events: allEvents,
      genotypes,
      adultGenotypes,
    });
  }

  // ----- Persist -----
  onProgress?.(`Persisting ${allBatches.length} batches…`);
  await db.batches.bulkPut(allBatches);

  onProgress?.(`Persisting ${allAnimals.length.toLocaleString()} animals…`);
  const CHUNK = 5000;
  for (let i = 0; i < allAnimals.length; i += CHUNK) {
    await db.animals.bulkPut(allAnimals.slice(i, i + CHUNK));
  }

  onProgress?.(`Persisting ${genotypes.size.toLocaleString()} genotypes…`);
  const genoRows = Array.from(genotypes, ([animalId, dosage]) => ({
    animalId,
    panelId: panel.id,
    callRate: 0.99,
    genotypedAt: new Date().toISOString(),
    dosage: new Blob([new Uint8Array(dosage)]),
  }));
  for (let i = 0; i < genoRows.length; i += CHUNK) {
    await db.genotypes.bulkPut(genoRows.slice(i, i + CHUNK));
  }

  onProgress?.(`Persisting ${allPhenotypes.length.toLocaleString()} phenotypes…`);
  for (let i = 0; i < allPhenotypes.length; i += CHUNK) {
    await db.phenotypes.bulkPut(allPhenotypes.slice(i, i + CHUNK));
  }

  onProgress?.(`Persisting ${allMatings.length} matings…`);
  await db.matings.bulkPut(allMatings);

  onProgress?.(`Persisting ${allEvents.length.toLocaleString()} lifecycle events…`);
  for (let i = 0; i < allEvents.length; i += CHUNK) {
    await db.lifecycleEvents.bulkPut(allEvents.slice(i, i + CHUNK));
  }

  onProgress?.('Done.');
  return {
    seeded: true,
    nAnimals: allAnimals.length,
    nBatches: allBatches.length,
    nGenotypes: genoRows.length,
    nPhenotypes: allPhenotypes.length,
    nMatings: allMatings.length,
  };
}

// --------------------------------------------------------------------------
// Per-line generator

type LineCtx = {
  line: Line;
  cfg: SeederConfig;
  rng: Rng;
  L: number[][];
  panel: SnpPanel;
  animals: Animal[];
  batches: Batch[];
  phenotypes: Phenotype[];
  matings: Mating[];
  events: LifecycleEvent[];
  genotypes: Map<string, Uint8Array>;
  adultGenotypes: Map<string, Uint8Array>;
};

function seedLine(ctx: LineCtx): void {
  const { line, cfg } = ctx;

  // ---- Founders (G0) ----
  const founderDate = new Date(`${cfg.startYear}-01-15T00:00:00Z`);
  const founders: Animal[] = [];
  for (const sex of ['M', 'F'] as Sex[]) {
    for (let i = 0; i < cfg.foundersPerSex; i++) {
      const id = mkId();
      const bv = founderTrueBV(ctx.rng, ctx.L);
      const a: Animal = {
        id,
        lineId: line.id,
        sireId: null,
        damId: null,
        familyId: null,
        sex,
        birthDate: founderDate.toISOString().slice(0, 10),
        generation: 0,
        tankId: `T-${line.id}-G0-${sex}`,
        stage: 'broodstock',
        spfStatus: 'SPF',
        batchId: null,
        tier: 'NP',
        programStatus: 'inactive',     // founders consumed by G1 batches
        __trueBV: bv,
        createdAt: founderDate.toISOString(),
      };
      ctx.animals.push(a);
      founders.push(a);
      const fg = founderGenotype(ctx.rng, ctx.panel);
      ctx.adultGenotypes.set(id, fg);
      if (ctx.rng() < 0.85) ctx.genotypes.set(id, fg);
    }
  }

  // ---- Historic + current batches ----
  // Selected-broodstock pool by sex, ranked by index. Each batch pulls its
  // 72 sires + 72 dams from this pool; used animals get popped.
  const availableM: Animal[] = founders.filter((a) => a.sex === 'M');
  const availableF: Animal[] = founders.filter((a) => a.sex === 'F');

  // Generate batches in chronological order: years startYear+1..nowYear.
  for (let year = cfg.startYear + 1; year <= cfg.nowYear; year++) {
    const generation = year - cfg.startYear;
    for (const seq of cfg.batchSequences) {
      const stage = classifyBatch(year, seq, cfg);
      if (stage === 'future') continue; // batches beyond the cutoff don't exist yet

      const batch = makeBatch(line.id, year, seq, generation, stage);
      ctx.batches.push(batch);

      generateBatch({
        ctx,
        batch,
        generation,
        availableM,
        availableF,
        stage,
      });
    }
  }
}

// --------------------------------------------------------------------------
// Batch-stage classification at "now"

// A batch's life-cycle position relative to `now`. Drives how much of the
// pipeline (spawn → grow → keepersort → mate) we materialise.
type BatchStage =
  | 'historic'          // long past — selected → mated → inactive
  | 'keepersort'        // EBVs back, candidates awaiting selection decision
  | 'family-tank'       // young, growing in family tanks
  | 'planned'           // spawning imminent (no offspring yet)
  | 'future';           // not yet existing

function classifyBatch(year: number, seq: number, cfg: SeederConfig): BatchStage {
  const spawnYear = year;
  const spawnWeek = (seq - 1) * 17 + 1; // batch seq 1=wk1, 5=wk69→clamped, etc.
  const nowAbs = cfg.nowYear * 52 + cfg.nowWeek;
  const spawnAbs = spawnYear * 52 + Math.min(52, spawnWeek);
  const ageWeeks = nowAbs - spawnAbs;

  if (ageWeeks >= 40) return 'historic';      // batch fully processed (mated, retired)
  if (ageWeeks >= 28) return 'keepersort';    // EBVs back, decision pending
  if (ageWeeks >= 4) return 'family-tank';    // grow-out
  if (ageWeeks >= -4) return 'planned';       // spawning happening now-ish
  return 'future';
}

// --------------------------------------------------------------------------
// One batch

function makeBatch(
  lineId: string,
  year: number,
  seq: number,
  _generation: number,
  stage: BatchStage,
): Batch {
  const weekInYear = Math.min(52, (seq - 1) * 17 + 1);
  const spawn = isoDateFromYearWeek(year, weekInYear);
  const id = `${lineId}_${String(year % 100).padStart(2, '0')}${String(seq).padStart(2, '0')}`;
  // status maps from our internal lifecycle classification.
  const status =
    stage === 'planned'
      ? 'spawning'
      : stage === 'family-tank'
      ? 'family-tank'
      : stage === 'keepersort'
      ? 'selection'
      : 'completed';
  // Date-anchor dependent fields.
  const hatchDate = stage !== 'planned' ? addDays(spawn, 3) : undefined;
  const taggingDate = stage === 'historic' || stage === 'keepersort'
    ? addDays(spawn, 22 * 7) // ~22 weeks
    : undefined;
  const familyTankDate = stage !== 'planned' ? addDays(spawn, 13 * 7) : undefined;
  const selectionDate = stage === 'historic'
    ? addDays(spawn, 30 * 7)
    : undefined;
  return {
    id,
    lineId,
    year,
    sequenceInYear: seq,
    matingWeek: weekInYear,
    spawnDate: spawn.toISOString().slice(0, 10),
    hatchDate: hatchDate?.toISOString().slice(0, 10),
    familyTankDate: familyTankDate?.toISOString().slice(0, 10),
    taggingDate: taggingDate?.toISOString().slice(0, 10),
    selectionDate: selectionDate?.toISOString().slice(0, 10),
    status,
  };
}

// --------------------------------------------------------------------------
// Batch-level generation

function generateBatch(args: {
  ctx: LineCtx;
  batch: Batch;
  generation: number;
  availableM: Animal[];
  availableF: Animal[];
  stage: BatchStage;
}): void {
  const { ctx, batch, generation, availableM, availableF, stage } = args;
  const { cfg } = ctx;

  // ---- 'planned': nothing spawned yet ----
  if (stage === 'planned') {
    // Batch record alone is enough; user will create matings interactively.
    return;
  }

  // Pick 72 sires + 72 dams from the top of the available-broodstock pool.
  // If we don't have enough yet (early generations), repeat-mate. We prefer
  // top-indexed animals so genetic gain accrues realistically.
  rankByIndexDescending(availableM);
  rankByIndexDescending(availableF);
  const sires = takeFirst(availableM, cfg.familiesPerBatch);
  const dams = takeFirst(availableF, cfg.familiesPerBatch);
  if (sires.length === 0 || dams.length === 0) return;

  const spawn = new Date(`${batch.spawnDate}T00:00:00Z`);
  const taggingDate = batch.taggingDate
    ? new Date(`${batch.taggingDate}T00:00:00Z`)
    : new Date(spawn.getTime() + 22 * 7 * 86400000);

  // Family-tank phenotyping reference dates.
  const hawaiiHarvestDate = addDays(spawn, 26 * 7); // 26 weeks
  const emsChallengeDate = addDays(spawn, 7 * 7);   // 7 weeks (PL stage)
  const sentinelHarvestDate = addDays(spawn, 30 * 7);

  for (let f = 0; f < cfg.familiesPerBatch; f++) {
    const sire = sires[f % sires.length];
    const dam = dams[f % dams.length];
    if (!sire.__trueBV || !dam.__trueBV) continue;
    const familyId = `${batch.id}_F${String(f + 1).padStart(3, '0')}`;

    // Record the executed mating.
    const matingId = `M-${batch.id}-${String(f + 1).padStart(3, '0')}`;
    ctx.matings.push({
      id: matingId,
      offspringBatchId: batch.id,
      sireId: sire.id,
      damId: dam.id,
      spawnTank: `MT-${batch.id}-${String(f + 1).padStart(3, '0')}`,
      plannedAt: addDays(spawn, -14).toISOString(),
      executedAt: spawn.toISOString(),
      status: 'executed',
      familyId,
      offspringCount:
        cfg.candidatesPerFamilyNP +
        cfg.hawaiiSibsPerFamily +
        cfg.emsSibsPerFamily +
        cfg.indonesiaSentinelsPerFamily +
        cfg.indiaSentinelsPerFamily,
    });
    // Mark parents as 'mated' (lifecycle: no longer available).
    markMated(ctx, sire, spawn);
    markMated(ctx, dam, spawn);

    const mkOffspring = (
      tier: Tier,
      testSite: TestSite | undefined,
      tankPrefix: string,
    ): Animal => {
      const id = mkId();
      const sex: Sex = ctx.rng() < 0.5 ? 'F' : 'M';
      const bv = offspringTrueBV(ctx.rng, ctx.L, sire.__trueBV!, dam.__trueBV!);
      const a: Animal = {
        id,
        lineId: batch.lineId,
        sireId: sire.id,
        damId: dam.id,
        familyId,
        sex,
        birthDate: spawn.toISOString().slice(0, 10),
        generation,
        tankId: `${tankPrefix}-${batch.id}-${String(f + 1).padStart(3, '0')}`,
        stage: stage === 'historic' ? 'harvested' : 'juvenile',
        spfStatus: 'SPF',
        batchId: batch.id,
        tier,
        testSite,
        programStatus: 'candidate',
        __trueBV: bv,
        createdAt: spawn.toISOString(),
      };
      ctx.animals.push(a);
      return a;
    };

    // ---- NP candidates ----
    const candidates: Animal[] = [];
    for (let k = 0; k < cfg.candidatesPerFamilyNP; k++) {
      candidates.push(mkOffspring('NP', undefined, `T-NP`));
    }
    // ---- Hawaii sibs (NP, HBW + TagW phenotyped) ----
    for (let k = 0; k < cfg.hawaiiSibsPerFamily; k++) {
      const a = mkOffspring('NP', 'hawaii-nucleus', `T-HW`);
      a.programStatus = 'inactive';
      if (stage === 'historic' || stage === 'keepersort') {
        phenotypeOne(ctx, a, 'HBW', hawaiiHarvestDate);
        phenotypeOne(ctx, a, 'TagW', taggingDate);
      }
    }
    // ---- EMS challenge sibs (NP, EMS_SURV + EMS_DtD phenotyped) ----
    for (let k = 0; k < cfg.emsSibsPerFamily; k++) {
      const a = mkOffspring('NP', 'ems-challenge', `T-EMS`);
      a.programStatus = 'inactive';
      a.stage = 'dead';
      if (stage === 'historic' || stage === 'keepersort') {
        phenotypeOne(ctx, a, 'EMS_SURV', emsChallengeDate, `EMS-${batch.id}`);
        phenotypeOne(ctx, a, 'EMS_DtD', emsChallengeDate, `EMS-${batch.id}`);
      }
    }
    // ---- Indonesia commercial sentinels (MP, OP phenotyped) ----
    for (let k = 0; k < cfg.indonesiaSentinelsPerFamily; k++) {
      const a = mkOffspring('MP', 'indonesia-sentinel', `T-IDN`);
      a.programStatus = 'inactive';
      if (stage === 'historic') {
        phenotypeOne(ctx, a, 'OP', sentinelHarvestDate, `IDN-${batch.id}`);
      }
    }
    // ---- India commercial sentinels (MP, OP phenotyped) ----
    for (let k = 0; k < cfg.indiaSentinelsPerFamily; k++) {
      const a = mkOffspring('MP', 'india-sentinel', `T-IND`);
      a.programStatus = 'inactive';
      if (stage === 'historic') {
        phenotypeOne(ctx, a, 'OP', sentinelHarvestDate, `IND-${batch.id}`);
      }
    }

    // TagW on the candidate group itself (every candidate gets weighed at tagging).
    if (stage === 'historic' || stage === 'keepersort') {
      for (const c of candidates) {
        phenotypeOne(ctx, c, 'TagW', taggingDate);
      }
    }
  }

  // ---- Genotyping at PL stage on the candidate group ----
  // We pick the top genotypedPerSex per sex by true index as a stand-in for
  // the production rule "best 900/sex from the finclip pool".
  if (stage === 'historic' || stage === 'keepersort') {
    genotypeBestCandidates(ctx, batch);
  }

  // ---- Keepersort + lifecycle for historic batches ----
  if (stage === 'historic') {
    runHistoricKeepersort(ctx, batch, generation, availableM, availableF);
  } else if (stage === 'keepersort') {
    // At the keepersort decision point, candidates are alive and tagged but
    // not yet selected. Tag them with `pitTag` to reflect that selection is
    // pending. UI in Phase D/E will drive the actual selection action.
    for (const a of ctx.animals) {
      if (a.batchId === batch.id && a.tier === 'NP' && a.testSite === undefined) {
        a.pitTag = `PIT-${a.id.slice(-7)}`;
      }
    }
  } else if (stage === 'family-tank') {
    // Younger batch — no tagging or selection yet.
  }
}

// --------------------------------------------------------------------------
// Helpers

function rankByIndexDescending(pool: Animal[]): void {
  pool.sort((a, b) => indexFromTrueBV(b.__trueBV!) - indexFromTrueBV(a.__trueBV!));
}

function takeFirst(pool: Animal[], n: number): Animal[] {
  // Greedy: take top-n. Caller is expected to remove "used" animals separately
  // via markMated; we don't pop here so a pool can be repeat-sampled when
  // tiny (early generations).
  return pool.slice(0, Math.min(n, pool.length));
}

function markMated(ctx: LineCtx, animal: Animal, when: Date): void {
  if (animal.programStatus === 'mated') return;
  animal.programStatus = 'mated';
  animal.matedAt = when.toISOString();
  ctx.events.push({
    id: `EV-${animal.id}-mated`,
    animalId: animal.id,
    ts: when.toISOString(),
    kind: 'mated',
    actor: 'system',
  });
}

function phenotypeOne(
  ctx: LineCtx,
  a: Animal,
  code: TraitCode,
  when: Date,
  challengeId?: string,
): void {
  if (!a.__trueBV) return;
  const trait = TRAITS.find((t) => t.code === code);
  if (!trait) return;
  const y = phenotypeFor(ctx.rng, trait, a.__trueBV[code]);
  ctx.phenotypes.push({
    id: `P-${a.id}-${code}`,
    animalId: a.id,
    trait: code,
    value: y,
    measuredAt: when.toISOString(),
    context: challengeId ? { challengeId } : undefined,
  });
  ctx.events.push({
    id: `EV-${a.id}-pheno-${code}`,
    animalId: a.id,
    ts: when.toISOString(),
    kind: 'phenotyped',
    actor: 'system',
    details: { trait: code, value: y },
  });
}

function genotypeBestCandidates(ctx: LineCtx, batch: Batch): void {
  // Collect candidates from this batch.
  const cands = ctx.animals.filter(
    (a) => a.batchId === batch.id && a.tier === 'NP' && a.testSite === undefined,
  );
  const males = cands.filter((a) => a.sex === 'M').sort(byTrueIndexDesc);
  const females = cands.filter((a) => a.sex === 'F').sort(byTrueIndexDesc);
  const pick = [
    ...males.slice(0, ctx.cfg.genotypedPerSex),
    ...females.slice(0, ctx.cfg.genotypedPerSex),
  ];
  const taggingDate = new Date(batch.taggingDate ?? batch.spawnDate);
  for (const a of pick) {
    const sireG = ctx.adultGenotypes.get(a.sireId ?? '') ?? imputeFromFreq(ctx.rng, ctx.panel);
    const damG = ctx.adultGenotypes.get(a.damId ?? '') ?? imputeFromFreq(ctx.rng, ctx.panel);
    const og = offspringGenotype(ctx.rng, ctx.panel, sireG, damG);
    ctx.adultGenotypes.set(a.id, og);
    ctx.genotypes.set(a.id, og);
    ctx.events.push({
      id: `EV-${a.id}-geno`,
      animalId: a.id,
      ts: taggingDate.toISOString(),
      kind: 'genotyped',
      actor: 'system',
    });
  }
}

function runHistoricKeepersort(
  ctx: LineCtx,
  batch: Batch,
  _generation: number,
  availableM: Animal[],
  availableF: Animal[],
): void {
  const { cfg } = ctx;
  // Candidates from this batch (NP only, not sib destinations).
  const cands = ctx.animals.filter(
    (a) => a.batchId === batch.id && a.tier === 'NP' && a.testSite === undefined,
  );
  const males = cands.filter((a) => a.sex === 'M').sort(byTrueIndexDesc);
  const females = cands.filter((a) => a.sex === 'F').sort(byTrueIndexDesc);
  const selM = males.slice(0, cfg.selectedMperBatch);
  const selF = females.slice(0, cfg.selectedFperBatch);
  const selectionDate = new Date(batch.selectionDate ?? batch.spawnDate);

  for (const a of cands) {
    if (selM.includes(a) || selF.includes(a)) {
      a.programStatus = 'selected';
      a.selectedAt = selectionDate.toISOString();
      a.stage = 'broodstock';
      a.spawnTank = `MAT-${batch.id}-${a.sex}`;
      // Ensure selected animals carry genotypes (the rest of the broodstock
      // would also be genotyped in real ops once they pass keepersort).
      if (!ctx.genotypes.has(a.id)) {
        const sireG = ctx.adultGenotypes.get(a.sireId ?? '') ?? imputeFromFreq(ctx.rng, ctx.panel);
        const damG = ctx.adultGenotypes.get(a.damId ?? '') ?? imputeFromFreq(ctx.rng, ctx.panel);
        const og = offspringGenotype(ctx.rng, ctx.panel, sireG, damG);
        ctx.adultGenotypes.set(a.id, og);
        ctx.genotypes.set(a.id, og);
      }
      ctx.events.push({
        id: `EV-${a.id}-selected`,
        animalId: a.id,
        ts: selectionDate.toISOString(),
        kind: 'selected',
        actor: 'system',
      });
    } else {
      a.programStatus = 'deselected';
      a.deselectedAt = selectionDate.toISOString();
      a.stage = 'harvested';
      ctx.events.push({
        id: `EV-${a.id}-deselected`,
        animalId: a.id,
        ts: selectionDate.toISOString(),
        kind: 'deselected',
        actor: 'system',
      });
    }
  }

  // Push selected broodstock onto the line's available pool so future batches
  // can mate from them. (Their `mated` transition happens when consumed.)
  availableM.push(...selM);
  availableF.push(...selF);
}

const byTrueIndexDesc = (a: Animal, b: Animal): number =>
  indexFromTrueBV(b.__trueBV!) - indexFromTrueBV(a.__trueBV!);

function isoDateFromYearWeek(year: number, week: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  return new Date(jan1.getTime() + (week - 1) * 7 * 86400000);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

function mkId(): string {
  return `A${nextId()}`;
}
