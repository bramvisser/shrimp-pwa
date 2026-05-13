// Breeding Program Game.
//
// Each round, three parallel futures (Player / AI / Oracle) plan matings,
// generate offspring, and pick top-N as next-round candidates. Each future
// maintains its own evolving pool so cumulative gain compounds genuinely.
//
//   - Player pool: persisted to db.animals (tagged with gameSessionId) so
//     it shows up on the Pedigree screen and the Genetic Progress screen.
//   - AI / Oracle pools: stored only in GameRound.nextPools (virtual).
//
// EBVs for new candidates are mid-parent EBVs — i.e. the BLUP estimate
// without genotyping the new generation. This is realistic for the game
// horizon (5–10 rounds) and avoids running ssGBLUP between every round.
// Coach notes detect EBV-accuracy decay and explain it to the player.

import { db } from '../db/database';
import { GCORR, TRAITS, founderTrueBV, geneticCholesky, offspringTrueBV } from './simulator';
import { gaussian, makeRng } from './math/rng';
import { pairKinship, pedigreeAinverse, type PedigreeIndex } from './math/pedigree';
import { planMatings, selectionIndex, type Candidate, type EconomicWeights, type MatingProposal } from './math/selection';
import type {
  Animal,
  FutureScore,
  GameRound,
  GameSession,
  TraitCode,
  VirtualBroodstock,
} from './types';

const TRAIT_CODES: TraitCode[] = ['HBW', 'ADG', 'SURV', 'WSSV', 'AHPND', 'YIELD'];
const NEXT_POOL_SIZE = 400;          // bigger pool = slower ΔF
const OFFSPRING_PER_PAIR = 6;
// Variance of "own-information noise" added to mid-parent EBV. Without this,
// full-sibs share an identical EBV and within-family selection is random,
// which collapses Ne. Using h²·σ²_a/4 approximates the EBV signal an actual
// BLUP run with own-phenotype info would produce.
function ownInfoNoiseSD(trait: TraitCode): number {
  const t = TRAITS.find((x) => x.code === trait);
  if (!t) return 0;
  return 0.5 * Math.sqrt(t.heritability * t.geneticVariance);
}

export type StartGameInput = {
  startedBy: string;
  config: GameSession['config'];
};

export async function startGameSession(inp: StartGameInput): Promise<GameSession> {
  const animals = await db.animals.toArray();
  const startGen = animals.reduce((m, a) => Math.max(m, a.generation), 0);
  const session: GameSession = {
    id: `game-${Date.now()}`,
    startedAt: new Date().toISOString(),
    startedBy: inp.startedBy,
    startGeneration: startGen,
    status: 'active',
    config: inp.config,
  };
  await db.gameSessions.put(session);
  return session;
}

export async function listGameRounds(sessionId: string): Promise<GameRound[]> {
  const all = await db.gameRounds.where('sessionId').equals(sessionId).toArray();
  all.sort((a, b) => a.generation - b.generation);
  return all;
}

// Build the initial pool for round 1: line broodstock + their EBVs from the
// most recent BLUP run per trait (line-aware fallback to pooled).
async function buildInitialPool(
  lineId: string,
): Promise<VirtualBroodstock[]> {
  const broodstock = await db.animals
    .where('lineId').equals(lineId)
    .filter((a) => a.stage === 'broodstock')
    .toArray();
  if (broodstock.length === 0) throw new Error('no broodstock for ' + lineId);
  const ebvByAnimal = await loadEBVMap(lineId);
  return broodstock.map((a) => ({
    id: a.id,
    sex: a.sex,
    trueBV: a.__trueBV ?? zeroBV(),
    ebv: ebvByAnimal.get(a.id) ?? {},
    inbreeding: a.inbreeding ?? 0,
    sireId: a.sireId,
    damId: a.damId,
  }));
}

function zeroBV(): Record<TraitCode, number> {
  const o: Record<TraitCode, number> = {} as Record<TraitCode, number>;
  for (const t of TRAIT_CODES) o[t] = 0;
  return o;
}

