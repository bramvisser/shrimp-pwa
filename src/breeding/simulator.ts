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
  Animal,
  GeneticCorrelation,
  Phenotype,
  Sex,
  SnpPanel,
  Trait,
  TraitCode,
} from './types';
import { bernoulli, beta, gaussian, makeRng, shuffle, type Rng } from './math/rng';

export const TRAITS: Trait[] = [
  // Numbers cite literature ranges from the research dossier.
  {
    code: 'HBW',
    name: 'Harvest body weight',
    unit: 'g',
    heritability: 0.22,
    geneticVariance: 6.0,    // σ²_a in g² (mean ~22g, σ_a ~2.45g)
    residualVariance: 21.3,  // h² 0.22 ⇒ σ²_p = 27.3
    economicWeight: 0.06,    // $/g
    betterIsHigher: true,
  },
  {
    code: 'ADG',
    name: 'Average daily gain',
    unit: 'g/day',
    heritability: 0.25,
    geneticVariance: 0.001,
    residualVariance: 0.003,
    economicWeight: 18.0,
    betterIsHigher: true,
  },
  {
    code: 'SURV',
    name: 'Survival to harvest',
    unit: 'prob',
    heritability: 0.06,
    geneticVariance: 0.005,
    residualVariance: 0.0784,
    economicWeight: 0.6,     // $/prob, integrated against per-batch yield
    betterIsHigher: true,
  },
  {
    code: 'WSSV',
    name: 'WSSV survival',
    unit: 'prob',
    heritability: 0.18,
    geneticVariance: 0.04,
    residualVariance: 0.182,
    economicWeight: 1.4,     // $/prob, market-weighted
    betterIsHigher: true,
  },
  {
    code: 'AHPND',
    name: 'AHPND survival',
    unit: 'prob',
    heritability: 0.12,
    geneticVariance: 0.02,
    residualVariance: 0.146,
    economicWeight: 0.9,
    betterIsHigher: true,
  },
  {
    code: 'YIELD',
    name: 'Meat yield',
    unit: '%',
    heritability: 0.22,
    geneticVariance: 1.5,
    residualVariance: 5.3,
    economicWeight: 0.5,
    betterIsHigher: true,
  },
];

// The dominant antagonism in vannamei breeding: faster shrimp die first under
// WSSV. Other correlations from the dossier.
export const GCORR: GeneticCorrelation[] = [
  { a: 'HBW', b: 'WSSV', rg: -0.6 },
  { a: 'HBW', b: 'ADG', rg: 0.92 },
  { a: 'HBW', b: 'SURV', rg: -0.15 },
  { a: 'HBW', b: 'YIELD', rg: 0.2 },
  { a: 'WSSV', b: 'AHPND', rg: 0.4 },
  { a: 'SURV', b: 'WSSV', rg: 0.3 },
  { a: 'ADG', b: 'WSSV', rg: -0.55 },
];

const TRAIT_ORDER: TraitCode[] = ['HBW', 'ADG', 'SURV', 'WSSV', 'AHPND', 'YIELD'];

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

// Sample a phenotype y = trait mean + g + e.
const TRAIT_MEAN: Record<TraitCode, number> = {
  HBW: 22,
  ADG: 0.18,
  SURV: 0.78,
  WSSV: 0.45,
  AHPND: 0.55,
  FCR: 1.45,
  YIELD: 50,
};

