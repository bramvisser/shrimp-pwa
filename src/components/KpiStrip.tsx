import { useTranslation } from 'react-i18next';
import {
  HARVEST_WEIGHT_G,
  PRICE_PER_KG,
  COST_PER_KG,
  formatCurrency,
  formatKg,
} from '../utils/production';

export function KpiStrip({
  totalAnimals,
  averageWeight,
  showMargin = false,
}: {
  totalAnimals: number;
  averageWeight: number;
  showMargin?: boolean;
}) {
  const { t } = useTranslation();
  const currentBiomassKg = (totalAnimals * averageWeight) / 1000;
  const harvestBiomassKg = (totalAnimals * HARVEST_WEIGHT_G) / 1000;
  const salesForecast = harvestBiomassKg * PRICE_PER_KG;
  const costs = currentBiomassKg * COST_PER_KG;
  const margin = salesForecast - costs;

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
      {showMargin && (
        <KpiCard
          label={t('kpiMargin')}
          value={formatCurrency(margin)}
          sublabel={t('kpiMarginSub')}
          accent="amber"
        />
      )}
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
  accent: 'emerald' | 'indigo' | 'rose' | 'amber';
}) {
  const accentMap = {
    emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
    rose: 'bg-gradient-to-br from-rose-500 to-rose-600',
    amber: 'bg-gradient-to-br from-amber-500 to-amber-600',
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