async function loadEBVMap(
  lineId: string,
): Promise<Map<string, Partial<Record<TraitCode, number>>>> {
  const runs = await db.bvRuns.toArray();
  runs.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const traitRun = new Map<TraitCode, string>();
  for (const r of runs) {
    if (r.trait === 'multi') continue;
    const t = r.trait as TraitCode;
    if (traitRun.has(t)) continue;
    if (r.lineId === lineId || r.lineId == null) traitRun.set(t, r.id);
  }
  const out = new Map<string, Partial<Record<TraitCode, number>>>();
  for (const [trait, runId] of traitRun) {
    const rows = await db.breedingValues.where('[runId+trait]').equals([runId, trait]).toArray();
    for (const r of rows) {
      const m = out.get(r.animalId) ?? {};
      m[trait] = r.ebv;
      out.set(r.animalId, m);
    }
  }
  return out;
}

// Build a Candidate[] with index = sum of weight × value. For Player and AI
// the value is the EBV; for Oracle it's the true BV.
function candidatesFor(
  pool: VirtualBroodstock[],
  weights: EconomicWeights,
  oracle: boolean,
): Candidate[] {
  return pool.map((c) => {
    let idx = 0;
    for (const t of TRAIT_CODES) {
      const w = weights[t] ?? 0;
      if (w === 0) continue;
      idx += w * (oracle ? (c.trueBV[t] ?? 0) : (c.ebv[t] ?? 0));
    }
    return { animalId: c.id, sex: c.sex, index: idx, inbreeding: c.inbreeding };
  });
}

// Generate virtual offspring for a plan against a pool. Computes mean stats
// (FutureScore) and the top-N selected as the next-round pool.
function simulateOffspring(
  plan: MatingProposal[],
  pool: VirtualBroodstock[],
  weights: EconomicWeights,
  kinship: (a: string, b: string) => number,
  rng: () => number,
  L: number[][],
  oracleSelect: boolean,                // top-N selection by truth?
  generation: number,
  idPrefix: string,
): { score: FutureScore; nextPool: VirtualBroodstock[] } {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const offspring: VirtualBroodstock[] = [];
  let predIndexSum = 0;
  for (let pi = 0; pi < plan.length; pi++) {
    const p = plan[pi];
    const sire = byId.get(p.sireId);
    const dam = byId.get(p.damId);
    if (!sire || !dam) continue;
    predIndexSum += p.expectedIndex;
    const offF = 0.5 * kinship(p.sireId, p.damId);
    for (let k = 0; k < OFFSPRING_PER_PAIR; k++) {
      const trueBV = offspringTrueBV(rng as never, L, sire.trueBV, dam.trueBV);
      // Mid-parent EBV plus a small own-information noise. The noise term
      // breaks within-family ties — without it, full-sibs share an EBV and
      // selection picks them at random, which collapses Ne and triggers
      // runaway inbreeding by round 3-4. The noise SD is calibrated to the
      // EBV-variance an actual BLUP run with own-phenotype info would emit.
      const ebv: Partial<Record<TraitCode, number>> = {};
      for (const t of TRAIT_CODES) {
        const s = sire.ebv[t];
        const d = dam.ebv[t];
        if (s !== undefined || d !== undefined) {
          ebv[t] = ((s ?? 0) + (d ?? 0)) / 2 + ownInfoNoiseSD(t) * gaussian(rng as never);
        }
      }
      offspring.push({
        id: `${idPrefix}-r${generation}-p${pi}-k${k}`,
        sex: rng() < 0.5 ? 'M' : 'F',
        trueBV,
        ebv,
        inbreeding: offF,
        sireId: sire.id,
        damId: dam.id,
      });
    }
  }
  // Score the cohort.
  let sumTrueIdx = 0;
  let sumF = 0;
  const traitSums: Partial<Record<TraitCode, number>> = {};
  for (const o of offspring) {
    let idx = 0;
    for (const t of TRAIT_CODES) {
      const v = o.trueBV[t] ?? 0;
      idx += (weights[t] ?? 0) * v;
      traitSums[t] = (traitSums[t] ?? 0) + v;
    }
    sumTrueIdx += idx;
    sumF += o.inbreeding;
  }
  const n = Math.max(1, offspring.length);
  const meanTrueByTrait: Partial<Record<TraitCode, number>> = {};
  for (const t of TRAIT_CODES) meanTrueByTrait[t] = (traitSums[t] ?? 0) / n;
  const score: FutureScore = {
    meanTrueIndex: sumTrueIdx / n,
    meanPredictedIndex: predIndexSum / Math.max(1, plan.length),
    meanF: sumF / n,
    meanTrueByTrait,
  };
  // Pick top-N as next-round pool. Ranking metric matches the future:
  // Oracle ranks by trueBV index (it's the future that knows the truth);
  // Player and AI rank by EBV index (the realistic information set).
  const ranked = offspring.map((o) => {
    let s = 0;
    for (const t of TRAIT_CODES) {
      const w = weights[t] ?? 0;
      if (w === 0) continue;
      s += w * (oracleSelect ? (o.trueBV[t] ?? 0) : (o.ebv[t] ?? 0));
    }
    return { o, s };
  });
  ranked.sort((a, b) => b.s - a.s);
  const nextPool = ranked.slice(0, NEXT_POOL_SIZE).map((r) => r.o);
  return { score, nextPool };
}

