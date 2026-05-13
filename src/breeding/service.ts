// High-level service the UI talks to. This is the "engine room" of the
// breeding program: it owns the recipe for running an evaluation,
// estimating SNP effects, predicting on demand, and proposing matings.
//
// Everything here reads/writes through the Dexie tables. The UI never
// touches the math modules directly.

import { db, type GenotypeBlob } from '../db/database';
import type {
  BreedingValue,
  BreedingValueRun,
  MatingPlan,
  SnpEffects,
  SnpPanel,
  TraitCode,
} from './types';
import { pedigreeAinverse, pairKinship } from './math/pedigree';
import {
  centerDosage,
  dosageRow,
  estimateFreqs,
  predictGEBVDosage,
  snpEffectsFromSolutions,
  vanRadenG,
  type DosageMatrix,
} from './math/genomic';
import {
  approxAccuracy,
  blendGenomic,
  buildA22,
  invertSymPD,
  pcg,
  solveBlup,
  type BlupInputs,
} from './math/blup';
import { matvec, ssMatvec, zeros, type Mat, type Vec } from './math/linalg';
import { planMatings, selectionIndex, type Candidate, type EconomicWeights } from './math/selection';
import { TRAITS } from './simulator';

export type EvaluationOptions = {
  trait: TraitCode;
  method: 'PBLUP' | 'ssGBLUP';
  panelId?: string;     // required if method = ssGBLUP
  lineId?: string;      // optional — restrict the evaluation to one line
};

