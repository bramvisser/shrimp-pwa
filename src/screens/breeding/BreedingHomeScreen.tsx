import { useNavigate } from 'react-router-dom';
import {
  BeakerIcon,
  CalculatorIcon,
  ChartBarIcon,
  CpuChipIcon,
  DocumentTextIcon,
  HandRaisedIcon,
  RectangleGroupIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { AppTopBar } from '../../components/AppTopBar';
import { ActionCard } from '../../components/ActionCard';
import {
  useActiveBatches,
  useEnsureBreedingSeeded,
  useGenerationCounts,
  useGenotypeCount,
  useLines,
  useResetAndReseed,
} from '../../breeding/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import type { Batch } from '../../breeding/types';

export function BreedingHomeScreen() {
  const navigate = useNavigate();
  const { ready } = useEnsureBreedingSeeded();
  const lines = useLines() ?? [];
  const genCounts = useGenerationCounts();
  const genoCount = useGenotypeCount();
  const { reseed, busy: reseeding, progress } = useResetAndReseed();
  const activeBatches = useActiveBatches();
  const populationStats = useLiveQuery(async () => {
    const totals = await db.animals.count();
    const aliveByStage = await Promise.all(
      ['juvenile', 'broodstock', 'pl', 'larva'].map((s) => db.animals.where('stage').equals(s).count()),
    );
    const alive = aliveByStage.reduce((a, b) => a + b, 0);
    return { totals, alive };
  });
  const pendingKeepersort = (activeBatches ?? []).filter((b) => b.status === 'selection').length;
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
              if (!confirm('Erase the current breeding population and re-seed the Speed + Strength program (5 historic years × 3 batches/year × 2 lines)?')) return;
              await reseed();
            }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 disabled:opacity-60"
          >
            {reseeding ? 'Reseeding…' : 'Reset & re-seed'}
          </button>
        </div>

        <ActiveBatchesPanel batches={activeBatches} onOpenKeepersort={() => navigate('/breeding/keepersort')} />
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
            icon={<HandRaisedIcon className="h-8 w-8" />}
            title={pendingKeepersort > 0 ? `Keepersort · ${pendingKeepersort}` : 'Keepersort'}
            subtitle="Live select / deselect"
            onClick={() => navigate('/breeding/keepersort')}
          />
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
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Active batches panel — shows live cohorts with their stage and the next
// pending action. Clicking a 'selection' batch jumps straight to keepersort.

function ActiveBatchesPanel({
  batches,
  onOpenKeepersort,
}: {
  batches: Batch[] | undefined;
  onOpenKeepersort: () => void;
}) {
  if (!batches) return null;
  if (batches.length === 0) {
    return (
      <div className="mb-4 rounded-xl bg-white p-3 text-xs text-gray-500 shadow-sm">
        No active batches in the program right now.
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Live batches
        </h3>
        <span className="text-[10px] text-gray-400">{batches.length} in progress</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {batches.map((b) => {
          const next = nextActionFor(b);
          const actionable = b.status === 'selection';
          return (
            <li key={b.id} className="flex items-center justify-between py-1.5 text-xs">
              <div className="flex flex-1 items-center gap-2">
                <span className="rounded bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-700">
                  {b.id}
                </span>
                <span className="text-gray-500">{b.lineId}</span>
                <BatchStatusBadge status={b.status} />
              </div>
              <button
                onClick={actionable ? onOpenKeepersort : undefined}
                disabled={!actionable}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  actionable
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'cursor-default text-gray-400'
                }`}
              >
                {next}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function nextActionFor(b: Batch): string {
  switch (b.status) {
    case 'selection': return 'Open keepersort';
    case 'family-tank': return 'Growing';
    case 'spawning': return 'Spawning now';
    case 'mating': return 'Mating';
    case 'tagged': return 'Awaiting EBVs';
    case 'larval': return 'Larval culture';
    case 'planned': return 'Planned';
    case 'completed': return 'Completed';
  }
}

function BatchStatusBadge({ status }: { status: Batch['status'] }) {
  const cls: Record<Batch['status'], string> = {
    planned: 'bg-gray-100 text-gray-600',
    spawning: 'bg-blue-100 text-blue-700',
    larval: 'bg-blue-50 text-blue-600',
    'family-tank': 'bg-cyan-50 text-cyan-700',
    tagged: 'bg-violet-50 text-violet-700',
    selection: 'bg-indigo-100 text-indigo-700',
    mating: 'bg-amber-50 text-amber-700',
    completed: 'bg-gray-50 text-gray-500',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls[status]}`}>
      {status}
    </span>
  );
}