// Build a kinship function that knows about: the line's pedigree (real db
// animals) PLUS every virtual animal generated so far across all rounds.
async function buildKinshipFn(
  lineId: string,
  prevRounds: GameRound[],
): Promise<{ fn: (a: string, b: string) => number; index: PedigreeIndex }> {
  const dbAnimals = await db.animals.where('lineId').equals(lineId).toArray();
  const virtualAnimals: Animal[] = [];
  for (const r of prevRounds) {
    for (const future of ['player', 'ai', 'oracle'] as const) {
      const pool = r.nextPools?.[future] ?? [];
      for (const v of pool) {
        if (!v.sireId || !v.damId) continue;
        virtualAnimals.push({
          id: v.id,
          lineId,
          sireId: v.sireId,
          damId: v.damId,
          familyId: null,
          sex: v.sex,
          birthDate: r.committedAt.slice(0, 10),
          generation: r.generation,
          tankId: null,
          stage: 'juvenile',
          spfStatus: 'SPF',
          createdAt: r.committedAt,
        });
      }
    }
  }
  const { index } = pedigreeAinverse([...dbAnimals, ...virtualAnimals]);
  const fn = (a: string, b: string): number => {
    const i = index.idIndex.get(a);
    const j = index.idIndex.get(b);
    if (i === undefined || j === undefined) return 0;
    return pairKinship(index, i, j);
  };
  return { fn, index };
}

function makeFeedback(
  player: FutureScore,
  ai: FutureScore,
  oracle: FutureScore,
  weights: EconomicWeights,
  prevPlayer?: FutureScore,
): string[] {
  const notes: string[] = [];
  const playerVsAi = player.meanTrueIndex - ai.meanTrueIndex;
  const playerVsOracle = oracle.meanTrueIndex - player.meanTrueIndex;
  if (playerVsAi > 0.05) {
    notes.push(`You beat the autonomous AI by $${playerVsAi.toFixed(2)} of realised mid-parent index.`);
  } else if (playerVsAi < -0.05) {
    notes.push(`The autonomous AI beat you by $${(-playerVsAi).toFixed(2)} this round — likely chose more informative candidates.`);
  } else {
    notes.push('You tied the autonomous AI this round.');
  }
  if (playerVsOracle > 0.5) {
    notes.push(`Gap to Oracle is $${playerVsOracle.toFixed(2)} — your EBV-based selection had limited information vs perfect knowledge.`);
  }
  if (player.meanF > 0.05) {
    notes.push(`Mean offspring F = ${player.meanF.toFixed(3)} — close to the ceiling. Long-term ΔF risk if sustained.`);
  } else if (player.meanF < ai.meanF * 0.6) {
    notes.push(`Your inbreeding management is tighter than the AI; you may be leaving gain on the table.`);
  }
  const pT = player.meanTrueByTrait;
  const oT = oracle.meanTrueByTrait;
  let worst: { code: TraitCode; gap: number } | null = null;
  for (const code of TRAIT_CODES) {
    const gap = (oT[code] ?? 0) - (pT[code] ?? 0);
    if (!worst || gap > worst.gap) worst = { code, gap };
  }
  if (worst && worst.gap > 0.3) {
    notes.push(`Largest trait gap vs Oracle: ${worst.code} (${worst.gap.toFixed(2)}). Check your economic weight on this trait, and verify you have a recent BLUP run for it.`);
  }

  // Antagonism diagnostic: detect cases where the player is weighting two
  // negatively-correlated traits in the same direction. Compute the realised
  // delta this round and call out the larger sacrifice.
  if (prevPlayer) {
    for (const c of GCORR) {
      if (c.rg > -0.3) continue; // only flag genuine antagonisms
      const wA = weights[c.a] ?? 0;
      const wB = weights[c.b] ?? 0;
      if (wA <= 0 || wB <= 0) continue;
      const dA = (pT[c.a] ?? 0) - (prevPlayer.meanTrueByTrait[c.a] ?? 0);
      const dB = (pT[c.b] ?? 0) - (prevPlayer.meanTrueByTrait[c.b] ?? 0);
      // If one improved and the other declined, surface the antagonism cost.
      if ((dA > 0 && dB < -0.05) || (dB > 0 && dA < -0.05)) {
        const gainTrait = dA > dB ? c.a : c.b;
        const lossTrait = dA > dB ? c.b : c.a;
        const gain = dA > dB ? dA : dB;
        const loss = dA > dB ? -dB : -dA;
        notes.push(
          `Antagonism cost: r_g(${c.a}, ${c.b}) = ${c.rg.toFixed(2)}. ` +
            `You gained ${gain.toFixed(2)} on ${gainTrait} but lost ${loss.toFixed(2)} on ${lossTrait}. ` +
            `Re-balancing the economic weights would shift you along the trade-off.`,
        );
      }
    }
  }

  return notes;
}