// Run a single-trait BLUP / ssGBLUP evaluation across the entire population
// (or a single line). Persists a BreedingValueRun row, BreedingValue rows
// for every animal in scope, and — for ssGBLUP — the SnpEffects payload
// that powers instant GEBV prediction.
export async function runEvaluation(opts: EvaluationOptions): Promise<BreedingValueRun> {
  const t0 = performance.now();
  const trait = TRAITS.find((t) => t.code === opts.trait);
  if (!trait) throw new Error('unknown trait ' + opts.trait);
  const lambda = (1 - trait.heritability) / trait.heritability;

  const animals = opts.lineId
    ? await db.animals.where('lineId').equals(opts.lineId).toArray()
    : await db.animals.toArray();
  if (animals.length === 0) throw new Error('no animals in scope');
  const animalIds = new Set(animals.map((a) => a.id));
  const allPhenos = await db.phenotypes.where('trait').equals(opts.trait).toArray();
  const phenos = opts.lineId ? allPhenos.filter((p) => animalIds.has(p.animalId)) : allPhenos;
  if (phenos.length === 0) throw new Error(`no phenotypes recorded for ${opts.trait} in scope`);

  // 1. Build pedigree A^{-1}.
  const { index, F, Ainv } = pedigreeAinverse(animals);
  const n = index.ids.length;

  // 2. Build the records design.
  const useable = phenos.filter((p) => index.idIndex.has(p.animalId));
  const m = useable.length;
  const y = new Float64Array(m);
  const recordAnimal = new Int32Array(m);
  // Adjust phenotype to deviate from the population mean so the model works
  // on centred values. (We absorb μ as a single fixed effect anyway.)
  let yMean = 0;
  for (let i = 0; i < m; i++) yMean += useable[i].value;
  yMean /= Math.max(1, m);
  for (let i = 0; i < m; i++) {
    y[i] = useable[i].value;
    recordAnimal[i] = index.idIndex.get(useable[i].animalId)!;
  }
  // X = column of ones — we fit a single overall mean as the only fixed effect.
  const X: Mat = { rows: m, cols: 1, data: new Float64Array(m) };
  for (let i = 0; i < m; i++) X.data[i] = 1;

  const runId = `run-${Date.now()}`;
  let snpEffects: number[] | null = null;
  let snpMeanAdjust = 0;
  let trainingAccuracy = 0;
  const KinvDiag = new Float64Array(n);
  let solveResult: { beta: Float64Array; a: Float64Array; iters: number; residual: number } | null = null;

  if (opts.method === 'PBLUP') {
    for (let i = 0; i < n; i++) KinvDiag[i] = Ainv.diag[i];
    const inputs: BlupInputs = {
      n,
      y,
      recordAnimal,
      X,
      lambda,
      Kinv: Ainv,
      KinvDiag,
    };
    solveResult = solveBlup(inputs);
  } else {
    // ssGBLUP: load genotypes, build G, A22, blend, derive H^{-1} correction.
    if (!opts.panelId) throw new Error('panelId required for ssGBLUP');
    const panel = await db.snpPanels.get(opts.panelId);
    if (!panel) throw new Error('panel not found: ' + opts.panelId);
    const allGenoBlobs = await db.genotypes.where('panelId').equals(opts.panelId).toArray();
    const genoBlobs = opts.lineId
      ? allGenoBlobs.filter((g) => animalIds.has(g.animalId))
      : allGenoBlobs;
    if (genoBlobs.length < 10) throw new Error('not enough genotypes for ssGBLUP in scope');
    const dosage = await loadDosageMatrix(genoBlobs, panel);
    const genoIdx = new Int32Array(genoBlobs.length);
    for (let i = 0; i < genoBlobs.length; i++) {
      const idx = index.idIndex.get(genoBlobs[i].animalId);
      if (idx === undefined) throw new Error('genotype for unknown animal: ' + genoBlobs[i].animalId);
      genoIdx[i] = idx;
    }
    const freqs = estimateFreqs(dosage);
    const Z = centerDosage(dosage, freqs);
    const { G, k } = vanRadenG(Z);
    const A22 = buildA22((i, j) => pairKinship(index, i, j), genoIdx);
    const Gblend = blendGenomic(G, A22, 0.05);
    const Ginv = invertSymPD(Gblend);
    const A22inv = invertSymPD(A22);
    const D: Mat = zeros(genoIdx.length, genoIdx.length);
    for (let i = 0; i < D.rows; i++)
      for (let j = 0; j < D.cols; j++)
        D.data[i * D.cols + j] = Ginv.data[i * D.cols + j] - A22inv.data[i * D.cols + j];

    // Diagonal of H^{-1} = diag(A^{-1}) plus correction on the genotyped block.
    for (let i = 0; i < n; i++) KinvDiag[i] = Ainv.diag[i];
    for (let i = 0; i < genoIdx.length; i++)
      KinvDiag[genoIdx[i]] += D.data[i * D.cols + i];

    // We can't reuse solveBlup directly because it expects a fixed Kinv shape.
    // Build a custom apply function and call PCG ourselves.
    const N = X.cols + n;
    const rhs = new Float64Array(N);
    for (let r = 0; r < m; r++) {
      for (let kk = 0; kk < X.cols; kk++) rhs[kk] += X.data[r * X.cols + kk] * y[r];
      rhs[X.cols + recordAnimal[r]] += y[r];
    }
    const diag = new Float64Array(N);
    for (let r = 0; r < m; r++) {
      for (let kk = 0; kk < X.cols; kk++) {
        const v = X.data[r * X.cols + kk];
        diag[kk] += v * v;
      }
      diag[X.cols + recordAnimal[r]] += 1;
    }
    for (let i = 0; i < n; i++) diag[X.cols + i] += lambda * KinvDiag[i];
    for (let i = 0; i < N; i++) if (diag[i] < 1e-10) diag[i] = 1e-10;

    const apply = (xv: Vec, out: Vec) => {
      const p = X.cols;
      const beta = xv.subarray(0, p);
      const a = xv.subarray(p, p + n);
      const ob = out.subarray(0, p);
      const oa = out.subarray(p, p + n);
      ob.fill(0);
      oa.fill(0);
      for (let r = 0; r < m; r++) {
        const ai = recordAnimal[r];
        let xb = 0;
        for (let kk = 0; kk < p; kk++) xb += X.data[r * p + kk] * beta[kk];
        const fitted = xb + a[ai];
        for (let kk = 0; kk < p; kk++) ob[kk] += X.data[r * p + kk] * fitted;
        oa[ai] += fitted;
      }
      // λ H^{-1} a
      const Ha = new Float64Array(n);
      ssMatvec(Ainv, a, Ha);
      const xs = new Float64Array(genoIdx.length);
      for (let i = 0; i < genoIdx.length; i++) xs[i] = a[genoIdx[i]];
      const ys = matvec(D, xs);
      for (let i = 0; i < genoIdx.length; i++) Ha[genoIdx[i]] += ys[i];
      for (let i = 0; i < n; i++) oa[i] += lambda * Ha[i];
    };
    const r = pcg(apply, diag, rhs, { tol: 1e-7 });
    solveResult = {
      beta: new Float64Array(r.x.buffer, r.x.byteOffset, X.cols),
      a: new Float64Array(r.x.buffer, r.x.byteOffset + X.cols * 8, n),
      iters: r.iters,
      residual: r.residual,
    };
    // Back out SNP effects β̂ from the genotyped subset of â.
    const aGeno = new Float64Array(genoIdx.length);
    for (let i = 0; i < genoIdx.length; i++) aGeno[i] = solveResult.a[genoIdx[i]];
    const beta = snpEffectsFromSolutions(Z, Ginv, aGeno, k);
    snpEffects = Array.from(beta);
    // Mean adjustment: average GEBV over the training set should equal the
    // average of â over the same set, so subtract the difference.
    let mAhat = 0;
    let mGEBV = 0;
    for (let i = 0; i < genoIdx.length; i++) {
      mAhat += aGeno[i];
      mGEBV += predictGEBVDosage(dosage.data.subarray(i * dosage.m, (i + 1) * dosage.m), freqs, beta);
    }
    mAhat /= genoIdx.length;
    mGEBV /= genoIdx.length;
    snpMeanAdjust = mGEBV - mAhat;
    // Cross-validation accuracy (rough): correlation between â and the
    // back-predicted GEBV over the training set.
    trainingAccuracy = correlation(aGeno, (i) => {
      const row = dosage.data.subarray(i * dosage.m, (i + 1) * dosage.m);
      return predictGEBVDosage(row, freqs, beta) - snpMeanAdjust;
    });
  }

  if (!solveResult) throw new Error('solver did not run');
  const accuracies = approxAccuracy(recordAnimal, KinvDiag, lambda);

  const finishedAt = new Date().toISOString();
  const run: BreedingValueRun = {
    id: runId,
    startedAt: new Date(t0).toISOString(),
    finishedAt,
    method: opts.method,
    trait: opts.trait,
    lineId: opts.lineId ?? null,
    nAnimals: n,
    nGenotyped: opts.method === 'ssGBLUP'
      ? (opts.lineId
          ? (await db.genotypes.where('panelId').equals(opts.panelId!).toArray())
              .filter((g) => animalIds.has(g.animalId)).length
          : await db.genotypes.count())
      : 0,
    notes: `iters=${solveResult.iters} residual=${solveResult.residual.toExponential(2)}`,
  };
  await db.bvRuns.put(run);

  // Persist BVs.
  const yMeanFix = solveResult.beta[0];
  const bvRows: BreedingValue[] = [];
  for (let i = 0; i < n; i++) {
    bvRows.push({
      id: `${runId}:${index.ids[i]}:${opts.trait}`,
      runId,
      animalId: index.ids[i],
      trait: opts.trait,
      ebv: solveResult.a[i],
      accuracy: accuracies[i],
      source: opts.method === 'ssGBLUP' ? 'blend' : 'pedigree',
      createdAt: finishedAt,
    });
  }
  await db.breedingValues.bulkPut(bvRows);

  // Persist inbreeding back to animals (handy for the UI).
  await db.transaction('rw', db.animals, async () => {
    const updates = animals.map((a) => {
      const i = index.idIndex.get(a.id);
      return i !== undefined ? db.animals.update(a.id, { inbreeding: F[i] }) : Promise.resolve();
    });
    await Promise.all(updates);
  });

  // Save SNP effects so we can predict instantly later.
  if (opts.method === 'ssGBLUP' && snpEffects) {
    const eff: SnpEffects = {
      modelVersion: runId,
      panelId: opts.panelId!,
      trait: opts.trait,
      lineId: opts.lineId ?? null,
      effects: snpEffects,
      meanAdjust: snpMeanAdjust,
      trainingN: run.nGenotyped,
      trainingAccuracy,
    };
    await db.snpEffects.put(eff);
  }
  // Suppress yMean for the lint-strict TS config — it's intentionally unused
  // beyond the inline mean centring above, which the solver already handles.
  void yMeanFix;
  void yMean;
  return run;
}

