// Genomic relationship matrix (VanRaden, 2008) and SNP-effect back-solving.
//
// Given a dosage matrix M (n × m) of {0,1,2} calls and population allele
// frequencies p (length m), the centred matrix Z = M − 2p has
//
//      G = Z Z' / (2 Σ p_j (1 − p_j))
//
// We use the same scaling so that the diagonal of G centres around 1 in a
// random-mating population.
//
// SNP-effect back-solving: from a fitted GBLUP solution â (n×1) we recover
//      β̂ = (Z' / k) G^{-1} â              where k = 2 Σ p(1−p)
// and the GEBV of any newly genotyped animal x (length m, dosages) is
//      ĝ(x) = (x − 2p)' β̂.
// This dot product is the "near-instant GEBV" path.

import { type Mat, type Vec, mset, zeros } from './linalg';

export type DosageMatrix = {
  n: number;            // animals
  m: number;            // markers
  data: Uint8Array;     // length n*m, row-major; 0/1/2; 0xFF = missing
};

export function dosageRow(M: DosageMatrix, i: number): Uint8Array {
  return M.data.subarray(i * M.m, (i + 1) * M.m);
}

// Estimate allele frequencies p_j from the columns of M, ignoring missing.
export function estimateFreqs(M: DosageMatrix): Float64Array {
  const p = new Float64Array(M.m);
  const cnt = new Int32Array(M.m);
  for (let i = 0; i < M.n; i++) {
    const off = i * M.m;
    for (let j = 0; j < M.m; j++) {
      const g = M.data[off + j];
      if (g !== 0xff) {
        p[j] += g;
        cnt[j] += 2;
      }
    }
  }
  for (let j = 0; j < M.m; j++) p[j] = cnt[j] > 0 ? p[j] / cnt[j] : 0.5;
  return p;
}

// Build the centred Z = M − 2p as a dense Mat. Missing calls are imputed at 2p
// (their expectation under HWE), which gives them zero centred contribution.
export function centerDosage(M: DosageMatrix, p: Float64Array): Mat {
  const Z = zeros(M.n, M.m);
  for (let i = 0; i < M.n; i++) {
    const off = i * M.m;
    for (let j = 0; j < M.m; j++) {
      const g = M.data[off + j];
      const cv = g === 0xff ? 0 : g - 2 * p[j];
      Z.data[i * M.m + j] = cv;
    }
  }
  return Z;
}

// VanRaden G = Z Z' / k. Returns G and k.
export function vanRadenG(Z: Mat): { G: Mat; k: number } {
  // We need k = 2 Σ p_j (1 − p_j). Recover p_j from column means of Z + 2p
  // would round-trip; instead caller can pass freqs separately. We compute k
  // implicitly from Z by Σ_j Var_j(Z) ≈ Σ 2p(1-p), which is robust enough.
  let k = 0;
  for (let j = 0; j < Z.cols; j++) {
    let mean = 0;
    for (let i = 0; i < Z.rows; i++) mean += Z.data[i * Z.cols + j];
    mean /= Z.rows;
    let v = 0;
    for (let i = 0; i < Z.rows; i++) {
      const d = Z.data[i * Z.cols + j] - mean;
      v += d * d;
    }
    k += v / Z.rows; // E[Z_j^2] ≈ 2p(1-p)
  }
  // Now G = Z Z' / k.
  const G = zeros(Z.rows, Z.rows);
  for (let i = 0; i < Z.rows; i++) {
    for (let j = i; j < Z.rows; j++) {
      let s = 0;
      const oi = i * Z.cols;
      const oj = j * Z.cols;
      for (let r = 0; r < Z.cols; r++) s += Z.data[oi + r] * Z.data[oj + r];
      const v = s / k;
      mset(G, i, j, v);
      mset(G, j, i, v);
    }
  }
  // Add a tiny ridge (1e-5) to G's diagonal — keeps it strictly PD even under
  // duplicated genotypes, exactly the trick BLUPF90's PREGSF90 uses.
  for (let i = 0; i < G.rows; i++) G.data[i * G.cols + i] += 1e-5;
  return { G, k };
}

// β̂ = (1/k) Z' G^{-1} â. We don't materialise G^{-1}; instead we are given a
// solver that applies G^{-1} (e.g. by Cholesky factorisation). For demo
// scale we just multiply by an explicit inverse.
export function snpEffectsFromSolutions(Z: Mat, Ginv: Mat, ahat: Vec, k: number): Float64Array {
  // u = G^{-1} â  (vector of length n)
  const n = Z.rows;
  const m = Z.cols;
  const u = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const off = i * Ginv.cols;
    for (let r = 0; r < n; r++) s += Ginv.data[off + r] * ahat[r];
    u[i] = s;
  }
  // β̂_j = Σ_i Z_ij u_i / k
  const beta = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    const ui = u[i] / k;
    if (ui === 0) continue;
    const off = i * m;
    for (let j = 0; j < m; j++) beta[j] += Z.data[off + j] * ui;
  }
  return beta;
}

// GEBV(x) = (x − 2p)' β̂. Single dot product; this is the instant-prediction path.
export function predictGEBVDosage(x: Uint8Array, p: Float64Array, beta: Float64Array): number {
  let s = 0;
  for (let j = 0; j < x.length; j++) {
    const g = x[j];
    const xj = g === 0xff ? 0 : g - 2 * p[j];
    s += xj * beta[j];
  }
  return s;
}
