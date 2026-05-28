// Tank picker for entry forms: a dropdown populated from known tanks (union
// of measurement + mortality tank IDs) plus a camera button that opens the
// QR scanner. Scanned values that aren't in the list yet are surfaced as a
// transient option so the form can still submit them.

import { CameraIcon } from '@heroicons/react/24/outline';
import { useTanks } from '../hooks/useSelectedTank';

export function TankSelectField({
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
  const tanks = useTanks();
  // If the current value (e.g. from a fresh scan) isn't a known tank yet,
  // include it as an extra option so the <select> can display it.
  const options = value && !tanks.includes(value) ? [value, ...tanks] : tanks;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">—</option>
          {options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onScan}
          className="rounded-lg bg-gray-100 px-3 py-2 text-gray-600 hover:bg-gray-200"
          aria-label="Scan tank QR"
        >
          <CameraIcon className="h-5 w-5" />
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
