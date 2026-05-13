// Single-trait BLUP / GBLUP / ssGBLUP solver.
//
// Mixed model:
//      y = X β + Z a + e,    a ~ N(0, K σ²_a),   e ~ N(0, I σ²_e)
//
// MMEs:
//      [ X'X        X'Z        ] [β̂]   [X'y]
//      [ Z'X    Z'Z + K^{-1} λ ] [â] = [Z'y]
//
// where λ = σ²_e / σ²_a and K is the assumed covariance structure of a:
//   - PBLUP : K = A      ⇒ K^{-1} = A^{-1}  (Henderson, sparse)
//   - GBLUP : K = G      ⇒ K^{-1} from Cholesky of G  (genotyped only)
//   - ssGBLUP: K = H, with
//        H^{-1} = A^{-1} + [ 0     0           ]
//                          [ 0  G^{-1} − A22^{-1} ]
//
// For demo populations (n ~ 1e3) we treat the whole MME as an n+p sized
// symmetric PD system and solve with PCG. We supply an `apply` callback
// rather than materialising the full matrix.

import {
  matvec,
  pcg,
  ssMatvec,
  type Mat,
  type SparseSym,
  type Vec,
  zeros,
  mset,
  cholesky,
  trsvLower,
  trsvUpperT,
} from './linalg';

export { pcg };

export type BlupInputs = {
  n: number;                // total animals (genotyped + ungenotyped)
  // Phenotypes: y for the subset of animals with records.
  y: Float64Array;
  // Z: incidence of records → animals. Stored as an array of length y.length
  // giving the animal index (0..n-1) for each record. (Single record per
  // animal in our demo; trivially extensible.)
  recordAnimal: Int32Array;
  // X: fixed-effect design matrix (records × p).
  X: Mat;
  // λ = σ²_e / σ²_a.
  lambda: number;
  // K^{-1} as a sparse symmetric matrix or a dense Mat. We support both.
  Kinv: SparseSym | Mat;
  KinvDiag: Float64Array;   // diagonal of K^{-1} (length n) — used by preconditioner.
};

// Apply the MME left-hand side to a stacked vector [β; a].
export function applyMME(inp: BlupInputs, x: Vec, out: Vec): void {
  const p = inp.X.cols;
  const n = inp.n;
  const beta = x.subarray(0, p);
  const a = x.subarray(p, p + n);
  const outBeta = out.subarray(0, p);
  const outA = out.subarray(p, p + n);
  outBeta.fill(0);
  outA.fill(0);
  // For each record r:
  //   contribution to [β; a]:  X_r' (X_r β + Z_r a)
  //                            Z_r' (X_r β + Z_r a)
  // where X_r is row r of X and Z_r picks animal recordAnimal[r].
  const m = inp.y.length;
  for (let r = 0; r < m; r++) {
    const ai = inp.recordAnimal[r];
    // x_r' β
    let xb = 0;
    for (let k = 0; k < p; k++) xb += inp.X.data[r * p + k] * beta[k];
    const za = a[ai];
    const fitted = xb + za;
    for (let k = 0; k < p; k++) outBeta[k] += inp.X.data[r * p + k] * fitted;
    outA[ai] += fitted;
  }
  // Add λ K^{-1} a to outA.
  const Ka = isSparse(inp.Kinv)
    ? ssMatvec(inp.Kinv, a)
    : matvec(inp.Kinv, a);
  for (let i = 0; i < n; i++) outA[i] += inp.lambda * Ka[i];
}

function isSparse(K: SparseSym | Mat): K is SparseSym {
  return 'diag' in K;
}

export function solveBlup(
  inp: BlupInputs,
  opts: {
    tol?: number;
    onIter?: (iter: number, maxIter: number, residual: number, tol: number) => void;
  } = {},
): {
  beta: Float64Array;
  a: Float64Array;
  iters: number;
  residual: number;
} {
  const p = inp.X.cols;
  const n = inp.n;
  const N = p + n;
  // RHS = [X'y; Z'y]
  const rhs = new Float64Array(N);
  const m = inp.y.length;
  for (let r = 0; r < m; r++) {
    for (let k = 0; k < p; k++) rhs[k] += inp.X.data[r * p + k] * inp.y[r];
    rhs[p + inp.recordAnimal[r]] += inp.y[r];
  }
  // Diagonal preconditioner: X'X diag for fixed effects, Z'Z + λ Kinv diag for
  // animal effects. Z'Z[i] = number of records on animal i.
  const diag = new Float64Array(N);
  for (let r = 0; r < m; r++) {
    for (let k = 0; k < p; k++) {
      const v = inp.X.data[r * p + k];
      diag[k] += v * v;
    }
    diag[p + inp.recordAnimal[r]] += 1;
  }
  for (let i = 0; i < n; i++) diag[p + i] += inp.lambda * inp.KinvDiag[i];
  // Floor to keep PCG safe.
  for (let i = 0; i < N; i++) if (diag[i] < 1e-10) diag[i] = 1e-10;
  const apply = (x: Vec, out: Vec) => applyMME(inp, x, out);
  const { x, iters, residual } = pcg(apply, diag, rhs, {
    tol: opts.tol ?? 1e-7,
    onIter: opts.onIter,
  });
  return {
    beta: new Float64Array(x.buffer, x.byteOffset, p),
    a: new Float64Array(x.buffer, x.byteOffset + p * 8, n),
    iters,
    residual,
  };
}

