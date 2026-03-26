import { getTankColor } from '../utils/tankColors';
import type { DateRangeOption } from '../hooks/useDashboardData';

interface DashboardFiltersProps {
  dateRange: DateRangeOption;
  onDateRangeChange: (range: DateRangeOption) => void;
  availableTanks: string[];
  selectedTanks: string[];
  onSelectedTanksChange: (tanks: string[]) => void;
}

const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: 'last4w', label: '4w' },
  { value: 'last8w', label: '8w' },
  { value: 'last12w', label: '12w' },
  { value: 'all', label: 'All' },
];

export function DashboardFilters({
  dateRange,
  onDateRangeChange,
  availableTanks,
  selectedTanks,
  onSelectedTanksChange,
}: DashboardFiltersProps) {
  const allSelected = selectedTanks.length === 0;

  function toggleTank(tankId: string) {
    if (allSelected) {
      // First deselection: select everything except this tank
      onSelectedTanksChange(availableTanks.filter((t) => t !== tankId));
    } else if (selectedTanks.includes(tankId)) {
      const next = selectedTanks.filter((t) => t !== tankId);
      // If removing the last one, go back to "all selected"
      onSelectedTanksChange(next.length === 0 ? [] : next);
    } else {
      const next = [...selectedTanks, tankId];
      // If all are selected again, reset to empty (= all)
      onSelectedTanksChange(next.length === availableTanks.length ? [] : next);
    }
  }

  function isTankActive(tankId: string): boolean {
    return allSelected || selectedTanks.includes(tankId);
  }

  return (
    <div className="space-y-3">
      {/* Date range */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-500">Date Range</p>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onDateRangeChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                dateRange === opt.value
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tank selection */}
      {availableTanks.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500">Tanks</p>
            {!allSelected && (
              <button
                onClick={() => onSelectedTanksChange([])}
                className="text-xs text-blue-500 active:text-blue-700"
              >
                Show all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableTanks.map((tankId, index) => {
              const active = isTankActive(tankId);
              const color = getTankColor(index);
              return (
                <button
                  key={tankId}
                  onClick={() => toggleTank(tankId)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-gray-300 bg-white text-gray-700 shadow-sm'
                      : 'border-transparent bg-gray-100 text-gray-400'
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: active ? color : '#d1d5db',
                    }}
                  />
                  {tankId}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
