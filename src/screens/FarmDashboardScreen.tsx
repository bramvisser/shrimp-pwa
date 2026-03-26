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
import { DashboardFilters } from '../components/DashboardFilters';
import { useFarms } from '../hooks/useFarms';
import { useDashboardData } from '../hooks/useDashboardData';
import type { DateRangeOption } from '../hooks/useDashboardData';
import { getTankColor } from '../utils/tankColors';

export function FarmDashboardScreen() {
  const { t } = useTranslation();
  const farms = useFarms();
  const [selectedFarmSlug, setSelectedFarmSlug] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRangeOption>('last12w');
  const [selectedTanks, setSelectedTanks] = useState<string[]>([]);

  // Use the first farm as default once farms are loaded
  const effectiveFarmSlug = selectedFarmSlug || (farms.length > 0 ? farms[0].slug : undefined);

  const { growthData, mortalityData, summaryStats, tankIds, availableTanks, isLoading, dataSource } =
    useDashboardData({ farmSlug: effectiveFarmSlug, dateRange, selectedTanks });

  // Reset tank filter when switching farms
  function handleFarmChange(slug: string) {
    setSelectedFarmSlug(slug);
    setSelectedTanks([]);
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 space-y-4 p-4">
        {/* Farm selector */}
        <div>
          <label
            htmlFor="farm-select"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {t('selectFarm')}
          </label>
          <select
            id="farm-select"
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

        {/* Filters */}
        <DashboardFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          availableTanks={availableTanks}
          selectedTanks={selectedTanks}
          onSelectedTanksChange={setSelectedTanks}
        />

        {/* Data source indicator */}
        {dataSource === 'empty' && !isLoading && (
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
            {t('noDataForFarm')}
          </div>
        )}

        {dataSource === 'local' && !isLoading && (
          <div className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            {t('showingLocalData')}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-200" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
          </div>
        )}

        {!isLoading && dataSource !== 'empty' && (
          <>
            {/* Summary stat cards - 2x2 grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={t('totalAnimals')}
                value={summaryStats.totalAnimals.toLocaleString()}
                color="blue"
              />
              <StatCard
                label={t('avgWeight')}
                value={`${summaryStats.averageWeight}g`}
                color="green"
              />
              <StatCard
                label={t('survivalRate')}
                value={`${summaryStats.survivalRate}%`}
                color="yellow"
              />
              <StatCard
                label={t('bestTank')}
                value={summaryStats.bestTank}
                color="blue"
              />
            </div>

            {/* Growth curve line chart */}
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
                    {tankIds.map((tankId) => (
                      <Line
                        key={tankId}
                        type="monotone"
                        dataKey={tankId}
                        stroke={getTankColor(availableTanks.indexOf(tankId))}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Mortality bar chart */}
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
                    {tankIds.map((tankId, index) => (
                      <Bar
                        key={tankId}
                        dataKey={tankId}
                        stackId="mortality"
                        fill={getTankColor(availableTanks.indexOf(tankId))}
                        radius={
                          index === tankIds.length - 1
                            ? [2, 2, 0, 0]
                            : [0, 0, 0, 0]
                        }
                      />
                    ))}
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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'blue' | 'green' | 'yellow';
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };

  return (
    <div
      className={`rounded-lg border p-3 shadow-sm ${colorMap[color]}`}
    >
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
