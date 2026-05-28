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
const WEEKLY_GROWTH_RATE = 0.12;
const FORECAST_WEEKS = 5;

export function ProductionForecastCard({
  totalAnimals,
  averageWeight,
}: {
  totalAnimals: number;
  averageWeight: number;
}) {
  const { t } = useTranslation();

  const data = Array.from({ length: FORECAST_WEEKS }, (_, i) => {
    const week = i + 1;
    const projectedWeight =
      averageWeight * Math.pow(1 + WEEKLY_GROWTH_RATE, week);
    const tonnes = (totalAnimals * projectedWeight) / 1_000_000;
    return {
      label: `+${week}w`,
      tonnes: Math.round(tonnes * 100) / 100,
    };
  });

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t('productionForecast')}
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
              formatter={(value) => [`${Number(value).toFixed(2)} t`, t('tonnage')]}
            />
            <Bar dataKey="tonnes" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-gray-500">{t('forecastFootnote')}</p>
    </div>
  );
}