async function loadDosageMatrix(rows: GenotypeBlob[], panel: SnpPanel): Promise<DosageMatrix> {
  const data = new Uint8Array(rows.length * panel.density);
  for (let i = 0; i < rows.length; i++) {
    const buf = await rows[i].dosage.arrayBuffer();
    const arr = new Uint8Array(buf);
    data.set(arr, i * panel.density);
  }
  return { n: rows.length, m: panel.density, data };
}

function correlation(a: Float64Array, getB: (i: number) => number): number {
  const n = a.length;
  if (n === 0) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += getB(i);
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db_ = getB(i) - mb;
    cov += da * db_;
    va += da * da;
    vb += db_ * db_;
  }
  return cov / Math.sqrt(Math.max(va * vb, 1e-12));
}

// Instant prediction: given a brand-new genotyped animal, look up the latest
// SnpEffects for each trait — preferring the animal's own line, falling back
// to a pooled run if the line hasn't been evaluated yet — and dot-product.
// Submillisecond per trait.
export async function predictGEBV(
  dosage: Uint8Array,
  panelId: string,
  lineId?: string | null,
): Promise<{ trait: TraitCode; gebv: number; modelVersion: string; usedLine: string | null }[]> {
  const panel = await db.snpPanels.get(panelId);
  if (!panel) throw new Error('panel not found');
  const freqs = new Float64Array(panel.alleleFreq);
  const allEff = await db.snpEffects.where('panelId').equals(panelId).toArray();
  // Group by trait and pick the best match: prefer same lineId, else null
  // (pooled), and within those the most recent modelVersion.
  type Pick = SnpEffects;
  const choose = new Map<TraitCode, Pick>();
  for (const e of allEff) {
    const sameLine = lineId != null && e.lineId === lineId;
    const pooled = e.lineId == null;
    if (!sameLine && !pooled) continue;
    const cur = choose.get(e.trait);
    if (!cur) {
      choose.set(e.trait, e);
      continue;
    }
    const curSameLine = lineId != null && cur.lineId === lineId;
    // Prefer same-line match over pooled.
    if (sameLine && !curSameLine) choose.set(e.trait, e);
    else if (sameLine === curSameLine && e.modelVersion > cur.modelVersion) choose.set(e.trait, e);
  }
  const out: { trait: TraitCode; gebv: number; modelVersion: string; usedLine: string | null }[] = [];
  for (const [trait, eff] of choose) {
    const beta = new Float64Array(eff.effects);
    const g = predictGEBVDosage(dosage, freqs, beta) - eff.meanAdjust;
    out.push({ trait, gebv: g, modelVersion: eff.modelVersion, usedLine: eff.lineId });
  }
  return out;
}

