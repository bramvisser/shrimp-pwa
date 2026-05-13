// Domain types for the shrimp breeding program.
//
// Conventions:
// - All IDs are short strings (e.g. "A0001"). They are stable across DB versions.
// - Values are SI: weight in grams, time in days, fractions in [0,1].
// - Trait codes are short symbols: HBW (harvest body weight), ADG (avg daily gain),
//   SURV (survival to harvest), WSSV (WSSV survival), AHPND (AHPND survival),
//   FCR (residual feed intake / feed efficiency), YIELD (meat yield %).

export type Sex = 'M' | 'F';

export type LifeStage =
  | 'larva'        // pre-PL
  | 'pl'           // post-larva
  | 'juvenile'
  | 'broodstock'   // selected for breeding
  | 'harvested'
  | 'dead'
  | 'culled';

export type Line = {
  id: string;             // 'SPF-A', 'SPR-WSSV', etc.
  name: string;
  kind: 'SPF' | 'SPR';
  pathogenFocus?: 'WSSV' | 'TSV' | 'AHPND' | 'EHP' | null;
  foundedAt: string;      // ISO date
  notes?: string;
};

export type TraitCode = 'HBW' | 'ADG' | 'SURV' | 'WSSV' | 'AHPND' | 'FCR' | 'YIELD';

export type Trait = {
  code: TraitCode;
  name: string;
  unit: string;
  // Variance components (assumed-known truth used for the simulator and as priors).
  heritability: number;       // h^2
  geneticVariance: number;    // σ²_a in the trait's own units
  residualVariance: number;   // σ²_e
  // Selection-index economic weight in $ per unit of trait per harvested animal.
  economicWeight: number;
  // Higher is better? Mortality-style traits (WSSV) are stored as survival probabilities,
  // so higher is always better.
  betterIsHigher: true;
};

// Pairwise additive genetic correlation, e.g. r_g(HBW, WSSV) ≈ -0.6.
export type GeneticCorrelation = {
  a: TraitCode;
  b: TraitCode;
  rg: number;
};

export type Animal = {
  id: string;
  lineId: string;
  sireId: string | null;       // null = founder
  damId: string | null;
  familyId: string | null;     // full-sib family
  sex: Sex;
  birthDate: string;           // ISO (date of spawning batch)
  generation: number;          // 0 = founders
  tankId: string | null;
  stage: LifeStage;
  spfStatus: 'SPF' | 'SPR' | 'unverified';
  // Tag for animals created inside a game session (forked timeline).
  gameSessionId?: string;
  // Hidden truth used by the simulator only — never displayed as truth.
  // For traits {HBW, WSSV, ...}: the animal's true additive breeding value.
  // Not used by any production logic; production logic predicts EBVs from data.
  __trueBV?: Record<TraitCode, number>;
  // Inbreeding coefficient F (computed from pedigree).
  inbreeding?: number;
  createdAt: string;
};

// Measured phenotype for one animal × one trait.
// HBW comes from MeasurementScreen (weight at harvest age).
// WSSV/AHPND come from challenge tests.
// SURV is binary 0/1 derived from MortalityScreen.
export type Phenotype = {
  id: string;
  animalId: string;
  trait: TraitCode;
  value: number;             // raw observation
  measuredAt: string;
  context?: {
    challengeId?: string;
    tankId?: string;
    ageDays?: number;
    censored?: boolean;      // for survival-time traits
  };
};

export type ChallengeTest = {
  id: string;
  pathogen: 'WSSV' | 'AHPND' | 'EHP' | 'TSV';
  startedAt: string;
  endedAt?: string;
  dose: string;
  notes?: string;
};

// SNP genotype matrix lives in compact form: one Uint8Array per animal,
// each byte 0/1/2 = number of copies of the reference allele.
// 0xFF = missing call.
export type Genotype = {
  animalId: string;
  panelId: string;
  callRate: number;          // fraction of non-missing
  genotypedAt: string;
  // Stored separately as Blob in Dexie to keep this row light.
  // The hex below is for serialization paths; in practice we attach the array on read.
};

export type SnpPanel = {
  id: string;
  name: string;
  density: number;           // number of markers
  // Genome layout: marker → chromosome and position (cM).
  // Chromosome counts are stored compactly; positions per marker are in cMByMarker.
  chrCount: number;
  // Length M arrays, persisted as JSON in IndexedDB. Small enough (~10K).
  cMByMarker: number[];
  chrByMarker: number[];
  // Population allele frequencies p_j of the reference allele (length M).
  alleleFreq: number[];
};

