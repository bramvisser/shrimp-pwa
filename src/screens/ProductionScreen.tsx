import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppTopBar } from '../components/AppTopBar';
import { KpiStrip } from '../components/KpiStrip';
import { HARVEST_WEIGHT_G, PRICE_PER_KG, COST_PER_KG } from '../utils/production';
import { useFarms } from '../hooks/useFarms';
import { useDashboardData } from '../hooks/useDashboardData';

export function ProductionScreen() {
  const { t } = useTranslation();
  const farms = useFarms();
  const [selectedFarmSlug, setSelectedFarmSlug] = useState('');
  const effectiveFarmSlug =
    selectedFarmSlug || (farms.length > 0 ? farms[0].slug : undefined);

  const { summaryStats, isLoading, dataSource } = useDashboardData({
    farmSlug: effectiveFarmSlug,
    dateRange: 'last12w',
  });

  const hasData = !isLoading && dataSource !== 'empty';

  const legend = [
    { color: 'bg-emerald-500', label: t('kpiProduction'), body: t('productionExplainProduction') },
    { color: 'bg-indigo-500', label: t('kpiSalesForecast'), body: t('productionExplainSales') },
    { color: 'bg-rose-500', label: t('kpiCosts'), body: t('productionExplainCosts') },
    { color: 'bg-amber-500', label: t('kpiMargin'), body: t('productionExplainMargin') },
  ];

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />

      <div className="flex-1 overflow-y-auto overscroll-contain space-y-4 p-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{t('actionProduction')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('productionIntro')}</p>
        </div>

        {/* Farm selector */}
        <div>
          <label
            htmlFor="production-farm-select"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {t('selectFarm')}
          </label>
          <select
            id="production-farm-select"
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
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 flex-1 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        )}

        {!isLoading && dataSource === 'empty' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            {t('noDataForFarm')}
          </div>
        )}

        {hasData && (
          <>
            <KpiStrip
              totalAnimals={summaryStats.totalAnimals}
              averageWeight={summaryStats.averageWeight}
              showMargin
            />

            {/* Explanation: what each figure means */}
            <div className="rounded-lg bg-white p-4 shadow">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('productionHowTitle')}
              </h3>
              <ul className="space-y-2.5">
                {legend.map((item) => (
                  <li key={item.label} className="flex gap-2.5">
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`}
                    />
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-800">{item.label}</span>
                      {' — '}
                      {item.body}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-500">
                {t('productionAssumptions', {
                  harvest: HARVEST_WEIGHT_G,
                  price: PRICE_PER_KG.toFixed(2),
                  cost: COST_PER_KG.toFixed(2),
                })}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
