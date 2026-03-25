import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { AppTopBar } from '../components/AppTopBar';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
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
  const [photo, setPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; success: boolean } | null>(null);
  const [scannerTarget, setScannerTarget] = useState<'tankId' | 'animalId' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not supported')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoCapture = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      setPhoto(dataUrl);
    } catch {
      // silently ignore photo errors
    }
    // reset input so the same file can be re-selected
    e.target.value = '';
  };

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
        photo: photo || undefined,
        operatorName: operatorName || '',
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
        syncAttempts: 0,
      });

      setStatus({ message: t('saveMortalitySuccess'), success: true });
      setRemarks('');
      setPhoto(null);
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
        <ScanField label={t('tankId')} value={tankId} onChange={setTankId} onScan={() => setScannerTarget('tankId')} />
        <Field label={t('rfidTag')} value={rfidTag} onChange={setRfidTag} />
        <ScanField label={t('animalId')} value={animalId} onChange={setAnimalId} onScan={() => setScannerTarget('animalId')} />

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

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('photo')}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoCapture}
            className="hidden"
          />
          {photo ? (
            <div className="relative inline-block">
              <img
                src={photo}
                alt={t('photo')}
                className="h-[100px] w-[100px] rounded-lg object-cover border border-gray-300"
              />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <CameraIcon className="h-5 w-5" />
              {t('takePhoto')}
            </button>
          )}
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

      {scannerTarget && (
        <BarcodeScannerModal
          onScan={(value) => {
            if (scannerTarget === 'tankId') setTankId(value);
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