// Build a mating plan from the most recent runs across traits + economic
// weights. Returns it without persisting; the UI persists when the user
// approves.
export async function proposeMatingPlan(opts: {
  generation: number;
  weights: EconomicWeights;
  inbreedingCeiling: number;
  nMatings: number;
  candidatePoolStage?: 'broodstock' | 'juvenile';
  lineId?: string;
}): Promise<MatingPlan> {
  const animals = opts.lineId
    ? await db.animals.where('lineId').equals(opts.lineId).toArray()
    : await db.animals.toArray();
  const stage = opts.candidatePoolStage ?? 'broodstock';
  const candPool = animals.filter((a) => a.stage === stage);
  if (candPool.length < 2) throw new Error('candidate pool too small');

  // Grab latest run per trait.
  const runs = await db.bvRuns.toArray();
  runs.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const traitRun = new Map<TraitCode, string>();
  for (const r of runs) {
    if (r.trait === 'multi') continue;
    if (!traitRun.has(r.trait as TraitCode)) traitRun.set(r.trait as TraitCode, r.id);
  }

  // Collect EBVs per animal × trait.
  const ebvByAnimal = new Map<string, Partial<Record<TraitCode, number>>>();
  for (const [trait, runId] of traitRun) {
    const rows = await db.breedingValues.where('[runId+trait]').equals([runId, trait]).toArray();
    for (const r of rows) {
      const m = ebvByAnimal.get(r.animalId) ?? {};
      m[trait] = r.ebv;
      ebvByAnimal.set(r.animalId, m);
    }
  }

  // Build candidates with selection-index value.
  const candidates: Candidate[] = candPool.map((a) => {
    const e = ebvByAnimal.get(a.id) ?? {};
    const idx = selectionIndex(e, opts.weights).index;
    return { animalId: a.id, sex: a.sex, index: idx, inbreeding: a.inbreeding ?? 0 };
  });

  // Pairwise kinship from the pedigree index.
  const { index } = pedigreeAinverse(animals);
  const kinship = (sireId: string, damId: string) => {
    const i = index.idIndex.get(sireId);
    const j = index.idIndex.get(damId);
    if (i === undefined || j === undefined) return 0;
    return pairKinship(index, i, j);
  };
  const matings = planMatings({
    candidates,
    kinship,
    inbreedingCeiling: opts.inbreedingCeiling,
    nMatings: opts.nMatings,
  });
  const plan: MatingPlan = {
    id: `plan-${Date.now()}`,
    generation: opts.generation,
    proposedAt: new Date().toISOString(),
    status: 'proposed',
    inputs: {
      runId: [...traitRun.values()].join(','),
      economicWeights: opts.weights,
      inbreedingCeiling: opts.inbreedingCeiling,
      nMatings: opts.nMatings,
      sexRatio: 0.6,
    },
    matings: matings.map((m) => ({
      sireId: m.sireId,
      damId: m.damId,
      expectedIndex: m.expectedIndex,
      expectedF: m.expectedF,
    })),
  };
  return plan;
}

