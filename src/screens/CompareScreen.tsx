import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AppTopBar } from '../components/AppTopBar';
import { useFarms } from '../hooks/useFarms';
import { useTankComparison } from '../hooks/useTankComparison';
import type { DateRangeOption } from '../hooks/useDashboardData';
import { getTankColor } from '../utils/tankColors';

// ---------------------------------------------------------------------------
// Date range options (same as dashboard)
// ---------------------------------------------------------------------------

const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: 'last4w', label: '4w' },
  { value: 'last8w', label: '8w' },
  { value: 'last12w', label: '12w' },
  { value: 'all', label: 'All' },
];

// ---------------------------------------------------------------------------
// CompareScreen
// ---------------------------------------------------------------------------

export function CompareScreen() {
  const { t } = useTranslation();
  const farms = useFarms();

  const [selectedFarmSlug, setSelectedFarmSlug] = useState<string>('');
  const [tank1, setTank1] = useState<string>('');
  const [tank2, setTank2] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRangeOption>('last12w');

  const effectiveFarmSlug = selectedFarmSlug || (farms.length > 0 ? farms[0].slug : undefined);

  const {
    growthData,
    mortalityData,
    tank1Stats,
    tank2Stats,
    availableTanks,
    isLoading,
    dataSource,
  } = useTankComparison({
    farmSlug: effectiveFarmSlug,
    tank1: tank1 || undefined,
    tank2: tank2 || undefined,
    dateRange,
  });

  function handleFarmChange(slug: string) {
    setSelectedFarmSlug(slug);
    setTank1('');
    setTank2('');
  }

  const bothSelected = tank1 && tank2 && tank1 !== tank2;
  const sameTank = tank1 && tank2 && tank1 === tank2;

  // Consistent colors: Tank A always gets color 0, Tank B gets color 1
  const tank1Color = getTankColor(0);
  const tank2Color = getTankColor(1);

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 p-4">
        {/* Farm selector */}
        <div>
          <label
            htmlFor="compare-farm-select"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {t('selectFarm')}
          </label>
          <select
            id="compare-farm-select"
            value={effectiveFarmSlug ?? ''}
            onChange={(e) => handleFarmChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {farms.length === 0 && (
              <option value="">{t('loadingFarms')}</option>
            )}
            {farms.map((farm) => (
              <option key={farm.id} value={farm.slug}>
                {farm.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tank selectors - side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="tank-a-select"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: tank1Color }}
              />
              {t('tankA')}
            </label>
            <select
              id="tank-a-select"
              value={tank1}
              onChange={(e) => setTank1(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t('selectTankA')}</option>
              {availableTanks.map((tankId) => (
                <option key={tankId} value={tankId}>
                  {tankId}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="tank-b-select"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: tank2Color }}
              />
              {t('tankB')}
            </label>
            <select
              id="tank-b-select"
              value={tank2}
              onChange={(e) => setTank2(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{t('selectTankB')}</option>
              {availableTanks.map((tankId) => (
                <option key={tankId} value={tankId}>
                  {tankId}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date range pills */}
        <div className="flex gap-1.5">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                dateRange === opt.value
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Data source indicator */}
        {dataSource === 'local' && !isLoading && (
          <div className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            {t('showingLocalData')}
          </div>
        )}

        {/* Same tank warning */}
        {sameTank && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
            <svg
              className="h-3.5 w-3.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            {t('sameTankWarning')}
          </div>
        )}

        {/* Prompt to select tanks */}
        {!bothSelected && !sameTank && !isLoading && availableTanks.length > 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
            <svg
              className="mb-3 h-10 w-10 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
            <p className="text-sm text-gray-500">{t('selectTwoTanks')}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-200" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
          </div>
        )}

        {/* Comparison results */}
        {!isLoading && bothSelected && (
          <>
            {/* Delta stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <DeltaCard
                label={t('avgWeight')}
                value1={`${tank1Stats.avgWeight}g`}
                value2={`${tank2Stats.avgWeight}g`}
                delta={tank1Stats.avgWeight - tank2Stats.avgWeight}
                unit="g"
                tank1Label={tank1}
                tank2Label={tank2}
                tank1Color={tank1Color}
                tank2Color={tank2Color}
              />
              <DeltaCard
                label={t('survivalDelta')}
                value1={`${tank1Stats.survivalRate}%`}
                value2={`${tank2Stats.survivalRate}%`}
                delta={tank1Stats.survivalRate - tank2Stats.survivalRate}
                unit="%"
                tank1Label={tank1}
                tank2Label={tank2}
                tank1Color={tank1Color}
                tank2Color={tank2Color}
              />
              <DeltaCard
                label={t('totalAnimalsDelta')}
                value1={String(tank1Stats.totalAnimals)}
                value2={String(tank2Stats.totalAnimals)}
                delta={tank1Stats.totalAnimals - tank2Stats.totalAnimals}
                unit=""
                tank1Label={tank1}
                tank2Label={tank2}
                tank1Color={tank1Color}
                tank2Color={tank2Color}
              />
              <DeltaCard
                label={t('mortalityDelta')}
                value1={String(tank1Stats.mortalityCount)}
                value2={String(tank2Stats.mortalityCount)}
                delta={tank2Stats.mortalityCount - tank1Stats.mortalityCount}
                unit=""
                invertDelta
                tank1Label={tank1}
                tank2Label={tank2}
                tank1Color={tank1Color}
                tank2Color={tank2Color}
              />
            </div>

            {/* Growth curve overlay */}
            <div className="rounded-lg bg-white p-4 shadow">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('growthCurve')}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={growthData}
                    margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                      unit="g"
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                      }}
                      formatter={(value) => [`${value}g`]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey={tank1}
                      stroke={tank1Color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey={tank2}
                      stroke={tank2Color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Mortality comparison (grouped, not stacked) */}
            <div className="rounded-lg bg-white p-4 shadow">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('weeklyMortality')}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={mortalityData}
                    margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    />
                    <Bar
                      dataKey={tank1}
                      fill={tank1Color}
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey={tank2}
                      fill={tank2Color}
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeltaCard - shows two values and their difference with color coding
// ---------------------------------------------------------------------------

function DeltaCard({
  label,
  value1,
  value2,
  delta,
  unit,
  invertDelta = false,
  tank1Label,
  tank2Label,
  tank1Color,
  tank2Color,
}: {
  label: string;
  value1: string;
  value2: string;
  delta: number;
  unit: string;
  invertDelta?: boolean;
  tank1Label: string;
  tank2Label: string;
  tank1Color: string;
  tank2Color: string;
}) {
  const isPositive = invertDelta ? delta <= 0 : delta >= 0;
  const absDelta = Math.abs(Math.round(delta * 10) / 10);
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '=';
  const deltaColor = delta === 0
    ? 'text-gray-500'
    : isPositive
      ? 'text-green-600'
      : 'text-red-600';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: tank1Color }}
            />
            <span className="truncate text-gray-600">{tank1Label}</span>
          </span>
          <span className="font-semibold text-gray-900">{value1}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: tank2Color }}
            />
            <span className="truncate text-gray-600">{tank2Label}</span>
          </span>
          <span className="font-semibold text-gray-900">{value2}</span>
        </div>
      </div>
      <div className={`mt-1.5 text-xs font-bold ${deltaColor}`}>
        {arrow} {absDelta}{unit}
      </div>
    </div>
  );
}
