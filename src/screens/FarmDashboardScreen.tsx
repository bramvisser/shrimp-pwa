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
import { growthData, mortalityData, summaryStats } from '../data/mockDashboardData';

const farms = [
  { id: 'farm-1', name: 'Bang Pla Farm' },
  { id: 'farm-2', name: 'Chanthaburi Farm' },
  { id: 'farm-3', name: 'Surat Thani Farm' },
];

const TANK_COLORS = {
  'TNK-A1': '#3b82f6', // blue-500
  'TNK-A2': '#22c55e', // green-500
  'TNK-B1': '#f59e0b', // amber-500
} as const;

export function FarmDashboardScreen() {
  const { t: _t } = useTranslation();
  const [selectedFarm, setSelectedFarm] = useState(farms[0].id);

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
            Select Farm
          </label>
          <select
            id="farm-select"
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
        </div>

        {/* Summary stat cards - 2x2 grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Total Animals"
            value={summaryStats.totalAnimals.toLocaleString()}
            color="blue"
          />
          <StatCard
            label="Avg Weight"
            value={`${summaryStats.averageWeight}g`}
            color="green"
          />
          <StatCard
            label="Survival Rate"
            value={`${summaryStats.survivalRate}%`}
            color="yellow"
          />
          <StatCard
            label="Best Tank"
            value={summaryStats.bestTank}
            color="blue"
          />
        </div>

        {/* Growth curve line chart */}
        <div className="rounded-lg bg-white p-4 shadow">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Growth Curve (Avg Weight)
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
                  dataKey="TNK-A1"
                  stroke={TANK_COLORS['TNK-A1']}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="TNK-A2"
                  stroke={TANK_COLORS['TNK-A2']}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="TNK-B1"
                  stroke={TANK_COLORS['TNK-B1']}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Mortality bar chart */}
        <div className="rounded-lg bg-white p-4 shadow">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Weekly Mortality
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
                  dataKey="TNK-A1"
                  stackId="mortality"
                  fill={TANK_COLORS['TNK-A1']}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="TNK-A2"
                  stackId="mortality"
                  fill={TANK_COLORS['TNK-A2']}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="TNK-B1"
                  stackId="mortality"
                  fill={TANK_COLORS['TNK-B1']}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
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