export function phenotypeFor(rng: Rng, trait: Trait, g: number): number {
  const e = gaussian(rng) * Math.sqrt(trait.residualVariance);
  let y = TRAIT_MEAN[trait.code] + g + e;
  if (trait.code === 'SURV' || trait.code === 'WSSV' || trait.code === 'AHPND') {
    y = Math.max(0, Math.min(1, y));
  }
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

// Drive a multi-generation run.
export type SimResult = {
  panel: SnpPanel;
  animals: Animal[];
  genotypes: Map<string, Uint8Array>;
  phenotypes: Phenotype[];
};

export type SimConfig = {
  seed: number;
  lineId: string;
  generations: number;            // including founders
  foundersPerSex: number;
  // Hatching / family layout: one family per hatching tank.
  familiesPerGen: number;         // = number of hatching tanks
  juvenilesPerFamily: number;     // PL → tagged juvenile yield per family
  selectedAdultsRetained: number; // per non-final generation, broodstock kept
  sexRatio: number;               // P(F) for offspring sex draw
  panelDensity: number;
  startDate: Date;
  // Fraction of selected broodstock that get an official genotype call. (We
  // always cache adult genotypes internally for Mendelian propagation.)
  genotypeBroodstockFraction: number;
  // Phenotyping rates against juveniles.
  phenotypeFractionHBW: number;
  phenotypeFractionDisease: number;
};

export function runSimulation(cfg: SimConfig): SimResult {
  const rng = makeRng(cfg.seed);
  const panel = makePanel(rng, cfg.panelDensity);
  const { L } = geneticCholesky();
  const animals: Animal[] = [];
  const genotypes = new Map<string, Uint8Array>();
  const phenotypes: Phenotype[] = [];

  // Internal cache of every adult's genotype, used so offspring inherit
  // properly from their parents even when we don't end up storing the parent's
  // genotype in the official `genotypes` output.
  const adultGenotypes = new Map<string, Uint8Array>();

  // Founders.
  const founders: Animal[] = [];
  for (let s = 0; s < 2; s++) {
    const sex: Sex = s === 0 ? 'M' : 'F';
    for (let i = 0; i < cfg.foundersPerSex; i++) {
      const id = `A${nextId()}`;
      const bv = founderTrueBV(rng, L);
      const a: Animal = {
        id,
        lineId: cfg.lineId,
        sireId: null,
        damId: null,
        familyId: null,
        sex,
        birthDate: cfg.startDate.toISOString().slice(0, 10),
        generation: 0,
        tankId: `T-G0-${sex}`,
        stage: 'broodstock',
        spfStatus: 'SPF',
        __trueBV: bv,
        createdAt: cfg.startDate.toISOString(),
      };
      animals.push(a);
      founders.push(a);
      // Founders are adults — genotype every founder for Mendelian propagation
      // (and store most of them officially as the training reference).
      const fg = founderGenotype(rng, panel);
      adultGenotypes.set(id, fg);
      if (rng() < 0.9) genotypes.set(id, fg);
    }
  }

  // Successive generations.
  let parentPool = founders;
  for (let g = 1; g < cfg.generations; g++) {
    const isLatest = g === cfg.generations - 1;
    const males = parentPool.filter((a) => a.sex === 'M');
    const females = parentPool.filter((a) => a.sex === 'F');
    if (males.length === 0 || females.length === 0) break;
    const shuffledF = shuffle(rng, females);
    const newGenAnimals: Animal[] = [];
    // Per-juvenile family lookup so we can later draw the parent genotypes
    // when (and only when) a juvenile is promoted to broodstock and gets
    // officially genotyped. Avoids generating SNPs for the 27k that won't
    // make the cut.
    const sireOf = new Map<string, string>();
    const damOf = new Map<string, string>();
    const genDate = new Date(cfg.startDate.getTime() + g * 365 * 24 * 3600 * 1000);
    for (let f = 0; f < cfg.familiesPerGen; f++) {
      const sire = males[f % males.length];
      const dam = shuffledF[f % shuffledF.length];
      if (!sire.__trueBV || !dam.__trueBV) continue;
      const familyId = `F-G${g}-${String(f + 1).padStart(3, '0')}`;
      for (let k = 0; k < cfg.juvenilesPerFamily; k++) {
        const id = `A${nextId()}`;
        const sex: Sex = rng() < cfg.sexRatio ? 'F' : 'M';
        const bv = offspringTrueBV(rng, L, sire.__trueBV, dam.__trueBV);
        const a: Animal = {
          id,
          lineId: cfg.lineId,
          sireId: sire.id,
          damId: dam.id,
          familyId,
          sex,
          birthDate: genDate.toISOString().slice(0, 10),
          generation: g,
          tankId: `T-G${g}-${familyId}`,
          stage: 'juvenile',
          spfStatus: 'SPF',
          __trueBV: bv,
          createdAt: genDate.toISOString(),
        };
        animals.push(a);
        newGenAnimals.push(a);
        sireOf.set(id, sire.id);
        damOf.set(id, dam.id);
      }
    }
    // Phenotype a sample at "harvest". HBW comes from a tagged subset; the
    // disease-challenge traits come from a separate, smaller subset. The
    // latest generation isn't grown out yet, so we phenotype a tiny fraction
    // of partial-grow data only (representative of in-progress measurement).
    const hbwFrac = isLatest ? Math.min(cfg.phenotypeFractionHBW, 0.05) : cfg.phenotypeFractionHBW;
    const diseaseFrac = isLatest ? 0 : cfg.phenotypeFractionDisease;
    for (const a of newGenAnimals) {
      if (!a.__trueBV) continue;
      // HBW + ADG + SURV + YIELD measured on the tagged subset.
      if (rng() < hbwFrac) {
        for (const code of ['HBW', 'ADG', 'SURV', 'YIELD'] as TraitCode[]) {
          if (code === 'YIELD' && rng() > 0.5) continue;
          const trait = TRAITS.find((t) => t.code === code)!;
          const y = phenotypeFor(rng, trait, a.__trueBV[code]);
          phenotypes.push({
            id: `P-${a.id}-${code}`,
            animalId: a.id,
            trait: code,
            value: y,
            measuredAt: new Date(genDate.getTime() + 150 * 24 * 3600 * 1000).toISOString(),
          });
        }
      }
      // Disease challenges: independent, smaller sample.
      if (rng() < diseaseFrac) {
        for (const code of ['WSSV', 'AHPND'] as TraitCode[]) {
          if (code === 'AHPND' && rng() > 0.6) continue;
          const trait = TRAITS.find((t) => t.code === code)!;
          const y = phenotypeFor(rng, trait, a.__trueBV[code]);
          phenotypes.push({
            id: `P-${a.id}-${code}`,
            animalId: a.id,
            trait: code,
            value: y,
            measuredAt: new Date(genDate.getTime() + 90 * 24 * 3600 * 1000).toISOString(),
            context: { challengeId: `${code}-G${g}-${cfg.lineId}` },
          });
        }
      }
    }
    if (isLatest) {
      // Latest cohort stays as juveniles — they're currently being raised
      // and not yet genotyped.
      for (const a of newGenAnimals) a.stage = 'juvenile';
      parentPool = [];
    } else {
      // Rank candidates by true BV (historical-record fiction; the live
      // engine uses BLUP estimates).
      const ranked = newGenAnimals
        .filter((a) => a.__trueBV)
        .map((a) => ({ a, score: indexFromTrueBV(a.__trueBV!) }))
        .sort((x, y) => y.score - x.score);
      const keep = Math.min(cfg.selectedAdultsRetained, ranked.length);
      const chosen = new Set(ranked.slice(0, keep).map((r) => r.a.id));
      for (const a of newGenAnimals) {
        a.stage = chosen.has(a.id) ? 'broodstock' : 'harvested';
      }
      // Adults — and only adults — get a genotype now. Mendelian draw from
      // the parents' stored adult genotypes.
      for (const a of newGenAnimals) {
        if (a.stage !== 'broodstock') continue;
        const sId = sireOf.get(a.id);
        const dId = damOf.get(a.id);
        const sireG = (sId && adultGenotypes.get(sId)) || imputeFromFreq(rng, panel);
        const damG = (dId && adultGenotypes.get(dId)) || imputeFromFreq(rng, panel);
        const og = offspringGenotype(rng, panel, sireG, damG);
        adultGenotypes.set(a.id, og);
        // Persist a fraction officially as "genotyped on the chip".
        if (rng() < cfg.genotypeBroodstockFraction) genotypes.set(a.id, og);
      }
      parentPool = ranked.slice(0, keep).map((r) => r.a);
    }
  }
  // After all generations: demote retired broodstock from older generations
  // to 'harvested' so the standing alive pool ≈ current juveniles + the
  // selected parents of the current crop.
  const G = cfg.generations;
  for (const a of animals) {
    if (a.stage === 'broodstock' && a.generation < G - 2) a.stage = 'harvested';
  }
  return { panel, animals, genotypes, phenotypes };
}

let _id = 1;
function nextId(): string {
  return String(_id++).padStart(5, '0');
}
export function resetIds(): void {
  _id = 1;
}

function imputeFromFreq(rng: Rng, panel: SnpPanel): Uint8Array {
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
// simulator's historical "what would past breeders have selected" routine.
function indexFromTrueBV(bv: Record<TraitCode, number>): number {
  let s = 0;
  for (const t of TRAITS) s += t.economicWeight * (bv[t.code] ?? 0);
  return s;
}
