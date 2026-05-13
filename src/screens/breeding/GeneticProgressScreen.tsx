import { useMemo, useState } from 'react';
import { AppTopBar } from '../../components/AppTopBar';
import { useGeneticProgress } from '../../breeding/hooks';
import { TRAITS } from '../../breeding/simulator';
import type { TraitCode } from '../../breeding/types';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const LINE_COLORS: Record<string, string> = {
  'SPF-A': '#2563eb',
  'SPR-WSSV': '#16a34a',
};

export function GeneticProgressScreen() {
  const [trait, setTrait] = useState<TraitCode>('HBW');
  const progress = useGeneticProgress(trait);
  const traitDef = TRAITS.find((t) => t.code === trait);

  const chartData = useMemo(() => {
    if (!progress) return [];
    const byGen = new Map<number, Record<string, number | undefined>>();
    for (const p of progress.points) {
      const row = byGen.get(p.generation) ?? { generation: p.generation };
      row[p.line] = p.meanEBV;
      byGen.set(p.generation, row);
    }
    return [...byGen.values()].sort((a, b) => (a.generation as number) - (b.generation as number));
  }, [progress]);

  const lineKeys = useMemo(() => {
    const set = new Set<string>();
    progress?.points.forEach((p) => set.add(p.line));
    return [...set];
  }, [progress]);

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-3 text-lg font-bold">Genetic progress</h1>
        <div className="mb-3 flex flex-wrap gap-2">
          {TRAITS.map((t) => (
            <button
              key={t.code}
              onClick={() => setTrait(t.code)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                trait === t.code
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700 ring-1 ring-gray-200'
              }`}
            >
              {t.code}
            </button>
          ))}
        </div>

        {traitDef && (
          <div className="mb-3 rounded-md bg-white p-3 text-xs text-gray-600 shadow-sm">
            <span className="font-semibold">{traitDef.name}</span> ({traitDef.unit}) · h² = {traitDef.heritability.toFixed(2)} · σ²ₐ = {traitDef.geneticVariance}
          </div>
        )}

        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">
            Mean EBV by generation
          </div>
          <div className="h-72">
            {chartData.length === 0 && (
              <div className="flex h-full items-center justify-center text-xs text-gray-500">
                No EBV run yet for this trait — go to Run BLUP and trigger one.
              </div>
            )}
            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="generation" tickFormatter={(v) => 'G' + v} />
                  <YAxis tickFormatter={(v) => v.toFixed(2)} />
                  <Tooltip
                    formatter={(v) => (typeof v === 'number' ? v.toFixed(3) : String(v))}
                    labelFormatter={(v) => 'Generation ' + v}
                  />
                  <Legend />
                  {lineKeys.map((key) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={LINE_COLORS[key] ?? '#888'}
                      strokeWidth={2}
                      dot
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {progress && progress.points.length > 0 && (
          <div className="mt-3 rounded-xl bg-white p-3 shadow-sm">
            <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Per-generation means</div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="py-1 text-left">Line</th>
                  <th className="py-1 text-right">Gen</th>
                  <th className="py-1 text-right">N</th>
                  <th className="py-1 text-right">Mean EBV</th>
                  <th className="py-1 text-right">Mean accuracy</th>
                </tr>
              </thead>
              <tbody>
                {progress.points.map((p) => (
                  <tr key={`${p.line}-${p.generation}`} className="border-t border-gray-100">
                    <td className="py-1.5">{p.line}</td>
                    <td className="py-1.5 text-right">G{p.generation}</td>
                    <td className="py-1.5 text-right">{p.n}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.meanEBV.toFixed(3)}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.meanAccuracy.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-gray-500">
              Run uses {progress.run.method} on {progress.run.nAnimals} animals
              ({progress.run.nGenotyped} genotyped). The slope of these lines is the realised genetic gain in
              {' '}{traitDef?.unit ?? 'units'} per generation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