// Pre-computed SNP effects β̂ from a reference ssGBLUP run.
// Predicting GEBV for a new genotyped animal is one dot product g·β̂.
export type SnpEffects = {
  modelVersion: string;     // matches BreedingValueRun.id of the reference run
  panelId: string;
  trait: TraitCode;
  lineId: string | null;    // null = pooled across lines
  // Length M; persisted as JSON or Float32Array Blob.
  effects: number[];
  meanAdjust: number;       // subtracted from g·β̂ to centre on the reference base
  trainingN: number;
  trainingAccuracy: number; // CV r² on holdout
};

export type BreedingValueRun = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  method: 'PBLUP' | 'GBLUP' | 'ssGBLUP';
  trait: TraitCode | 'multi';
  lineId: string | null;          // null = pooled across lines
  nAnimals: number;
  nGenotyped: number;
  notes?: string;
};

export type BreedingValue = {
  id: string;                 // `${runId}:${animalId}:${trait}`
  runId: string;
  animalId: string;
  trait: TraitCode;
  ebv: number;                // (G)EBV in trait units
  accuracy: number;           // r(EBV, true), Pearson-style estimate from PEV
  source: 'pedigree' | 'genomic' | 'blend';
  createdAt: string;
};

// Aggregate selection index per candidate, for ranking.
export type SelectionIndex = {
  runId: string;
  animalId: string;
  index: number;              // dollar-units per animal
  contributions: Record<TraitCode, number>; // per-trait $ contribution
};

// Output of the mating planner — the dark-farm decision artefact.
export type MatingPlan = {
  id: string;
  generation: number;
  proposedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  status: 'proposed' | 'approved' | 'executed' | 'rejected';
  // Inputs used (for reproducibility / audit).
  inputs: {
    runId: string;
    economicWeights: Partial<Record<TraitCode, number>>;
    inbreedingCeiling: number; // max F(offspring)
    nMatings: number;
    sexRatio: number;          // males per female slot, e.g. 0.7
  };
  matings: {
    sireId: string;
    damId: string;
    expectedIndex: number;     // ($) mid-parent index
    expectedF: number;         // F of the offspring under the pedigree
  }[];
};

// Game / scenario mode — turns the breeding program into a flight simulator
// where the human and the autonomous agent run side by side from the same
// state. The simulator (and only the simulator) knows the true breeding
// values, so each round can score Player vs AI vs Oracle.

export type GameSession = {
  id: string;
  startedAt: string;
  startedBy: string;             // operator name
  // Generation at which the session was anchored (last "real" gen at start).
  startGeneration: number;
  status: 'active' | 'finished';
  // Player-set parameters that frame the run.
  config: {
    nMatings: number;
    inbreedingCeiling: number;
    economicWeights: Partial<Record<TraitCode, number>>;
  };
};

// Per-future scoring for one round.
export type FutureScore = {
  // Mean true-BV index of the offspring cohort (the realised quantity).
  meanTrueIndex: number;
  // Mean predicted index from the mating plan (mid-parent).
  meanPredictedIndex: number;
  // Mean inbreeding coefficient of offspring.
  meanF: number;
  // Mean true value per trait, useful for diagnosis.
  meanTrueByTrait: Partial<Record<TraitCode, number>>;
};

// In-memory representation of a candidate animal for the game's per-future
// pools. We carry both the truth (for Oracle and offspring sampling) and the
// best estimate (for Player and AI ranking).
export type VirtualBroodstock = {
  id: string;
  sex: Sex;
  trueBV: Record<TraitCode, number>;
  ebv: Partial<Record<TraitCode, number>>;
  inbreeding: number;
  sireId: string | null;
  damId: string | null;
};

export type GameRound = {
  id: string;
  sessionId: string;
  generation: number;
  committedAt: string;
  player: FutureScore;
  ai: FutureScore;
  oracle: FutureScore;
  // Top-N selected offspring per future, used as the candidate pool for the
  // next round. Player's offspring are also persisted to db.animals (tagged
  // with gameSessionId); AI and Oracle offspring exist only here.
  nextPools: {
    player: VirtualBroodstock[];
    ai: VirtualBroodstock[];
    oracle: VirtualBroodstock[];
  };
  // Plain-English notes from the post-round analyser.
  feedback: string[];
};

// Per-decision audit trail entry, stored as immutable rows.
export type DecisionLog = {
  id: string;
  ts: string;
  kind: 'mating-plan' | 'cull-list' | 'genotype-qc' | 'parentage-call' | 'tank-action';
  actor: 'system' | string;   // 'system' for autonomous, otherwise operator name
  payload: unknown;
  references?: Record<string, string>; // ids of related entities
};