// Build H^{-1} for ssGBLUP.
// Inputs:
//   Ainv         : sparse A^{-1} for the full pedigree (n animals)
//   genoIdx      : indices (into 0..n-1) of genotyped animals (length n2)
//   Ginv         : dense (n2 × n2) inverse of G (with τ scaling already applied)
//   A22inv       : dense (n2 × n2) inverse of A22
// Returns a dense additive correction to apply on top of Ainv: D = Ginv − A22inv,
// which we add into the MME via the apply callback.
export type SSGBLUPCorrection = {
  genoIdx: Int32Array;
  D: Mat;            // n2 × n2  ( Ginv − A22inv )
};

// Compose Hinv-apply: (Hinv x)_i = (Ainv x)_i + (D scattered into genoIdx)
export function applyHinv(
  Ainv: SparseSym,
  corr: SSGBLUPCorrection,
  x: Vec,
  out: Vec,
): void {
  ssMatvec(Ainv, x, out);
  // Add D applied to the subvector x[genoIdx] back into out[genoIdx].
  const n2 = corr.genoIdx.length;
  const xs = new Float64Array(n2);
  for (let i = 0; i < n2; i++) xs[i] = x[corr.genoIdx[i]];
  const ys = matvec(corr.D, xs);
  for (let i = 0; i < n2; i++) out[corr.genoIdx[i]] += ys[i];
}

// Extract the dense A22 sub-block from a pedigree's full A. We compute A22 by
// solving A22 columns from A^{-1} via the relation A22 = (A^{-1}_{22})^{-1}
// when 1's complement form is unavailable; here we'll just rebuild A22 by
// running the tabular kinship for the genotyped subset. That's cleaner.
export function buildA22(
  pairKinship: (i: number, j: number) => number,
  genoIdx: Int32Array,
): Mat {
  const n2 = genoIdx.length;
  const A22 = zeros(n2, n2);
  for (let i = 0; i < n2; i++) {
    for (let j = i; j < n2; j++) {
      const v = pairKinship(genoIdx[i], genoIdx[j]);
      mset(A22, i, j, v);
      mset(A22, j, i, v);
    }
  }
  // Tiny ridge in case of duplicated lines.
  for (let i = 0; i < n2; i++) A22.data[i * n2 + i] += 1e-6;
  return A22;
}

// τ-scaled blend used by most production ssGBLUP runs:
//      G* = (1 − w) G + w A22                (typically w = 0.05)
// We then invert G* and A22 separately and form D = (G*)^{-1} − A22^{-1}.
export function blendGenomic(G: Mat, A22: Mat, w: number): Mat {
  const out = zeros(G.rows, G.cols);
  for (let i = 0; i < G.rows; i++) {
    for (let j = 0; j < G.cols; j++) {
      out.data[i * G.cols + j] = (1 - w) * G.data[i * G.cols + j] + w * A22.data[i * G.cols + j];
    }
  }
  return out;
}

// Cholesky-based inverse of a symmetric PD matrix.
export function invertSymPD(A: Mat): Mat {
  const L = cholesky(A);
  const n = A.rows;
  const Inv = zeros(n, n);
  const ei = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    ei.fill(0);
    ei[j] = 1;
    const y = trsvLower(L, ei);
    const x = trsvUpperT(L, y);
    for (let i = 0; i < n; i++) mset(Inv, i, j, x[i]);
  }
  return Inv;
}

// Compute approximate accuracy r(EBV, true) per animal from PEV.
//   r_i ≈ sqrt(1 − PEV_i / σ²_a)
// We don't have PEV from PCG directly; we approximate by the contribution of
// records and pedigree to the diagonal preconditioner d_i:
//   PEV_i ≈ σ²_e / d_i      ⇒    r ≈ sqrt(1 − λ / (d_i + λ))
// which is exact for the simple repeatability model with K = I. It is a
// reasonable proxy for ranking accuracy in the multi-source case.
export function approxAccuracy(
  recordAnimal: Int32Array,
  KinvDiag: Float64Array,
  lambda: number,
): Float64Array {
  const n = KinvDiag.length;
  const recCount = new Int32Array(n);
  for (let r = 0; r < recordAnimal.length; r++) recCount[recordAnimal[r]]++;
  const acc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d = recCount[i] + lambda * KinvDiag[i];
    const v = 1 - lambda / (d + lambda);
    acc[i] = v > 0 ? Math.sqrt(v) : 0;
  }
  return acc;
}
