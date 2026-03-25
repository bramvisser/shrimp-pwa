import Dexie, { type Table } from 'dexie';

export type SyncStatus = 'pending' | 'synced' | 'failed';
export type MortalityCause = 'unknown' | 'disease' | 'handling' | 'water' | 'other';

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
  operatorName: string;
  createdAt: string;
  syncStatus: SyncStatus;
  syncError?: string;
  syncAttempts: number;
}

class ShrimpDatabase extends Dexie {
  farms!: Table<Farm, string>;
  measurements!: Table<Measurement, string>;
  mortalities!: Table<Mortality, string>;

  constructor() {
    super('ShrimpPWA');
    this.version(1).stores({
      measurements: 'id, farmId, syncStatus, createdAt',
      mortalities: 'id, farmId, syncStatus, createdAt',
    });
    this.version(2).stores({
      farms: 'id, name, slug',
      measurements: 'id, farmId, syncStatus, createdAt',
      mortalities: 'id, farmId, syncStatus, createdAt',
    });
  }
}

export const db = new ShrimpDatabase();
