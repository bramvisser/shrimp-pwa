import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraIcon } from '@heroicons/react/24/outline';
import { AppTopBar } from '../components/AppTopBar';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { db } from '../db/database';
import { useOperator } from '../hooks/useOperator';
import { useFarms } from '../hooks/useFarms';

export function MeasurementScreen() {
  const { t } = useTranslation();
  const { name: operatorName } = useOperator();

  const farms = useFarms();
  const [farmId, setFarmId] = useState('');
  const [tankId, setTankId] = useState('');
  const [rfidTag, setRfidTag] = useState('');
  const [barcode, setBarcode] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [weightGrams, setWeightGrams] = useState('');
  const [scannerTarget, setScannerTarget] = useState<'tankId' | 'barcode' | 'animalId' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; success: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!farmId.trim()) errs.farmId = t('farmRequired');
    if (!weightGrams.trim()) errs.weight = t('weightRequired');
    else {
      const parsed = parseFloat(weightGrams);
      if (isNaN(parsed) || parsed <= 0) errs.weight = t('weightInvalid');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    setStatus(null);

    try {
      await db.measurements.add({
        id: crypto.randomUUID(),
        farmId: farmId.trim(),
        tankId: tankId.trim() || undefined,
        rfidTag: rfidTag.trim() || undefined,
        barcode: barcode.trim() || undefined,
        animalId: animalId.trim() || undefined,
        weightGrams: parseFloat(weightGrams),
        operatorName: operatorName || '',
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
        syncAttempts: 0,
      });

      setStatus({ message: t('saveMeasurementSuccess'), success: true });
      setWeightGrams('');
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
        <h1 className="mb-2 text-lg font-bold text-gray-800">{t('weightScreenTitle')}</h1>

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
        <ScanField label={t('tankId')} value={tankId} onChange={setTankId} onScan={() => setScannerTarget('tankId')} />
        <Field label={t('rfidTag')} value={rfidTag} onChange={setRfidTag} />

        <ScanField label={t('barcode')} value={barcode} onChange={setBarcode} onScan={() => setScannerTarget('barcode')} />

        <ScanField label={t('animalId')} value={animalId} onChange={setAnimalId} onScan={() => setScannerTarget('animalId')} />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('weightGrams')}</label>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={weightGrams}
            onChange={(e) => {
              setWeightGrams(e.target.value);
              setErrors((prev) => ({ ...prev, weight: '' }));
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.weight && <p className="mt-1 text-sm text-red-500">{errors.weight}</p>}
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-500 py-3 font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {isSaving ? '...' : t('saveMeasurement')}
        </button>

        {status && (
          <p className={`text-center text-sm ${status.success ? 'text-green-600' : 'text-red-500'}`}>
            {status.message}
          </p>
        )}
      </form>

      {scannerTarget && (
        <BarcodeScannerModal
          onScan={(value) => {
            if (scannerTarget === 'tankId') setTankId(value);
            else if (scannerTarget === 'barcode') setBarcode(value);
            else if (scannerTarget === 'animalId') setAnimalId(value);
            setScannerTarget(null);
          }}
          onClose={() => setScannerTarget(null)}
        />
      )}
    </div>
  );
}

function ScanField({
  label,
  value,
  onChange,
  onScan,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onScan: () => void;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onScan}
          className="rounded-lg bg-gray-100 px-3 py-2 text-gray-600 hover:bg-gray-200"
        >
          <CameraIcon className="h-5 w-5" />
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
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
