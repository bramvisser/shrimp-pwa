import Dexie, { type Table } from 'dexie';

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

class ShrimpDatabase extends Dexie {
  farms!: Table<Farm, string>;
  measurements!: Table<Measurement, string>;
  mortalities!: Table<Mortality, string>;
  alerts!: Table<Alert, string>;

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
  }
}

export const db = new ShrimpDatabase();
