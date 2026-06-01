import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppTopBar } from '../components/AppTopBar';
import { ProductionForecastCard } from '../components/ProductionForecastCard';
import { useFarms } from '../hooks/useFarms';
import { useDashboardData } from '../hooks/useDashboardData';

const HORIZON_OPTIONS = [4, 5, 6, 8];

export function ForecastScreen() {
  const { t } = useTranslation();
  const farms = useFarms();
  const [selectedFarmSlug, setSelectedFarmSlug] = useState('');
  const [growthPct, setGrowthPct] = useState(12);
  const [weeks, setWeeks] = useState(5);

  const effectiveFarmSlug =
    selectedFarmSlug || (farms.length > 0 ? farms[0].slug : undefined);

  const { summaryStats, isLoading, dataSource } = useDashboardData({
    farmSlug: effectiveFarmSlug,
    dateRange: 'last12w',
  });

  const hasData = !isLoading && dataSource !== 'empty';

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 p-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{t('forecastScreenTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('forecastIntro')}</p>
        </div>

        {/* Farm selector */}
        <div>
          <label
            htmlFor="forecast-farm-select"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {t('selectFarm')}
          </label>
          <select
            id="forecast-farm-select"
            value={effectiveFarmSlug ?? ''}
            onChange={(e) => setSelectedFarmSlug(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {farms.length === 0 && <option value="">{t('loadingFarms')}</option>}
            {farms.map((farm) => (
              <option key={farm.id} value={farm.slug}>
                {farm.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading && (
          <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
        )}

        {!isLoading && dataSource === 'empty' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            {t('noDataForFarm')}
          </div>
        )}

        {hasData && (
          <>
            {/* Scenario controls */}
            <div className="rounded-lg bg-white p-4 shadow">
              <div className="flex items-center justify-between">
                <label htmlFor="growth-rate" className="text-sm font-medium text-gray-700">
                  {t('forecastGrowthRateLabel')}
                </label>
                <span className="text-sm font-semibold text-emerald-600">{growthPct}%</span>
              </div>
              <input
                id="growth-rate"
                type="range"
                min={5}
                max={20}
                step={1}
                value={growthPct}
                onChange={(e) => setGrowthPct(Number(e.target.value))}
                className="mt-2 w-full accent-emerald-600"
              />

              <div className="mt-4 flex items-center justify-between">
                <label htmlFor="horizon" className="text-sm font-medium text-gray-700">
                  {t('forecastHorizonLabel')}
                </label>
                <select
                  id="horizon"
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {HORIZON_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {t('forecastWeeksOption', { count: w })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <ProductionForecastCard
              totalAnimals={summaryStats.totalAnimals}
              averageWeight={summaryStats.averageWeight}
              weeklyGrowthRate={growthPct / 100}
              weeks={weeks}
            />

            <p className="px-1 text-xs text-gray-500">
              {t('forecastCurrentBasis', {
                animals: summaryStats.totalAnimals.toLocaleString(),
                weight: summaryStats.averageWeight,
              })}
            </p>

            {/* Explanation: how the model works */}
            <div className="rounded-lg bg-white p-4 shadow">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('forecastHowTitle')}
              </h3>
              <p className="text-sm leading-relaxed text-gray-600">{t('forecastHowBody')}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
