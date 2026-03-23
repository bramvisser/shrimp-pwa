import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AppTopBar } from '../components/AppTopBar';
import { db, type MortalityCause } from '../db/database';
import { useOperator } from '../hooks/useOperator';
import { useFarms } from '../hooks/useFarms';

const CAUSE_KEYS: MortalityCause[] = ['unknown', 'disease', 'handling', 'water', 'other'];

const CAUSE_I18N: Record<MortalityCause, string> = {
  unknown: 'causeUnknown',
  disease: 'causeDisease',
  handling: 'causeHandling',
  water: 'causeWaterQuality',
  other: 'causeOther',
};

export function MortalityScreen() {
  const { t } = useTranslation();
  const { name: operatorName } = useOperator();

  const farms = useFarms();
  const [farmId, setFarmId] = useState('');
  const [tankId, setTankId] = useState('');
  const [rfidTag, setRfidTag] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [cause, setCause] = useState<MortalityCause>('unknown');
  const [remarks, setRemarks] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; success: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!farmId.trim()) errs.farmId = t('farmRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    setStatus(null);

    try {
      await db.mortalities.add({
        id: crypto.randomUUID(),
        farmId: farmId.trim(),
        tankId: tankId.trim() || undefined,
        rfidTag: rfidTag.trim() || undefined,
        animalId: animalId.trim() || undefined,
        cause,
        remarks: remarks.trim() || undefined,
        operatorName: operatorName || '',
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
        syncAttempts: 0,
      });

      setStatus({ message: t('saveMortalitySuccess'), success: true });
      setRemarks('');
    } catch {
      setStatus({ message: t('saveError'), success: false });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppTopBar />

      <form onSubmit={handleSave} className="flex-1 space-y-3 p-4">
        <h1 className="mb-2 text-lg font-bold text-gray-800">{t('mortalityScreenTitle')}</h1>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('farmId')}</label>
          <select
            value={farmId}
            onChange={(e) => setFarmId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{t('selectFarm')}</option>
            {farms.map((farm) => (
              <option key={farm.id} value={farm.slug}>{farm.name}</option>
            ))}
          </select>
          {errors.farmId && <p className="mt-1 text-sm text-red-500">{errors.farmId}</p>}
        </div>
        <Field label={t('tankId')} value={tankId} onChange={setTankId} />
        <Field label={t('rfidTag')} value={rfidTag} onChange={setRfidTag} />
        <Field label={t('animalId')} value={animalId} onChange={setAnimalId} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('cause')}</label>
          <select
            value={cause}
            onChange={(e) => setCause(e.target.value as MortalityCause)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CAUSE_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(CAUSE_I18N[key])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('remarks')}</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {isSaving ? '...' : t('saveMortality')}
        </button>

        {status && (
          <p className={`text-center text-sm ${status.success ? 'text-green-600' : 'text-red-500'}`}>
            {status.message}
          </p>
        )}
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
