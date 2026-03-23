import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { AppTopBar } from '../components/AppTopBar';
import { useSyncStatus } from '../sync/useSyncStatus';
import { useOnlineStatus } from '../sync/useOnlineStatus';
import { syncAll, retryFailed } from '../sync/syncEngine';
import type { Measurement, Mortality } from '../db/database';

export function SyncStatusScreen() {
  const { t } = useTranslation();
  const [farmFilter, setFarmFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const isOnline = useOnlineStatus();
  const { pendingRecords, syncedRecords, failedRecords, pendingCount, syncedCount, failedCount } =
    useSyncStatus(farmFilter || undefined);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAll();
    } finally {
      setSyncing(false);
    }
  };

  const handleRetry = async () => {
    await retryFailed();
    await handleSync();
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 p-4">
        <h1 className="mb-3 text-lg font-bold text-gray-800">{t('syncStatusTitle')}</h1>

        <input
          type="text"
          placeholder={t('farmId')}
          value={farmFilter}
          onChange={(e) => setFarmFilter(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <div className="mb-4 flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing || !isOnline}
            className="flex-1 rounded-lg bg-blue-500 py-2 font-semibold text-white disabled:opacity-50"
          >
            {syncing ? '...' : t('syncNow')}
          </button>
          {failedCount > 0 && (
            <button
              onClick={handleRetry}
              className="flex-1 rounded-lg bg-orange-500 py-2 font-semibold text-white"
            >
              {t('retryFailed')} ({failedCount})
            </button>
          )}
        </div>

        {!isOnline && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {t('offline')}
          </div>
        )}

        <Section
          title={t('pending')}
          count={pendingCount}
          color="orange"
          records={pendingRecords}
          t={t}
        />
        {failedCount > 0 && (
          <Section
            title={t('failed')}
            count={failedCount}
            color="red"
            records={failedRecords}
            t={t}
          />
        )}
        <Section
          title={t('synced')}
          count={syncedCount}
          color="green"
          records={syncedRecords}
          t={t}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  color,
  records,
  t,
}: {
  title: string;
  count: number;
  color: 'orange' | 'green' | 'red';
  records: (Measurement | Mortality)[];
  t: (key: string) => string;
}) {
  const colorClasses = {
    orange: 'bg-orange-100 text-orange-800',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
  };

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-600">{title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClasses[color]}`}>
          {count}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-gray-400">{t('noRecords')}</p>
      ) : (
        <div className="space-y-2">
          {records.slice(0, 50).map((record) => (
            <RecordItem key={record.id} record={record} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordItem({
  record,
  t,
}: {
  record: Measurement | Mortality;
  t: (key: string) => string;
}) {
  const isMeasurement = 'weightGrams' in record;
  const detail = isMeasurement
    ? `${(record as Measurement).weightGrams}g`
    : (record as Mortality).cause;

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800">
          {isMeasurement ? t('measurement') : t('mortality')} — {detail}
        </span>
        <span className="text-xs text-gray-400">
          {format(new Date(record.createdAt), 'HH:mm dd/MM')}
        </span>
      </div>
      <p className="text-xs text-gray-500">
        {record.farmId}
        {record.tankId ? ` / ${record.tankId}` : ''}
      </p>
    </div>
  );
}
