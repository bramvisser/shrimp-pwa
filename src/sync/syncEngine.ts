import { db } from '../db/database';
import { supabase } from '../services/supabaseClient';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

async function syncMeasurements() {
  const pending = await db.measurements
    .where('syncStatus')
    .anyOf(['pending', 'failed'])
    .filter((r) => r.syncAttempts < MAX_ATTEMPTS)
    .toArray();

  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const rows = batch.map((r) => ({
      id: r.id,
      farm_id: r.farmId,
      tank_id: r.tankId || null,
      cohort_id: r.cohortId || null,
      rfid_tag: r.rfidTag || null,
      barcode: r.barcode || null,
      animal_id: r.animalId || null,
      weight_grams: r.weightGrams,
      operator_name: r.operatorName,
      device_id: r.deviceId || null,
      scale_id: r.scaleId || null,
      client_created_at: r.createdAt,
    }));

    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase.from('measurements').upsert(rows, { onConflict: 'id' });
      if (error) throw error;

      await Promise.all(
        batch.map((r) =>
          db.measurements.update(r.id, { syncStatus: 'synced', syncError: undefined })
        )
      );
      synced += batch.length;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await Promise.all(
        batch.map((r) =>
          db.measurements.update(r.id, {
            syncStatus: 'failed',
            syncError: errorMsg,
            syncAttempts: (r.syncAttempts || 0) + 1,
          })
        )
      );
      failed += batch.length;
    }
  }

  return { synced, failed };
}

async function syncMortalities() {
  const pending = await db.mortalities
    .where('syncStatus')
    .anyOf(['pending', 'failed'])
    .filter((r) => r.syncAttempts < MAX_ATTEMPTS)
    .toArray();

  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const rows = batch.map((r) => ({
      id: r.id,
      farm_id: r.farmId,
      tank_id: r.tankId || null,
      cohort_id: r.cohortId || null,
      rfid_tag: r.rfidTag || null,
      animal_id: r.animalId || null,
      cause: r.cause,
      remarks: r.remarks || null,
      operator_name: r.operatorName,
      client_created_at: r.createdAt,
    }));

    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase.from('mortalities').upsert(rows, { onConflict: 'id' });
      if (error) throw error;

      await Promise.all(
        batch.map((r) =>
          db.mortalities.update(r.id, { syncStatus: 'synced', syncError: undefined })
        )
      );
      synced += batch.length;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await Promise.all(
        batch.map((r) =>
          db.mortalities.update(r.id, {
            syncStatus: 'failed',
            syncError: errorMsg,
            syncAttempts: (r.syncAttempts || 0) + 1,
          })
        )
      );
      failed += batch.length;
    }
  }

  return { synced, failed };
}

async function syncAlertReadState() {
  const pending = await db.alerts
    .where('readSyncStatus')
    .equals('pending')
    .toArray();

  if (pending.length === 0) return;

  for (const alert of pending) {
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { error } = await supabase
        .from('alerts')
        .update({ read_at: alert.readAt })
        .eq('id', alert.id);
      if (error) throw error;
      await db.alerts.update(alert.id, { readSyncStatus: 'synced' });
    } catch (err) {
      console.warn(`Failed to sync read state for alert ${alert.id}:`, err);
    }
  }
}

export async function syncAll() {
  const mResult = await syncMeasurements();
  const tResult = await syncMortalities();
  await syncAlertReadState();

  return {
    synced: mResult.synced + tResult.synced,
    failed: mResult.failed + tResult.failed,
  };
}

export async function retryFailed() {
  await db.measurements
    .where('syncStatus')
    .equals('failed')
    .modify({ syncStatus: 'pending', syncAttempts: 0, syncError: undefined });
  await db.mortalities
    .where('syncStatus')
    .equals('failed')
    .modify({ syncStatus: 'pending', syncAttempts: 0, syncError: undefined });
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync() {
  if (syncInterval) return;

  const handleOnline = () => {
    syncAll().catch(console.error);
  };

  window.addEventListener('online', handleOnline);

  if (navigator.onLine) {
    syncAll().catch(console.error);
  }

  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      syncAll().catch(console.error);
    }
  }, 30_000);
}
