// Minimal dense linear-algebra utilities for the breeding engine.
//
// We deliberately avoid pulling in a heavy matrix library — the operations we
// need are small and well-defined: matvec, gemv, gemm (small), Cholesky on a
// symmetric PD matrix, and a preconditioned conjugate gradient (PCG) solver
// for sparse symmetric PD systems (used by the BLUP MMEs and by ssGBLUP).
//
// Matrices are stored row-major in a Float64Array of length n*n. Rectangular
// matrices keep their dimensions in (rows, cols).

export type Vec = Float64Array;
export type Mat = { rows: number; cols: number; data: Float64Array };

export function zeros(rows: number, cols: number): Mat {
  return { rows, cols, data: new Float64Array(rows * cols) };
}

export function identity(n: number): Mat {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
  return m;
}

export function vec(n: number): Vec {
  return new Float64Array(n);
}

export function mget(M: Mat, i: number, j: number): number {
  return M.data[i * M.cols + j];
}
export function mset(M: Mat, i: number, j: number, v: number): void {
  M.data[i * M.cols + j] = v;
}
export function madd(M: Mat, i: number, j: number, v: number): void {
  M.data[i * M.cols + j] += v;
}

export function copy(M: Mat): Mat {
  return { rows: M.rows, cols: M.cols, data: new Float64Array(M.data) };
}

// y = A x  for dense A.
export function matvec(A: Mat, x: Vec, out?: Vec): Vec {
  const y = out ?? new Float64Array(A.rows);
  for (let i = 0; i < A.rows; i++) {
    let s = 0;
    const off = i * A.cols;
    for (let j = 0; j < A.cols; j++) s += A.data[off + j] * x[j];
    y[i] = s;
  }
  return y;
}

// C = A B  (small dense gemm, allocates C).
export function matmul(A: Mat, B: Mat): Mat {
  if (A.cols !== B.rows) throw new Error('matmul shape');
  const C = zeros(A.rows, B.cols);
  for (let i = 0; i < A.rows; i++) {
    for (let k = 0; k < A.cols; k++) {
      const aik = A.data[i * A.cols + k];
      if (aik === 0) continue;
      const offB = k * B.cols;
      const offC = i * B.cols;
      for (let j = 0; j < B.cols; j++) C.data[offC + j] += aik * B.data[offB + j];
    }
  }
  return C;
}

export function transpose(A: Mat): Mat {
  const T = zeros(A.cols, A.rows);
  for (let i = 0; i < A.rows; i++)
    for (let j = 0; j < A.cols; j++) T.data[j * T.cols + i] = A.data[i * A.cols + j];
  return T;
}

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function axpy(alpha: number, x: Vec, y: Vec): void {
  for (let i = 0; i < x.length; i++) y[i] += alpha * x[i];
}

export function scal(alpha: number, x: Vec): void {
  for (let i = 0; i < x.length; i++) x[i] *= alpha;
}

export function vsub(a: Vec, b: Vec): Vec {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i];
  return out;
}

// In-place Cholesky factorisation A = L L'. Lower triangle of L overwrites A.
// Throws if A is not positive-definite (negative on the diagonal).
export function cholesky(A: Mat): Mat {
  if (A.rows !== A.cols) throw new Error('cholesky: square required');
  const n = A.rows;
  const L = copy(A);
  for (let j = 0; j < n; j++) {
    let s = L.data[j * n + j];
    for (let k = 0; k < j; k++) s -= L.data[j * n + k] * L.data[j * n + k];
    if (s <= 0) throw new Error('cholesky: not PD at row ' + j);
    const diag = Math.sqrt(s);
    L.data[j * n + j] = diag;
    for (let i = j + 1; i < n; i++) {
      let t = L.data[i * n + j];
      for (let k = 0; k < j; k++) t -= L.data[i * n + k] * L.data[j * n + k];
      L.data[i * n + j] = t / diag;
    }
    // Zero the upper triangle so L is strictly lower.
    for (let i = 0; i < j; i++) L.data[i * n + j] = 0;
  }
  return L;
}

