import { useState } from 'react';
import { AppTopBar } from '../../components/AppTopBar';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { useLines, useRunEvaluation, type EvaluationProgress } from '../../breeding/hooks';
import type { TraitCode } from '../../breeding/types';

const TRAIT_CHOICES: { code: TraitCode; label: string }[] = [
  { code: 'HBW', label: 'Harvest body weight' },
  { code: 'WSSV', label: 'WSSV survival' },
  { code: 'AHPND', label: 'AHPND survival' },
  { code: 'SURV', label: 'Survival to harvest' },
  { code: 'YIELD', label: 'Meat yield' },
];

export function EvaluateScreen() {
  const { runEvaluation, running, lastError, progress } = useRunEvaluation();
  const lines = useLines() ?? [];
  const [trait, setTrait] = useState<TraitCode>('HBW');
  const [method, setMethod] = useState<'PBLUP' | 'ssGBLUP'>('ssGBLUP');
  const [lineId, setLineId] = useState<string>('');  // '' = all lines pooled
  const [last, setLast] = useState<{ id: string; durMs: number } | null>(null);
  const panel = useLiveQuery(() => db.snpPanels.toCollection().first());
  const runs = useLiveQuery(async () => {
    const r = await db.bvRuns.toArray();
    r.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    return r.slice(0, 12);
  });

  const handleRun = async () => {
    const t0 = performance.now();
    const r = await runEvaluation(trait, method, panel?.id, lineId || undefined);
    setLast({ id: r.id, durMs: performance.now() - t0 });
  };

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-3 text-lg font-bold">Run BLUP / ssGBLUP</h1>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <label className="mb-2 block text-xs uppercase tracking-wide text-gray-500">Trait</label>
          <select
            value={trait}
            onChange={(e) => setTrait(e.target.value as TraitCode)}
            className="mb-3 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
          >
            {TRAIT_CHOICES.map((t) => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>

          <label className="mb-2 block text-xs uppercase tracking-wide text-gray-500">Line</label>
          <select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className="mb-3 w-full rounded-md border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="">All lines (pooled)</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.id})</option>
            ))}
          </select>

          <label className="mb-2 block text-xs uppercase tracking-wide text-gray-500">Method</label>
          <div className="mb-4 flex gap-2">
            <MethodPill active={method === 'PBLUP'} onClick={() => setMethod('PBLUP')} title="PBLUP" subtitle="Pedigree only" />
            <MethodPill active={method === 'ssGBLUP'} onClick={() => setMethod('ssGBLUP')} title="ssGBLUP" subtitle="Single-step genomic" />
          </div>

          <button
            disabled={running}
            onClick={handleRun}
            className="w-full rounded-md bg-blue-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {running
              ? 'Solving MMEs in worker…'
              : `Run ${method} for ${trait}${lineId ? ` on ${lineId}` : ' (pooled)'}`}
          </button>

          {running && progress && <ProgressBar progress={progress} />}
          {lastError && <p className="mt-2 text-xs text-red-600">{lastError}</p>}
          {last && (
            <p className="mt-2 text-xs text-gray-600">
              Run <span className="font-mono">{last.id}</span> finished in {last.durMs.toFixed(0)} ms.
            </p>
          )}
        </div>

        <h2 className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent runs</h2>
        <div className="rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-left">Line</th>
                <th className="px-3 py-2 text-left">Trait</th>
                <th className="px-3 py-2 text-right">Animals</th>
                <th className="px-3 py-2 text-right">Genotyped</th>
                <th className="px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 text-xs">{(r.finishedAt ?? '').slice(0, 19).replace('T', ' ')}</td>
                  <td className="px-3 py-1.5">{r.method}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{r.lineId ?? 'pooled'}</td>
                  <td className="px-3 py-1.5">{r.trait}</td>
                  <td className="px-3 py-1.5 text-right">{r.nAnimals.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right">{r.nGenotyped.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-500">{r.notes}</td>
                </tr>
              ))}
              {(!runs || runs.length === 0) && (
                <tr><td colSpan={7} className="p-4 text-center text-xs text-gray-500">No runs yet — kick one off above.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
          ssGBLUP combines the pedigree relationship matrix A with the genomic G matrix into a single H matrix
          (Legarra et al., 2009). Heritability priors come from the literature. The solver uses a Jacobi-preconditioned
          conjugate gradient over the Henderson MMEs.
        </p>
      </div>
    </div>
  );
}

function ProgressBar({ progress }: { progress: EvaluationProgress }) {
  const pct = Math.round(progress.fraction * 100);
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-gray-700">{progress.label}</span>
        <span className="font-mono tabular-nums text-gray-500">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-blue-500 transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.detail && (
        <p className="mt-1 font-mono text-[11px] text-gray-500">{progress.detail}</p>
      )}
    </div>
  );
}

function MethodPill({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md border px-3 py-2 text-left transition ${
        active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[11px] text-gray-500">{subtitle}</div>
    </button>
  );
}
