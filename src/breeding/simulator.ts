// Multi-generation shrimp breeding simulator.
//
// The simulator generates: founders with random SNP genotypes drawn from
// realistic allele-frequency distributions, true breeding values via a
// QTL architecture, mating with Mendelian sampling under a simple linkage
// map, phenotypes with the prescribed heritability, and family/tank
// metadata identical in shape to what real operations would record.
//
// The output is plugged directly into the same Dexie tables that the rest of
// the app reads from, so the analytics, BLUP, and visualisations all work on
// the same data model whether it came from real records or simulation.

import type {
  GeneticCorrelation,
  SnpPanel,
  Trait,
  TraitCode,
} from './types';
import { bernoulli, beta, gaussian, type Rng } from './math/rng';

// The five active traits for the Speed + Strength breeding program. Numbers
// reflect realistic vannamei genetic parameters reported in the literature.
//
//   HBW       sib harvest body weight at the Hawaii nucleus pond
//   TagW      weight at PIT-tagging (~5 g) on candidates
//   EMS_SURV  survival under EMS sib challenge (proportion)
//   EMS_DtD   survival time under EMS challenge (hours; higher = better)
//   OP        observed performance at commercial sentinels (cousins, g)
export const TRAITS: Trait[] = [
  {
    code: 'HBW',
    name: 'Harvest body weight',
    unit: 'g',
    heritability: 0.22,
    geneticVariance: 6.0,
    residualVariance: 21.3,
    economicWeight: 0.06,
    betterIsHigher: true,
  },
  {
    code: 'TagW',
    name: 'Tagging weight',
    unit: 'g',
    heritability: 0.30,
    geneticVariance: 0.25,
    residualVariance: 0.58,
    economicWeight: 0.04,
    betterIsHigher: true,
  },
  {
    code: 'EMS_SURV',
    name: 'EMS survival',
    unit: 'prob',
    heritability: 0.14,
    geneticVariance: 0.035,
    residualVariance: 0.215,
    economicWeight: 1.2,
    betterIsHigher: true,
  },
  {
    code: 'EMS_DtD',
    name: 'EMS survival time',
    unit: 'hours',
    heritability: 0.12,
    geneticVariance: 80,     // σ_a ≈ 8.9 h
    residualVariance: 590,
    economicWeight: 0.02,
    betterIsHigher: true,
  },
  {
    code: 'OP',
    name: 'Commercial harvest weight',
    unit: 'g',
    heritability: 0.18,
    geneticVariance: 4.8,
    residualVariance: 21.9,
    economicWeight: 0.08,
    betterIsHigher: true,
  },
];

// Antagonisms documented for vannamei: growth and disease-resistance often
// trade off, and commercial-environment weight has high but imperfect rg with
// the nucleus environment (G×E).
export const GCORR: GeneticCorrelation[] = [
  { a: 'HBW', b: 'TagW', rg: 0.85 },      // early growth tracks late growth
  { a: 'HBW', b: 'EMS_SURV', rg: -0.35 }, // fast shrimp slightly weaker under EMS
  { a: 'HBW', b: 'EMS_DtD', rg: -0.30 },
  { a: 'HBW', b: 'OP', rg: 0.72 },        // G×E: nucleus ↔ commercial
  { a: 'TagW', b: 'OP', rg: 0.55 },
  { a: 'TagW', b: 'EMS_SURV', rg: -0.20 },
  { a: 'EMS_SURV', b: 'EMS_DtD', rg: 0.88 },
];

const TRAIT_ORDER: TraitCode[] = ['HBW', 'TagW', 'EMS_SURV', 'EMS_DtD', 'OP'];

// Build a t × t additive genetic correlation matrix from the GCORR list,
// fill missing entries with 0, set the diagonal to 1, and find its Cholesky
// factor so we can sample correlated genetic effects.
export function geneticCholesky(): { L: number[][] } {
  const t = TRAIT_ORDER.length;
  const R: number[][] = Array.from({ length: t }, () => new Array(t).fill(0));
  for (let i = 0; i < t; i++) R[i][i] = 1;
  for (const c of GCORR) {
    const i = TRAIT_ORDER.indexOf(c.a);
    const j = TRAIT_ORDER.indexOf(c.b);
    if (i < 0 || j < 0) continue;
    R[i][j] = c.rg;
    R[j][i] = c.rg;
  }
  // Tiny ridge to avoid PD failure if user-set correlations are inconsistent.
  for (let i = 0; i < t; i++) R[i][i] += 1e-3;
  // Plain Cholesky on small dense double[][].
  const L: number[][] = Array.from({ length: t }, () => new Array(t).fill(0));
  for (let j = 0; j < t; j++) {
    let s = R[j][j];
    for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
    L[j][j] = Math.sqrt(Math.max(s, 1e-9));
    for (let i = j + 1; i < t; i++) {
      let v = R[i][j];
      for (let k = 0; k < j; k++) v -= L[i][k] * L[j][k];
      L[i][j] = v / L[j][j];
    }
  }
  return { L };
}

