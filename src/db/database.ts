import Dexie, { type Table } from 'dexie';
import type {
  Animal,
  BreedingValue,
  BreedingValueRun,
  ChallengeTest,
  DecisionLog,
  GameRound,
  GameSession,
  GeneticCorrelation,
  Line,
  MatingPlan,
  Phenotype,
  SelectionIndex,
  SnpEffects,
  SnpPanel,
  Trait,
} from '../breeding/types';

export type SyncStatus = 'pending' | 'synced' | 'failed';
export type MortalityCause = 'unknown' | 'disease' | 'handling' | 'water' | 'other';
export type AlertType = 'critical' | 'warning' | 'info';
export type ReadSyncStatus = 'synced' | 'pending';

export interface Farm {
  id: string;
  name: string;
  slug: string;
  location?: string;
}

export interface Measurement {
  id: string;
  farmId: string;
  tankId?: string;
  cohortId?: string;
  rfidTag?: string;
  barcode?: string;
  animalId?: string;
  weightGrams: number;
  operatorName: string;
  deviceId?: string;
  scaleId?: string;
  createdAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  syncAttempts: number;
}

export interface Mortality {
  id: string;
  farmId: string;
  tankId?: string;
  cohortId?: string;
  rfidTag?: string;
  animalId?: string;
  cause: MortalityCause;
  remarks?: string;
  photo?: string;
  operatorName: string;
  createdAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  syncAttempts: number;
}

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  farmId: string | null;
  farmName: string | null;
  tankId: string | null;
  createdAt: string;
  readAt: string | null;
  readSyncStatus?: ReadSyncStatus;
}

// Genotypes are stored as their own row keyed by animalId, with the dosage
// vector in a Blob to keep regular animal rows light.
export interface GenotypeBlob {
  animalId: string;
  panelId: string;
  callRate: number;
  genotypedAt: string;
  dosage: Blob; // Uint8Array of length M (panel.density)
}

class ShrimpDatabase extends Dexie {
  farms!: Table<Farm, string>;
  measurements!: Table<Measurement, string>;
  mortalities!: Table<Mortality, string>;
  alerts!: Table<Alert, string>;

  // Breeding-program tables.
  lines!: Table<Line, string>;
  traits!: Table<Trait, string>;
  geneticCorrelations!: Table<GeneticCorrelation, string>;
  animals!: Table<Animal, string>;
  phenotypes!: Table<Phenotype, string>;
  challenges!: Table<ChallengeTest, string>;
  snpPanels!: Table<SnpPanel, string>;
  genotypes!: Table<GenotypeBlob, string>;
  snpEffects!: Table<SnpEffects, string>;
  bvRuns!: Table<BreedingValueRun, string>;
  breedingValues!: Table<BreedingValue, string>;
  selectionIndices!: Table<SelectionIndex, string>;
  matingPlans!: Table<MatingPlan, string>;
  decisionLog!: Table<DecisionLog, string>;
  gameSessions!: Table<GameSession, string>;
  gameRounds!: Table<GameRound, string>;

  constructor() {
    super('ShrimpPWA');
    this.version(1).stores({
      measurements: 'id, farmId, syncStatus, createdAt',
      mortalities: 'id, farmId, syncStatus, createdAt',
    });
    this.version(2).stores({
      farms: 'id, slug',
      measurements: 'id, farmId, syncStatus, createdAt',
      mortalities: 'id, farmId, syncStatus, createdAt',
    });
    this.version(3).stores({
      farms: 'id, name, slug',
      measurements: 'id, farmId, syncStatus, createdAt',
      mortalities: 'id, farmId, syncStatus, createdAt',
    });
    this.version(4).stores({
      farms: 'id, name, slug',
      measurements: 'id, farmId, syncStatus, createdAt',
      mortalities: 'id, farmId, syncStatus, createdAt',
      alerts: 'id, type, farmId, createdAt, readSyncStatus',
    });
    this.version(5).stores({
      farms: 'id, name, slug',
      measurements: 'id, farmId, syncStatus, createdAt',
      mortalities: 'id, farmId, syncStatus, createdAt',
      alerts: 'id, type, farmId, createdAt, readSyncStatus',
      lines: 'id, kind',
      traits: 'code',
      geneticCorrelations: '[a+b]',
      animals: 'id, lineId, generation, sex, sireId, damId, familyId, stage, tankId',
      phenotypes: 'id, animalId, trait, measuredAt',
      challenges: 'id, pathogen, startedAt',
      snpPanels: 'id',
      genotypes: 'animalId, panelId, genotypedAt',
      snpEffects: '[modelVersion+trait], modelVersion, trait, panelId',
      bvRuns: 'id, finishedAt, method, trait',
      breedingValues: 'id, runId, animalId, trait, [runId+trait], [animalId+trait]',
      selectionIndices: '[runId+animalId], runId, animalId',
      matingPlans: 'id, generation, status, proposedAt',
      decisionLog: 'id, ts, kind, actor',
    });
    this.version(6).stores({
      farms: 'id, name, slug',
      measurements: 'id, farmId, syncStatus, createdAt',
      mortalities: 'id, farmId, syncStatus, createdAt',
      alerts: 'id, type, farmId, createdAt, readSyncStatus',
      lines: 'id, kind',
      traits: 'code',
      geneticCorrelations: '[a+b]',
      animals: 'id, lineId, generation, sex, sireId, damId, familyId, stage, tankId, gameSessionId',
      phenotypes: 'id, animalId, trait, measuredAt',
      challenges: 'id, pathogen, startedAt',
      snpPanels: 'id',
      genotypes: 'animalId, panelId, genotypedAt',
      snpEffects: '[modelVersion+trait], modelVersion, trait, panelId',
      bvRuns: 'id, finishedAt, method, trait',
      breedingValues: 'id, runId, animalId, trait, [runId+trait], [animalId+trait]',
      selectionIndices: '[runId+animalId], runId, animalId',
      matingPlans: 'id, generation, status, proposedAt',
      decisionLog: 'id, ts, kind, actor',
      gameSessions: 'id, status, startedAt',
      gameRounds: 'id, sessionId, generation, committedAt',
    });
  }
}

export const db = new ShrimpDatabase();
