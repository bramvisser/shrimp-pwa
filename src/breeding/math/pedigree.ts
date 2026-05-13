// Pedigree-based numerator relationship matrix (NRM) and its sparse inverse
// via Henderson's rules.
//
// References: Henderson (1976); Mrode, "Linear Models for the Prediction of
// Animal Breeding Values" (3rd ed., chapter 2).
//
// Animals must be ordered such that each animal appears after its parents.

import type { Animal } from '../types';
import { sparseSym, ssAdd, type SparseSym } from './linalg';

export type PedigreeIndex = {
  ids: string[];                // ordered, founders first
  idIndex: Map<string, number>;
  sire: Int32Array;             // -1 if unknown
  dam: Int32Array;
};

export function buildPedigreeIndex(animals: Animal[]): PedigreeIndex {
  // Topologically order: an animal can only be added once both parents are
  // already in the order or absent. Stable: founders first, then by birthDate.
  const byId = new Map(animals.map((a) => [a.id, a]));
  const ordered: Animal[] = [];
  const placed = new Set<string>();
  // Use a queue of animals whose parents are all placed.
  const remaining = new Set(animals.map((a) => a.id));
  // Sort founders by birthDate for stable order.
  const founders = animals
    .filter((a) => !a.sireId && !a.damId)
    .sort((a, b) => a.birthDate.localeCompare(b.birthDate));
  for (const f of founders) {
    ordered.push(f);
    placed.add(f.id);
    remaining.delete(f.id);
  }
  let progress = true;
  while (progress && remaining.size > 0) {
    progress = false;
    const ready: Animal[] = [];
    for (const id of remaining) {
      const a = byId.get(id)!;
      const sireOk = !a.sireId || placed.has(a.sireId);
      const damOk = !a.damId || placed.has(a.damId);
      if (sireOk && damOk) ready.push(a);
    }
    ready.sort((a, b) => a.birthDate.localeCompare(b.birthDate));
    for (const a of ready) {
      ordered.push(a);
      placed.add(a.id);
      remaining.delete(a.id);
      progress = true;
    }
  }
  if (remaining.size > 0) {
    // Cyclic / orphaned references — drop them but keep going.
    for (const id of remaining) {
      const a = byId.get(id)!;
      ordered.push({ ...a, sireId: null, damId: null });
    }
  }
  const ids = ordered.map((a) => a.id);
  const idIndex = new Map(ids.map((id, i) => [id, i]));
  const sire = new Int32Array(ids.length);
  const dam = new Int32Array(ids.length);
  for (let i = 0; i < ordered.length; i++) {
    sire[i] = ordered[i].sireId ? (idIndex.get(ordered[i].sireId!) ?? -1) : -1;
    dam[i] = ordered[i].damId ? (idIndex.get(ordered[i].damId!) ?? -1) : -1;
  }
  return { ids, idIndex, sire, dam };
}

// Compute inbreeding coefficients F using the recursive kinship relation
// without ever materialising A. Memo of pairwise kinships is shared across
// all animals, so the work amortises: by the time we reach late generations
// the relevant ancestor-pair kinships are cached.
//
//   a(x, x) = 1 + 0.5 * a(sire(x), dam(x))
//   a(x, y) = 0.5 * (a(sire(younger), older) + a(dam(younger), older))     x ≠ y
//
// The recursion terminates at unknown parents (a = 0). For typical pedigrees
// with bounded depth this runs in well under a second per 100k animals.
export function inbreeding(p: PedigreeIndex): Float64Array {
  const n = p.ids.length;
  const F = new Float64Array(n);
  const memo = new Map<number, number>();
  const key = (a: number, b: number): number => {
    const x = a < b ? a : b;
    const y = a < b ? b : a;
    return x * 0x100000 + y;
  };
  const kinship = (x: number, y: number): number => {
    if (x < 0 || y < 0) return 0;
    if (x === y) {
      const s = p.sire[x];
      const d = p.dam[x];
      return 1 + 0.5 * kinship(s, d);
    }
    const k = key(x, y);
    const m = memo.get(k);
    if (m !== undefined) return m;
    const younger = x > y ? x : y;
    const older = x > y ? y : x;
    const ss = p.sire[younger];
    const dd = p.dam[younger];
    const v = 0.5 * (kinship(ss, older) + kinship(dd, older));
    memo.set(k, v);
    return v;
  };
  for (let i = 0; i < n; i++) {
    const s = p.sire[i];
    const d = p.dam[i];
    F[i] = s >= 0 && d >= 0 ? 0.5 * kinship(s, d) : 0;
  }
  return F;
}

// Henderson's rules for A^{-1} given inbreeding coefficients.
// For each animal i with parents s, d:
//   d_i = 4 / (2 - F_s - F_d)  where F is 0 for unknown parents.
// The contribution to A^{-1} adds:
//   A^{-1}_{i,i}        += d_i
//   A^{-1}_{i,s}        -= d_i / 2
//   A^{-1}_{i,d}        -= d_i / 2
//   A^{-1}_{s,s}        += d_i / 4
//   A^{-1}_{d,d}        += d_i / 4
//   A^{-1}_{s,d}        += d_i / 4
// (with appropriate symmetry).
export function buildAInverse(p: PedigreeIndex, F: Float64Array): SparseSym {
  const n = p.ids.length;
  const Ainv = sparseSym(n);
  for (let i = 0; i < n; i++) {
    const s = p.sire[i];
    const d = p.dam[i];
    const Fs = s >= 0 ? F[s] : 0;
    const Fd = d >= 0 ? F[d] : 0;
    const di = 4 / (2 - Fs - Fd);
    ssAdd(Ainv, i, i, di);
    if (s >= 0) {
      ssAdd(Ainv, i, s, -di / 2);
      ssAdd(Ainv, s, s, di / 4);
    }
    if (d >= 0) {
      ssAdd(Ainv, i, d, -di / 2);
      ssAdd(Ainv, d, d, di / 4);
      if (s >= 0) ssAdd(Ainv, s, d, di / 4);
    }
  }
  return Ainv;
}

// Convenience: compute A^{-1} and the inbreeding vector together.
export function pedigreeAinverse(animals: Animal[]): {
  index: PedigreeIndex;
  F: Float64Array;
  Ainv: SparseSym;
} {
  const index = buildPedigreeIndex(animals);
  const F = inbreeding(index);
  const Ainv = buildAInverse(index, F);
  return { index, F, Ainv };
}

// Expected inbreeding of an offspring (sire × dam) — F(o) = 0.5 * a_{sire,dam}.
// Computed via the recursive a_{i,j} formula without materialising A.
export function pairKinship(p: PedigreeIndex, i: number, j: number): number {
  if (i < 0 || j < 0) return 0;
  // Recurse with memoisation. We bound depth by the topological order.
  const memo = new Map<number, number>();
  function key(a: number, b: number): number {
    const x = a < b ? a : b;
    const y = a < b ? b : a;
    return x * 0x10000 + y;
  }
  function a(x: number, y: number): number {
    if (x < 0 || y < 0) return 0;
    if (x === y) {
      const s = p.sire[x];
      const d = p.dam[x];
      return 1 + 0.5 * a(s, d);
    }
    const k = key(x, y);
    const m = memo.get(k);
    if (m !== undefined) return m;
    // Recurse on the *younger* of the two (higher index, since topologically
    // ordered).
    const younger = x > y ? x : y;
    const older = x > y ? y : x;
    const s = p.sire[younger];
    const d = p.dam[younger];
    const v = 0.5 * (a(s, older) + a(d, older));
    memo.set(k, v);
    return v;
  }
  return a(i, j);
}