function correlatedNormals(rng: Rng, L: number[][]): number[] {
  const t = L.length;
  const z = new Array(t);
  for (let i = 0; i < t; i++) z[i] = gaussian(rng);
  const out = new Array(t).fill(0);
  for (let i = 0; i < t; i++) {
    for (let k = 0; k <= i; k++) out[i] += L[i][k] * z[k];
  }
  return out;
}

// True-BV vector for a founder, in standard-deviation units; we scale per
// trait to its σ_a = sqrt(geneticVariance) when emitting.
export function founderTrueBV(rng: Rng, L: number[][]): Record<TraitCode, number> {
  const z = correlatedNormals(rng, L);
  const out: Record<TraitCode, number> = {} as Record<TraitCode, number>;
  for (let i = 0; i < TRAIT_ORDER.length; i++) {
    const trait = TRAITS.find((t) => t.code === TRAIT_ORDER[i])!;
    out[TRAIT_ORDER[i]] = z[i] * Math.sqrt(trait.geneticVariance);
  }
  return out;
}

// Mendelian sampling term for offspring of (sire, dam):
//   bv_o = 0.5 * (bv_s + bv_d) + ε,  ε ~ N(0, 0.5 σ²_a (1 - F̄))
// We approximate (1 - F̄) ≈ 1 to keep the simulator simple.
export function offspringTrueBV(
  rng: Rng,
  L: number[][],
  sireBV: Record<TraitCode, number>,
  damBV: Record<TraitCode, number>,
): Record<TraitCode, number> {
  const eps = correlatedNormals(rng, L);
  const out: Record<TraitCode, number> = {} as Record<TraitCode, number>;
  for (let i = 0; i < TRAIT_ORDER.length; i++) {
    const trait = TRAITS.find((t) => t.code === TRAIT_ORDER[i])!;
    const ms = eps[i] * Math.sqrt(0.5 * trait.geneticVariance);
    out[TRAIT_ORDER[i]] = 0.5 * (sireBV[TRAIT_ORDER[i]] + damBV[TRAIT_ORDER[i]]) + ms;
  }
  return out;
}

// Population means at the start of selection. Genetic gain is applied on top
// via the offspring BV draws over generations.
const TRAIT_MEAN: Record<TraitCode, number> = {
  HBW: 22,           // g, sib harvest weight at Hawaii nucleus
  TagW: 5.0,         // g, weight at PIT-tagging
  EMS_SURV: 0.45,    // probability of surviving EMS challenge
  EMS_DtD: 96,       // hours alive under challenge (challenge ends at 168h)
  OP: 24,            // g, commercial-sentinel harvest weight
  // Legacy entries (kept for type-completeness only — not produced any more).
  ADG: 0,
  SURV: 0,
  WSSV: 0,
  AHPND: 0,
  FCR: 0,
  YIELD: 0,
};

export function phenotypeFor(rng: Rng, trait: Trait, g: number): number {
  const e = gaussian(rng) * Math.sqrt(trait.residualVariance);
  let y = TRAIT_MEAN[trait.code] + g + e;
  if (trait.code === 'EMS_SURV') y = Math.max(0, Math.min(1, y));
  if (trait.code === 'EMS_DtD') y = Math.max(0, Math.min(168, y));
  return y;
}

