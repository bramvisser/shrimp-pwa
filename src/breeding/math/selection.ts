// Selection index (Smith-Hazel) and mating allocation under inbreeding control.
//
// We implement a pragmatic OCS-flavoured planner: rank candidates by index,
// then greedily form mating pairs (sire × dam) whose expected offspring F is
// below the configured ceiling. This is mate-selection rather than full OCS
// (Meuwissen 1997) but yields equivalent long-term progress in shrimp-scale
// nucleus populations and is easy to audit.

import type { TraitCode } from '../types';

export type EBVTable = Map<string, Partial<Record<TraitCode, number>>>;

export type EconomicWeights = Partial<Record<TraitCode, number>>;

export function selectionIndex(
  ebvs: Partial<Record<TraitCode, number>>,
  weights: EconomicWeights,
): { index: number; contributions: Partial<Record<TraitCode, number>> } {
  let total = 0;
  const contributions: Partial<Record<TraitCode, number>> = {};
  for (const trait in weights) {
    const w = weights[trait as TraitCode] ?? 0;
    const e = ebvs[trait as TraitCode] ?? 0;
    const c = w * e;
    contributions[trait as TraitCode] = c;
    total += c;
  }
  return { index: total, contributions };
}

export type Candidate = {
  animalId: string;
  sex: 'M' | 'F';
  index: number;
  inbreeding: number;        // own F
};

export type MatingProposal = {
  sireId: string;
  damId: string;
  expectedIndex: number;     // mid-parent
  expectedF: number;         // F of offspring = 0.5 * a_{sire,dam}
};

export type PlannerInputs = {
  candidates: Candidate[];
  // Pairwise kinship a_{i,j} between any two candidate ids. Caller pre-computes
  // this from the pedigree index. Accepts (sireId, damId) order.
  kinship: (sireId: string, damId: string) => number;
  inbreedingCeiling: number; // e.g. 0.0625 (first-cousin)
  nMatings: number;
  // Maximum times a single sire can be used (avoid overuse). Females typically 1.
  maxSireUses?: number;
  maxDamUses?: number;
};

// Plan returns up to nMatings pairs whose offspring F is under the ceiling,
// chosen by greedy descent on a weighted score:
//      score(pair) = mid-index − γ * max(0, F_offspring − threshold_soft)
// We use γ = 50 $/ΔF so a 0.01 violation costs ~$0.5 of index.
export function planMatings(inp: PlannerInputs): MatingProposal[] {
  const sires = inp.candidates
    .filter((c) => c.sex === 'M')
    .sort((a, b) => b.index - a.index);
  const dams = inp.candidates
    .filter((c) => c.sex === 'F')
    .sort((a, b) => b.index - a.index);
  const maxSire = inp.maxSireUses ?? Math.max(2, Math.ceil(inp.nMatings / Math.max(1, sires.length)));
  const maxDam = inp.maxDamUses ?? 1;
  const sireUses = new Map<string, number>();
  const damUses = new Map<string, number>();
  const proposals: MatingProposal[] = [];
  const softCeiling = inp.inbreedingCeiling * 0.5;
  const gamma = 50;
  // Take the top sires (by index) and the top dams; for each open dam slot,
  // select the best available sire that doesn't violate inbreeding hard cap.
  for (const dam of dams) {
    if (proposals.length >= inp.nMatings) break;
    if ((damUses.get(dam.animalId) ?? 0) >= maxDam) continue;
    let best: { sire: Candidate; expectedF: number; score: number } | null = null;
    for (const sire of sires) {
      if ((sireUses.get(sire.animalId) ?? 0) >= maxSire) continue;
      const a = inp.kinship(sire.animalId, dam.animalId);
      const F = 0.5 * a;
      if (F > inp.inbreedingCeiling) continue;
      const midIndex = 0.5 * (sire.index + dam.index);
      const penalty = F > softCeiling ? gamma * (F - softCeiling) : 0;
      const score = midIndex - penalty;
      if (!best || score > best.score) best = { sire, expectedF: F, score };
    }
    if (!best) continue;
    proposals.push({
      sireId: best.sire.animalId,
      damId: dam.animalId,
      expectedIndex: 0.5 * (best.sire.index + dam.index),
      expectedF: best.expectedF,
    });
    sireUses.set(best.sire.animalId, (sireUses.get(best.sire.animalId) ?? 0) + 1);
    damUses.set(dam.animalId, (damUses.get(dam.animalId) ?? 0) + 1);
  }
  return proposals;
}
