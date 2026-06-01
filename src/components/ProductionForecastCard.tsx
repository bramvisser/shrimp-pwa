import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Typical white-leg shrimp grow-out rate during the 10-25g window.
export const WEEKLY_GROWTH_RATE = 0.12;
export const FORECAST_WEEKS = 5;

// Show enough precision that the growth curve stays readable at any scale
// (small grow-out ponds project well under a tonne).
function formatTonnes(value: number): string {
  return value >= 1 ? `${value.toFixed(2)} t` : `${value.toFixed(3)} t`;
}

export function ProductionForecastCard({
  totalAnimals,
  averageWeight,
  weeklyGrowthRate = WEEKLY_GROWTH_RATE,
  weeks = FORECAST_WEEKS,
}: {
  totalAnimals: number;
  averageWeight: number;
  weeklyGrowthRate?: number;
  weeks?: number;
}) {
  const { t } = useTranslation();

  const data = Array.from({ length: weeks }, (_, i) => {
    const week = i + 1;
    const projectedWeight =
      averageWeight * Math.pow(1 + weeklyGrowthRate, week);
    return {
      label: `+${week}w`,
      tonnes: (totalAnimals * projectedWeight) / 1_000_000,
    };
  });

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t('forecastProjectionTitle')}
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" unit="t" />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                fontSize: '12px',
              }}
              formatter={(value) => [formatTonnes(Number(value)), t('tonnage')]}
            />
            <Bar dataKey="tonnes" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        {t('forecastFootnote', { rate: Math.round(weeklyGrowthRate * 100) })}
      </p>
    </div>
  );
}
