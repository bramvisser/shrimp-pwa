import { useNavigate } from 'react-router-dom';
import {
  BeakerIcon,
  CalculatorIcon,
  ChartBarIcon,
  CpuChipIcon,
  DocumentTextIcon,
  RectangleGroupIcon,
  SparklesIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { AppTopBar } from '../../components/AppTopBar';
import { ActionCard } from '../../components/ActionCard';
import { useEnsureBreedingSeeded, useGenerationCounts, useGenotypeCount, useLines, useResetAndReseed } from '../../breeding/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';

export function BreedingHomeScreen() {
  const navigate = useNavigate();
  const { ready } = useEnsureBreedingSeeded();
  const lines = useLines() ?? [];
  const genCounts = useGenerationCounts();
  const genoCount = useGenotypeCount();
  const { reseed, busy: reseeding, progress } = useResetAndReseed();
  const populationStats = useLiveQuery(async () => {
    const totals = await db.animals.count();
    const aliveByStage = await Promise.all(
      ['juvenile', 'broodstock', 'pl', 'larva'].map((s) => db.animals.where('stage').equals(s).count()),
    );
    const alive = aliveByStage.reduce((a, b) => a + b, 0);
    return { totals, alive };
  });
  void ready;
  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 p-4 text-white shadow">
          <p className="text-sm opacity-80">Breeding program</p>
          <p className="text-lg font-bold">{lines.map((l) => l.name).join(' · ') || 'Initialising…'}</p>
          {populationStats && (
            <p className="mt-1 text-xs opacity-80">
              {populationStats.alive.toLocaleString()} alive of {populationStats.totals.toLocaleString()} on file ·
              {' '}{(genoCount ?? 0).toLocaleString()} genotyped
            </p>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Population</h2>
          <button
            disabled={reseeding}
            onClick={async () => {
              if (!confirm('Erase the current breeding population and re-seed at the configured scale (≈30k juveniles + 3k broodstock per line)? This takes ~30–60 seconds.')) return;
              await reseed();
            }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 disabled:opacity-60"
          >
            {reseeding ? 'Reseeding…' : 'Reset & re-seed'}
          </button>
        </div>
        {reseeding && progress && (
          <div className="mb-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">{progress}</div>
        )}
        <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-1 text-left">Generation</th>
                <th className="py-1 text-right">Animals</th>
                <th className="py-1 text-right">Genotyped</th>
                <th className="py-1 text-right">Broodstock</th>
              </tr>
            </thead>
            <tbody>
              {(genCounts ?? []).map(([gen, c]) => (
                <tr key={gen} className="border-t border-gray-100">
                  <td className="py-1.5">G{gen}</td>
                  <td className="py-1.5 text-right">{c.total.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{c.genotyped.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{c.broodstock.toLocaleString()}</td>
                </tr>
              ))}
              {(!genCounts || genCounts.length === 0) && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-xs text-gray-500">
                    Seeding population…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Engine</h2>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard
            icon={<RectangleGroupIcon className="h-8 w-8" />}
            title="Pedigree"
            subtitle="Animals & lineage"
            onClick={() => navigate('/breeding/pedigree')}
          />
          <ActionCard
            icon={<BeakerIcon className="h-8 w-8" />}
            title="Genotyping"
            subtitle="SNP intake & QC"
            onClick={() => navigate('/breeding/genotyping')}
          />
          <ActionCard
            icon={<CpuChipIcon className="h-8 w-8" />}
            title="Run BLUP"
            subtitle="PBLUP / ssGBLUP"
            onClick={() => navigate('/breeding/evaluate')}
          />
          <ActionCard
            icon={<SparklesIcon className="h-8 w-8" />}
            title="Instant GEBV"
            subtitle="< 1 ms per animal"
            onClick={() => navigate('/breeding/gebv')}
          />
          <ActionCard
            icon={<CalculatorIcon className="h-8 w-8" />}
            title="Selection & Mating"
            subtitle="Dark-farm planner"
            onClick={() => navigate('/breeding/selection')}
          />
          <ActionCard
            icon={<ChartBarIcon className="h-8 w-8" />}
            title="Genetic Progress"
            subtitle="ΔG by generation"
            onClick={() => navigate('/breeding/progress')}
          />
          <ActionCard
            icon={<DocumentTextIcon className="h-8 w-8" />}
            title="Program Profile"
            subtitle="Lines, traits, audit log"
            onClick={() => navigate('/breeding/program')}
          />
          <ActionCard
            icon={<TrophyIcon className="h-8 w-8" />}
            title="Breeding Game"
            subtitle="You vs AI vs Oracle"
            onClick={() => navigate('/breeding/game')}
          />
        </div>
      </div>
    </div>
  );
}