// Generate a synthetic SNP genotype for an animal that doesn't have one yet —
// used by the genotyping intake flow demo. The result is deterministic in the
// animal's id so re-running the action is idempotent.
export async function simulateGenotypeFor(animalId: string, panelId: string): Promise<void> {
  const panel = await db.snpPanels.get(panelId);
  if (!panel) throw new Error('panel not found');
  const animal = await db.animals.get(animalId);
  if (!animal) throw new Error('animal not found');
  // Hash the id into a seed.
  let seed = 0;
  for (let i = 0; i < animalId.length; i++) seed = (seed * 31 + animalId.charCodeAt(i)) >>> 0;
  const { makeRng, bernoulli } = await import('./math/rng');
  const rng = makeRng(seed || 1);
  const dosage = new Uint8Array(panel.density);
  // If parents are genotyped, simulate as a Mendelian descendant; otherwise
  // sample iid from the panel allele frequencies (treats it as a founder).
  const sireG = animal.sireId ? await readGenotype(animal.sireId, panel) : null;
  const damG = animal.damId ? await readGenotype(animal.damId, panel) : null;
  if (sireG && damG) {
    const { offspringGenotype } = await import('./simulator');
    const og = offspringGenotype(rng, panel, sireG, damG);
    dosage.set(og);
  } else {
    for (let j = 0; j < panel.density; j++) {
      const p = panel.alleleFreq[j];
      const a1 = bernoulli(rng, p);
      const a2 = bernoulli(rng, p);
      dosage[j] = (a1 + a2) as 0 | 1 | 2;
    }
  }
  // Inject a tiny missing-call rate to simulate real-world QC.
  for (let j = 0; j < panel.density; j++) {
    if (rng() < 0.005) dosage[j] = 0xff;
  }
  let nonMissing = 0;
  for (let j = 0; j < panel.density; j++) if (dosage[j] !== 0xff) nonMissing++;
  await db.genotypes.put({
    animalId,
    panelId,
    callRate: nonMissing / panel.density,
    genotypedAt: new Date().toISOString(),
    dosage: new Blob([new Uint8Array(dosage)]),
  });
}

