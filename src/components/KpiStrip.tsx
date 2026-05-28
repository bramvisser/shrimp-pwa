import { useTranslation } from 'react-i18next';

const HARVEST_WEIGHT_G = 25;
const PRICE_PER_KG = 8;
const COST_PER_KG = 4.5;

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function formatKg(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}t`;
  return `${Math.round(value)}kg`;
}

export function KpiStrip({
  totalAnimals,
  averageWeight,
}: {
  totalAnimals: number;
  averageWeight: number;
}) {
  const { t } = useTranslation();
  const currentBiomassKg = (totalAnimals * averageWeight) / 1000;
  const harvestBiomassKg = (totalAnimals * HARVEST_WEIGHT_G) / 1000;
  const salesForecast = harvestBiomassKg * PRICE_PER_KG;
  const costs = currentBiomassKg * COST_PER_KG;

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      <KpiCard
        label={t('kpiProduction')}
        value={formatKg(currentBiomassKg)}
        sublabel={t('kpiProductionSub')}
        accent="emerald"
      />
      <KpiCard
        label={t('kpiSalesForecast')}
        value={formatCurrency(salesForecast)}
        sublabel={t('kpiSalesForecastSub')}
        accent="indigo"
      />
      <KpiCard
        label={t('kpiCosts')}
        value={formatCurrency(costs)}
        sublabel={t('kpiCostsSub')}
        accent="rose"
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent: 'emerald' | 'indigo' | 'rose';
}) {
  const accentMap = {
    emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
    rose: 'bg-gradient-to-br from-rose-500 to-rose-600',
  };

  return (
    <div
      className={`min-w-[8.5rem] flex-1 rounded-lg p-3 text-white shadow ${accentMap[accent]}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold leading-tight">{value}</p>
      <p className="mt-0.5 text-[10px] opacity-75">{sublabel}</p>
    </div>
  );
}
