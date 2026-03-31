import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';

export function useSyncStatus(farmFilter?: string) {
  const measurements = useLiveQuery(async () => {
    let query = db.measurements.toCollection();
    if (farmFilter) {
      query = db.measurements.where('farmId').equals(farmFilter);
    }
    return query.toArray();
  }, [farmFilter]);

  const mortalities = useLiveQuery(async () => {
    let query = db.mortalities.toCollection();
    if (farmFilter) {
      query = db.mortalities.where('farmId').equals(farmFilter);
    }
    return query.toArray();
  }, [farmFilter]);

  const allRecords = [...(measurements || []), ...(mortalities || [])];
  const byDateDesc = (a: { createdAt: string }, b: { createdAt: string }) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const pendingRecords = allRecords.filter((r) => r.syncStatus === 'pending').sort(byDateDesc);
  const syncedRecords = allRecords.filter((r) => r.syncStatus === 'synced').sort(byDateDesc);
  const failedRecords = allRecords.filter((r) => r.syncStatus === 'failed').sort(byDateDesc);

  return {
    measurements: measurements || [],
    mortalities: mortalities || [],
    allRecords,
    pendingRecords,
    syncedRecords,
    failedRecords,
    pendingCount: pendingRecords.length,
    syncedCount: syncedRecords.length,
    failedCount: failedRecords.length,
    totalCount: allRecords.length,
  };
}