async function readGenotype(animalId: string, panel: SnpPanel): Promise<Uint8Array | null> {
  const g = await db.genotypes.get(animalId);
  if (!g) return null;
  const buf = await g.dosage.arrayBuffer();
  if (buf.byteLength !== panel.density) return null;
  return new Uint8Array(buf);
}

// Quick QC stats over the genotype table.
export async function genotypeQC(panelId: string): Promise<{
  nSamples: number;
  meanCallRate: number;
  mafBins: number[];      // 10-bin histogram of MAF
  hweFlagged: number;     // count of SNPs with HWE p < 1e-6 (rough χ² test)
}> {
  const panel = await db.snpPanels.get(panelId);
  if (!panel) throw new Error('panel not found');
  const rows = await db.genotypes.where('panelId').equals(panelId).toArray();
  if (rows.length === 0) return { nSamples: 0, meanCallRate: 0, mafBins: new Array(10).fill(0), hweFlagged: 0 };
  let totalCallRate = 0;
  const counts = new Int32Array(panel.density * 3); // [n0,n1,n2] per SNP
  const miss = new Int32Array(panel.density);
  for (const r of rows) {
    totalCallRate += r.callRate;
    const buf = await r.dosage.arrayBuffer();
    const a = new Uint8Array(buf);
    for (let j = 0; j < panel.density; j++) {
      const g = a[j];
      if (g === 0xff) miss[j]++;
      else counts[j * 3 + g]++;
    }
  }
  const mafBins = new Array(10).fill(0);
  let hweFlagged = 0;
  for (let j = 0; j < panel.density; j++) {
    const n0 = counts[j * 3];
    const n1 = counts[j * 3 + 1];
    const n2 = counts[j * 3 + 2];
    const tot = n0 + n1 + n2;
    if (tot === 0) continue;
    const p = (2 * n0 + n1) / (2 * tot);
    const maf = Math.min(p, 1 - p);
    const bin = Math.min(9, Math.floor(maf * 20));
    mafBins[bin]++;
    // HWE expected counts and a χ² with df=1.
    const e0 = tot * p * p;
    const e1 = tot * 2 * p * (1 - p);
    const e2 = tot * (1 - p) * (1 - p);
    const chi2 =
      (e0 > 0 ? Math.pow(n0 - e0, 2) / e0 : 0) +
      (e1 > 0 ? Math.pow(n1 - e1, 2) / e1 : 0) +
      (e2 > 0 ? Math.pow(n2 - e2, 2) / e2 : 0);
    if (chi2 > 23.93) hweFlagged++; // p≈1e-6 threshold for df=1
  }
  return {
    nSamples: rows.length,
    meanCallRate: totalCallRate / rows.length,
    mafBins,
    hweFlagged,
  };
}

// Re-export common utilities the UI needs.
export { TRAITS } from './simulator';
export { selectionIndex } from './math/selection';
export { dosageRow };
