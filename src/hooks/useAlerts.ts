import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Alert } from '../db/database';
import { supabase } from '../services/supabaseClient';

async function fetchAndCacheAlerts() {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('id, type, title, message, farm_id, farm_name, tank_id, created_at, read_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return;

    // Preserve locally-pending read states before overwriting
    const pendingReads = await db.alerts
      .where('readSyncStatus')
      .equals('pending')
      .toArray();
    const pendingReadMap = new Map(pendingReads.map((a) => [a.id, a]));

    const alerts: Alert[] = data.map((row: Record<string, unknown>) => {
      const localPending = pendingReadMap.get(row.id as string);
      return {
        id: row.id as string,
        type: row.type as Alert['type'],
        title: row.title as string,
        message: row.message as string,
        farmId: (row.farm_id as string) ?? null,
        farmName: (row.farm_name as string) ?? null,
        tankId: (row.tank_id as string) ?? null,
        createdAt: row.created_at as string,
        readAt: localPending?.readAt ?? (row.read_at as string) ?? null,
        readSyncStatus: localPending ? 'pending' : 'synced',
      };
    });

    await db.alerts.clear();
    await db.alerts.bulkAdd(alerts);
  } catch (err) {
    console.warn('Failed to fetch alerts from Supabase, using cached data:', err);
  }
}

export async function markAlertRead(alertId: string) {
  const now = new Date().toISOString();

  // Optimistic local update
  await db.alerts.update(alertId, { readAt: now, readSyncStatus: 'pending' });

  // Push to Supabase
  if (supabase) {
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ read_at: now })
        .eq('id', alertId);
      if (error) throw error;
      await db.alerts.update(alertId, { readSyncStatus: 'synced' });
    } catch (err) {
      console.warn('Failed to push read state to Supabase:', err);
    }
  }
}

export function useAlerts() {
  const alerts = useLiveQuery(
    () => db.alerts.orderBy('createdAt').reverse().toArray(),
    [],
  );

  useEffect(() => {
    fetchAndCacheAlerts();
  }, []);

  return alerts ?? [];
}

export function useUnreadAlertCount() {
  const count = useLiveQuery(
    () => db.alerts.filter((a) => a.readAt === null).count(),
    [],
  );
  return count ?? 0;
}