// Solve L y = b (lower-triangular forward substitution).
export function trsvLower(L: Mat, b: Vec): Vec {
  const n = L.rows;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L.data[i * n + k] * y[k];
    y[i] = s / L.data[i * n + i];
  }
  return y;
}

// Solve L' x = y (upper backward substitution where U = L').
export function trsvUpperT(L: Mat, y: Vec): Vec {
  const n = L.rows;
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L.data[k * n + i] * x[k];
    x[i] = s / L.data[i * n + i];
  }
  return x;
}

// Solve A x = b for symmetric PD A using a fresh Cholesky.
export function solvePD(A: Mat, b: Vec): Vec {
  const L = cholesky(A);
  const y = trsvLower(L, b);
  return trsvUpperT(L, y);
}

// Invert symmetric PD A (small n only). Used for G^{-1} in ssGBLUP at
// demo scale. For larger problems we'd switch to APY.
export function invertPD(A: Mat): Mat {
  const n = A.rows;
  const L = cholesky(A);
  const Inv = zeros(n, n);
  const ei = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    ei.fill(0);
    ei[j] = 1;
    const y = trsvLower(L, ei);
    const x = trsvUpperT(L, y);
    for (let i = 0; i < n; i++) Inv.data[i * n + j] = x[i];
  }
  return Inv;
}

// Sparse symmetric matrix in coordinate form. Lower-triangle entries are
// implicit duplicates of upper-triangle ones.
export type SparseSym = {
  n: number;
  // Diagonal stored densely for fast access.
  diag: Float64Array;
  // Off-diagonal entries (i < j) — Map keyed by `${i}:${j}` for O(1) accumulate.
  off: Map<number, number>;
};

export function sparseSym(n: number): SparseSym {
  return { n, diag: new Float64Array(n), off: new Map() };
}

function offKey(i: number, j: number): number {
  // Pack i, j (i<j) into a single 32-bit key.
  return i * 0x10000 + j;
}

export function ssAdd(S: SparseSym, i: number, j: number, v: number): void {
  if (i === j) {
    S.diag[i] += v;
    return;
  }
  const ii = i < j ? i : j;
  const jj = i < j ? j : i;
  const k = offKey(ii, jj);
  S.off.set(k, (S.off.get(k) ?? 0) + v);
}

// y = S x for symmetric S.
export function ssMatvec(S: SparseSym, x: Vec, out?: Vec): Vec {
  const y = out ?? new Float64Array(S.n);
  for (let i = 0; i < S.n; i++) y[i] = S.diag[i] * x[i];
  for (const [k, v] of S.off) {
    const i = Math.floor(k / 0x10000);
    const j = k - i * 0x10000;
    y[i] += v * x[j];
    y[j] += v * x[i];
  }
  return y;
}

// Preconditioned conjugate gradient on symmetric PD A (provided by an
// `apply` callback) with a simple Jacobi (diagonal) preconditioner.
export function pcg(
  apply: (x: Vec, out: Vec) => void,
  diag: Float64Array,
  b: Vec,
  opts: { tol?: number; maxIter?: number } = {},
): { x: Vec; iters: number; residual: number } {
  const n = b.length;
  const tol = opts.tol ?? 1e-8;
  const maxIter = opts.maxIter ?? Math.min(2000, 10 * n);
  const x = new Float64Array(n);
  const r = new Float64Array(b);            // r = b - A x  (x=0 ⇒ r=b)
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
  const p = new Float64Array(z);
  let rz = dot(r, z);
  const Ap = new Float64Array(n);
  const bnorm = Math.max(1, Math.sqrt(dot(b, b)));
  let iter = 0;
  let resid = Math.sqrt(dot(r, r)) / bnorm;
  while (iter < maxIter && resid > tol) {
    apply(p, Ap);
    const alpha = rz / dot(p, Ap);
    axpy(alpha, p, x);
    axpy(-alpha, Ap, r);
    for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
    const rzNew = dot(r, z);
    const beta = rzNew / rz;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    rz = rzNew;
    iter++;
    resid = Math.sqrt(dot(r, r)) / bnorm;
  }
  return { x, iters: iter, residual: resid };
}