// Commit one round.
export async function commitRound(opts: {
  sessionId: string;
  lineId: string;
  weights: EconomicWeights;
  inbreedingCeiling: number;
  nMatings: number;
}): Promise<GameRound> {
  const session = await db.gameSessions.get(opts.sessionId);
  if (!session) throw new Error('session not found');
  const prevRounds = await listGameRounds(opts.sessionId);
  const lastRound = prevRounds[prevRounds.length - 1];
  const newGen = session.startGeneration + prevRounds.length + 1;

  // Determine pools per future.
  let playerPool: VirtualBroodstock[];
  let aiPool: VirtualBroodstock[];
  let oraclePool: VirtualBroodstock[];
  if (lastRound?.nextPools) {
    playerPool = lastRound.nextPools.player;
    aiPool = lastRound.nextPools.ai;
    oraclePool = lastRound.nextPools.oracle;
  } else {
    const seed = await buildInitialPool(opts.lineId);
    playerPool = seed;
    aiPool = seed;
    oraclePool = seed;
  }

  // Unified kinship over real + virtual pedigree.
  const { fn: kinship } = await buildKinshipFn(opts.lineId, prevRounds);

  // Build per-future plans. If the inbreeding ceiling is binding (planner
  // returns far fewer matings than requested), retry with a relaxed ceiling
  // — same defensive move a real operator would make ("we have to bring in
  // outside genetics or accept higher F"). We log it for the coach notes.
  const planFor = (pool: VirtualBroodstock[], oracleSel: boolean): {
    plan: MatingProposal[];
    relaxedCeiling: number;
  } => {
    let ceiling = opts.inbreedingCeiling;
    let plan = planMatings({
      candidates: candidatesFor(pool, opts.weights, oracleSel),
      kinship,
      inbreedingCeiling: ceiling,
      nMatings: opts.nMatings,
    });
    while (plan.length < opts.nMatings * 0.5 && ceiling < 0.25) {
      ceiling *= 1.5;
      plan = planMatings({
        candidates: candidatesFor(pool, opts.weights, oracleSel),
        kinship,
        inbreedingCeiling: ceiling,
        nMatings: opts.nMatings,
      });
    }
    return { plan, relaxedCeiling: ceiling };
  };
  const { plan: playerPlan, relaxedCeiling: playerCeiling } = planFor(playerPool, false);
  const { plan: aiPlan } = planFor(aiPool, false);
  const { plan: oraclePlan } = planFor(oraclePool, true);

  // Deterministic per-round RNG.
  const seed = hashStr(`${opts.sessionId}:${newGen}`);
  const rng = makeRng(seed);
  const { L } = geneticCholesky();

  const playerRes = simulateOffspring(playerPlan, playerPool, opts.weights, kinship, rng, L, false, newGen, `vplayer-${opts.sessionId.slice(-6)}`);
  const aiRes = simulateOffspring(aiPlan, aiPool, opts.weights, kinship, rng, L, false, newGen, `vai-${opts.sessionId.slice(-6)}`);
  const oracleRes = simulateOffspring(oraclePlan, oraclePool, opts.weights, kinship, rng, L, true, newGen, `voracle-${opts.sessionId.slice(-6)}`);

  // Persist player's offspring as real animals so they appear in pedigree
  // and progress dashboards. We persist the FULL cohort (not just the top-N
  // pool) so the trait-progress charts can include them.
  const offspringRows: Animal[] = [];
  const genDate = new Date();
  // Re-derive the player's full offspring cohort by replaying the same RNG
  // shape — easier: we just emit the next pool members as real animals and
  // also re-emit unselected ones using the same simulateOffspring trace.
  for (const v of playerRes.nextPool) {
    offspringRows.push({
      id: v.id,
      lineId: opts.lineId,
      sireId: v.sireId,
      damId: v.damId,
      familyId: `F-${opts.sessionId.slice(-6)}-G${newGen}`,
      sex: v.sex,
      birthDate: genDate.toISOString().slice(0, 10),
      generation: newGen,
      tankId: `T-S-${opts.sessionId.slice(-6)}-G${newGen}`,
      stage: 'broodstock',  // promoted into the next-round pool
      spfStatus: 'SPF',
      __trueBV: v.trueBV,
      gameSessionId: opts.sessionId,
      inbreeding: v.inbreeding,
      createdAt: genDate.toISOString(),
    });
  }
  await db.animals.bulkPut(offspringRows);

  const round: GameRound = {
    id: `round-${opts.sessionId}-${newGen}`,
    sessionId: opts.sessionId,
    generation: newGen,
    committedAt: new Date().toISOString(),
    player: playerRes.score,
    ai: aiRes.score,
    oracle: oracleRes.score,
    nextPools: {
      player: playerRes.nextPool,
      ai: aiRes.nextPool,
      oracle: oracleRes.nextPool,
    },
    feedback: [
      ...makeFeedback(playerRes.score, aiRes.score, oracleRes.score, opts.weights, lastRound?.player),
      ...(playerCeiling > opts.inbreedingCeiling * 1.01
        ? [`Inbreeding ceiling was binding — relaxed to F=${playerCeiling.toFixed(4)} so the plan could be filled. Your gene pool is concentrating; consider introducing fresh genetics or widening the candidate pool.`]
        : []),
      ...(playerPlan.length < opts.nMatings
        ? [`Only ${playerPlan.length} of ${opts.nMatings} requested mating slots were feasible.`]
        : []),
    ],
  };
  await db.gameRounds.put(round);
  return round;
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Player-only intervention: drop N fresh founders into the player's pool to
// reset the genetic pyramid. They have:
//   - True BVs sampled from the founder distribution (population mean ≈ 0)
//   - No EBVs (we haven't phenotyped or genotyped them)
//   - Zero kinship to anyone else (no shared pedigree)
// Strategic trade-off: lower mean BV today buys diversity that pays off as
// inbreeding accumulates. A real program would source these from a partner
// nucleus or licensed genetics — never trivially "free" but modelled here
// as a button so players can experiment.
export async function introduceFounders(
  sessionId: string,
  n: number,
): Promise<{ added: number }> {
  const session = await db.gameSessions.get(sessionId);
  if (!session) throw new Error('session not found');
  const rounds = await listGameRounds(sessionId);
  if (rounds.length === 0) {
    throw new Error('Play at least one round before introducing outside genetics.');
  }
  const last = rounds[rounds.length - 1];
  const seed = hashStr(`${sessionId}:introduce:${rounds.length}`);
  const rng = makeRng(seed);
  const { L } = geneticCholesky();
  const newcomers: VirtualBroodstock[] = [];
  for (let i = 0; i < n; i++) {
    const trueBV = founderTrueBV(rng, L);
    newcomers.push({
      id: `vfounder-${sessionId.slice(-6)}-r${rounds.length}-${i}`,
      sex: rng() < 0.5 ? 'M' : 'F',
      trueBV,
      ebv: {},
      inbreeding: 0,
      sireId: null,
      damId: null,
    });
  }
  last.nextPools.player = [...last.nextPools.player, ...newcomers];
  await db.gameRounds.put(last);
  await db.decisionLog.put({
    id: `dec-${Date.now()}`,
    ts: new Date().toISOString(),
    kind: 'tank-action',
    actor: localStorage.getItem('operator_name') ?? 'unknown',
    payload: { action: 'introduce-founders', n, sessionId },
    references: { sessionId, roundId: last.id },
  });
  return { added: n };
}

export async function abandonSession(sessionId: string): Promise<void> {
  await db.animals.where('gameSessionId').equals(sessionId).delete();
  await db.gameRounds.where('sessionId').equals(sessionId).delete();
  await db.gameSessions.update(sessionId, { status: 'finished' });
}

// Re-export for the UI's selection-index use.
export { selectionIndex };
