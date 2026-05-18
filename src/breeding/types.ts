// Domain types for the shrimp breeding program.
//
// Conventions:
// - All IDs are short strings (e.g. "A0001"). They are stable across DB versions.
// - Values are SI: weight in grams, time in days, fractions in [0,1].
// - Trait codes: HBW (harvest body weight), TagW (weight at PIT-tagging),
//   EMS_SURV (survival under EMS challenge), EMS_DtD (survival time under
//   challenge — modelled higher-is-better), OP (commercial-sentinel harvest weight).
//   Legacy codes (ADG, SURV, WSSV, AHPND, FCR, YIELD) are retained in the union for
//   historical-data compatibility but are not used by the active program.

export type Sex = 'M' | 'F';

export type LifeStage =
  | 'larva'        // pre-PL
  | 'pl'           // post-larva
  | 'juvenile'
  | 'broodstock'   // selected for breeding
  | 'harvested'
  | 'dead'
  | 'culled';

// Decision-level state, orthogonal to biological LifeStage. Drives the
// "what can I act on right now" view on the farm.
export type ProgramStatus =
  | 'candidate'    // in family / grow-out tank, not yet decided on
  | 'selected'     // passed keepersort, sitting in a maturation tank
  | 'mated'        // already used in a spawn, no longer available
  | 'deselected'   // failed keepersort; moved out of NP (often to MP)
  | 'culled'       // removed from the program
  | 'inactive';    // historic: harvested, dead, or otherwise out of play

// Where an animal lives in the breeding pyramid.
export type Tier = 'NP' | 'MP';

// Phenotyping / challenge destinations for sibs of a candidate cohort.
// `hawaii-nucleus`   — sibs of candidates measured for HBW/TagW under nucleus conditions
// `ems-challenge`    — sibs subjected to EMS challenge for DtD + survival
// `indonesia-sentinel`, `india-sentinel` — cousins of candidates grown out commercially for OP
export type TestSite =
  | 'hawaii-nucleus'
  | 'ems-challenge'
  | 'indonesia-sentinel'
  | 'india-sentinel';

export type Line = {
  id: string;             // 'SP' (Speed) or 'ST' (Strength) in the new model
  name: string;
  kind: 'SPF' | 'SPR';
  pathogenFocus?: 'WSSV' | 'TSV' | 'AHPND' | 'EHP' | 'EMS' | null;
  foundedAt: string;      // ISO date
  notes?: string;
};

// A spawning batch is the unit of program operation. Multiple batches per line
// run in parallel and overlap; matings can be cross-batch.
// Naming: `${lineId}_${YY}${NN}` (e.g. 'SP_2601') where NN is the sequence in
// the year. Three batches/year per line by default.
export type Batch = {
  id: string;             // 'SP_2601'
  lineId: string;
  year: number;
  sequenceInYear: number; // 1..3 (or 4) within the year
  // Calendar anchors (ISO dates). Optional dates fill in as the batch progresses.
  matingWeek: number;     // ISO week within `year` when matings happened
  spawnDate: string;
  hatchDate?: string;
  familyTankDate?: string;
  taggingDate?: string;
  selectionDate?: string;
  status:
    | 'planned'
    | 'spawning'
    | 'larval'
    | 'family-tank'
    | 'tagged'
    | 'selection'      // keepersort in progress
    | 'mating'         // broodstock mating to seed the next batch
    | 'completed';
  notes?: string;
};

// A single 1:1 mating that produces (or seeds) offspring in a future batch.
export type Mating = {
  id: string;
  // The future-offspring batch this mating contributes to.
  offspringBatchId: string;
  // Source-batch parents (may come from different batches in cross-batch mating).
  sireId: string;
  damId: string;
  spawnTank: string;      // maturation/spawn tank ID
  plannedAt: string;
  executedAt?: string;
  status: 'planned' | 'executed' | 'failed' | 'canceled';
  // Output (filled in once the offspring batch is hatched).
  familyId?: string;
  offspringCount?: number;
  notes?: string;
};

// Audit trail of state-changing actions on individual animals.
export type LifecycleEvent = {
  id: string;
  animalId: string;
  ts: string;
  kind:
    | 'selected'
    | 'deselected'
    | 'mated'
    | 'culled'
    | 'genotyped'
    | 'phenotyped'
    | 'tagged'
    | 'transferred';
  actor: string;          // operator name or 'system'
  details?: Record<string, unknown>;
};

export type TraitCode =
  // Active production traits in the new model:
  | 'HBW'      // harvest body weight (sibs at Hawaii nucleus harvest)
  | 'TagW'     // weight at PIT-tagging (on candidates)
  | 'EMS_SURV' // survival under EMS challenge (sibs)
  | 'EMS_DtD'  // survival time under EMS challenge (sibs); higher = better
  | 'OP'       // observed performance at commercial sentinel (cousins)
  // Legacy / kept for back-compat:
  | 'ADG'
  | 'SURV'
  | 'WSSV'
  | 'AHPND'
  | 'FCR'
  | 'YIELD';

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
  // Higher is better? Mortality-style traits are stored as survival probabilities or
  // survival time, so higher is usually better, but we allow `false` so traits like
  // raw days-to-death can be modelled directly without inverting.
  betterIsHigher: boolean;
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

  // ---- New batch / pyramid fields ----
  // The spawning batch this animal belongs to. null for founders.
  batchId: string | null;
  // PIT-tag, assigned at tagging-time for candidates that survive to PIT-tagging.
  pitTag?: string;
  // Pyramid tier this animal lives in.
  tier: Tier;
  // Where sibs/cousins of this animal are being tested. Undefined for animals
  // not designated to a test site (i.e. they are candidates kept in the nucleus).
  testSite?: TestSite;
  // Decision-level status. Drives "what can I act on now" views.
  programStatus: ProgramStatus;
  // Maturation/spawn tank assignment for selected broodstock.
  spawnTank?: string;
  // Decision timestamps.
  selectedAt?: string;
  deselectedAt?: string;
  matedAt?: string;
  culledAt?: string;

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

// Per-decision audit trail entry, stored as immutable rows.
export type DecisionLog = {
  id: string;
  ts: string;
  kind: 'mating-plan' | 'cull-list' | 'genotype-qc' | 'parentage-call' | 'tank-action';
  actor: 'system' | string;   // 'system' for autonomous, otherwise operator name
  payload: unknown;
  references?: Record<string, string>; // ids of related entities
};