// SNP simulation. We keep panels small (5K SNPs spread across 28 chromosomes)
// for fast browser computation while staying realistic in topology.
export function makePanel(rng: Rng, density = 5000, chrCount = 28): SnpPanel {
  const chrByMarker = new Array<number>(density);
  const cMByMarker = new Array<number>(density);
  const perChr = Math.ceil(density / chrCount);
  let idx = 0;
  for (let c = 0; c < chrCount && idx < density; c++) {
    const chrLen = 80 + Math.floor(rng() * 50); // 80–130 cM per chr
    for (let k = 0; k < perChr && idx < density; k++) {
      chrByMarker[idx] = c;
      cMByMarker[idx] = (k / perChr) * chrLen;
      idx++;
    }
  }
  // Founder allele frequencies — Beta(2,2) with weight on intermediate values.
  const alleleFreq = new Array<number>(density);
  for (let j = 0; j < density; j++) {
    let p = beta(rng, 2, 2);
    // Clip to [0.05, 0.95] to keep MAF ≥ 5%.
    p = Math.min(0.95, Math.max(0.05, p));
    alleleFreq[j] = p;
  }
  return {
    id: `panel-${density}`,
    name: `Simulated ${density} SNP panel (${chrCount} chr)`,
    density,
    chrCount,
    cMByMarker,
    chrByMarker,
    alleleFreq,
  };
}

// Random founder genotype: each marker is the sum of two independent allele
// draws at frequency p_j.
export function founderGenotype(rng: Rng, panel: SnpPanel): Uint8Array {
  const g = new Uint8Array(panel.density);
  for (let j = 0; j < panel.density; j++) {
    const p = panel.alleleFreq[j];
    const a1 = bernoulli(rng, p);
    const a2 = bernoulli(rng, p);
    g[j] = (a1 + a2) as 0 | 1 | 2;
  }
  return g;
}

// Form a gamete from a parent: walk markers in chromosome+cM order, decide a
// crossover with probability proportional to cM distance from the previous
// marker (Haldane: r ≈ 0.5(1−e^{−2d/100})). At each marker emit one allele
// from the current haplotype; haplotypes flip on crossover.
export function gamete(rng: Rng, panel: SnpPanel, parentG: Uint8Array): Uint8Array {
  const out = new Uint8Array(panel.density);
  // We don't have phased haplotypes; reconstruct two haplotypes by uniformly
  // sampling at heterozygotes. This loses some long-range correlation but is
  // adequate for demo purposes.
  let hap = rng() < 0.5 ? 0 : 1;
  let prevChr = -1;
  let prevCM = 0;
  for (let j = 0; j < panel.density; j++) {
    const chr = panel.chrByMarker[j];
    if (chr !== prevChr) {
      // New chromosome — independent haplotype start.
      hap = rng() < 0.5 ? 0 : 1;
      prevChr = chr;
      prevCM = panel.cMByMarker[j];
    } else {
      const d = panel.cMByMarker[j] - prevCM;
      const r = 0.5 * (1 - Math.exp((-2 * Math.max(0, d)) / 100));
      if (rng() < r) hap = 1 - hap;
      prevCM = panel.cMByMarker[j];
    }
    const g = parentG[j];
    let allele: number;
    if (g === 0) allele = 0;
    else if (g === 2) allele = 1;
    else {
      // Heterozygote — sample by current haplotype.
      allele = hap;
    }
    out[j] = allele;
  }
  return out;
}

export function offspringGenotype(rng: Rng, panel: SnpPanel, sireG: Uint8Array, damG: Uint8Array): Uint8Array {
  const a = gamete(rng, panel, sireG);
  const b = gamete(rng, panel, damG);
  const out = new Uint8Array(panel.density);
  for (let j = 0; j < panel.density; j++) out[j] = (a[j] + b[j]) as 0 | 1 | 2;
  return out;
}


// Mint a fresh genotype from population allele frequencies — used when a
// parent's stored genotype is unavailable (e.g. founders not yet genotyped).
export function imputeFromFreq(rng: Rng, panel: SnpPanel): Uint8Array {
  const g = new Uint8Array(panel.density);
  for (let j = 0; j < panel.density; j++) {
    const p = panel.alleleFreq[j];
    const a1 = bernoulli(rng, p);
    const a2 = bernoulli(rng, p);
    g[j] = (a1 + a2) as 0 | 1 | 2;
  }
  return g;
}

// Index from trait BVs using the static economic weights — used by the
// seeder to rank candidates when simulating "what past breeders would have
// selected" so historical batches converge realistically.
export function indexFromTrueBV(bv: Record<TraitCode, number>): number {
  let s = 0;
  for (const t of TRAITS) s += t.economicWeight * (bv[t.code] ?? 0);
  return s;
}

let _id = 1;
export function nextId(): string {
  return String(_id++).padStart(6, '0');
}
export function resetIds(): void {
  _id = 1;
}
