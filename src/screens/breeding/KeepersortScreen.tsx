// Keepersort decision screen — the centrepiece of the live breeding program.
//
// At "now" one batch per line sits in 'selection' status with EBVs back and
// candidates awaiting a decision. This screen lists those candidates, lets the
// operator select / deselect / cull individuals, and every action persists
// immediately so the candidate disappears from the pool (programStatus
// transitions to 'selected' | 'deselected' | 'culled' and a lifecycleEvents
// row is appended).
//
// No simulator-style "what if": every click changes the live state of the
// program.

import { useEffect, useMemo, useState } from 'react';
import { AppTopBar } from '../../components/AppTopBar';
import {
  useBatches,
  useBatchCandidates,
  useSelectAction,
} from '../../breeding/hooks';
import {
  ArrowUpRightIcon,
  CheckIcon,
  NoSymbolIcon,
  TrashIcon,
  HandRaisedIcon,
} from '@heroicons/react/24/outline';
import type { ProgramStatus } from '../../breeding/types';

export function KeepersortScreen() {
  const batches = useBatches();
  const keepersortBatches = useMemo(
    () => (batches ?? []).filter((b) => b.status === 'selection'),
    [batches],
  );
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeBatchId && keepersortBatches.length > 0) {
      setActiveBatchId(keepersortBatches[0].id);
    }
  }, [activeBatchId, keepersortBatches]);

  const candidates = useBatchCandidates(activeBatchId);
  const act = useSelectAction();
  const [actor, setActor] = useState<string>(() =>
    localStorage.getItem('operator') ?? 'operator',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const rows = candidates ?? [];
    let cand = 0;
    let sel = 0;
    let des = 0;
    let culled = 0;
    let mated = 0;
    for (const r of rows) {
      switch (r.animal.programStatus) {
        case 'candidate': cand++; break;
        case 'selected': sel++; break;
        case 'deselected': des++; break;
        case 'culled': culled++; break;
        case 'mated': mated++; break;
      }
    }
    return { total: rows.length, cand, sel, des, culled, mated };
  }, [candidates]);

  const onAct = async (animalId: string, to: ProgramStatus) => {
    setBusy(true);
    setError(null);
    try {
      await act(animalId, actor, to);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="text-base font-bold text-gray-900">Keepersort</h1>
        <p className="mb-3 text-xs text-gray-500">
          Live candidate review. Every decision moves the animal out of the candidate pool
          and is recorded in the audit log.
        </p>

        {keepersortBatches.length === 0 ? (
          <div className="rounded-lg bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
            No batches awaiting keepersort right now.
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {keepersortBatches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setActiveBatchId(b.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    activeBatchId === b.id
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {b.id}
                  <span className="ml-1 text-gray-400">·</span>
                  <span className="ml-1 text-gray-500">{b.lineId}</span>
                </button>
              ))}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 text-xs shadow-sm">
              <div>
                <span className="font-semibold text-gray-700">{stats.total}</span>
                <span className="ml-1 text-gray-500">candidates</span>
              </div>
              <div className="text-emerald-700">
                <CheckIcon className="inline h-3.5 w-3.5" /> {stats.sel} selected
              </div>
              <div className="text-amber-700">
                <NoSymbolIcon className="inline h-3.5 w-3.5" /> {stats.des} deselected
              </div>
              <div className="text-rose-700">
                <TrashIcon className="inline h-3.5 w-3.5" /> {stats.culled} culled
              </div>
              <div className="text-gray-500">
                <HandRaisedIcon className="inline h-3.5 w-3.5" /> {stats.cand} pending
              </div>
              <label className="ml-auto flex items-center gap-1.5 text-gray-600">
                Operator
                <input
                  className="rounded border border-gray-200 px-2 py-0.5 text-xs"
                  value={actor}
                  onChange={(e) => {
                    setActor(e.target.value);
                    localStorage.setItem('operator', e.target.value);
                  }}
                />
              </label>
            </div>

            {error && (
              <div className="mb-3 rounded-md bg-rose-50 p-2 text-xs text-rose-700">{error}</div>
            )}

            <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2 text-left">ID</th>
                    <th className="px-2 py-2 text-left">PIT-tag</th>
                    <th className="px-2 py-2 text-left">Sex</th>
                    <th className="px-2 py-2 text-right">TagW (g)</th>
                    <th className="px-2 py-2 text-left">Family</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-right">Decide</th>
                  </tr>
                </thead>
                <tbody>
                  {(candidates ?? []).slice(0, 200).map(({ animal, tagW }) => (
                    <tr key={animal.id} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 font-mono text-[11px] text-gray-700">{animal.id}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-gray-500">
                        {animal.pitTag ?? '—'}
                      </td>
                      <td className="px-2 py-1.5">{animal.sex}</td>
                      <td className="px-2 py-1.5 text-right">{tagW != null ? tagW.toFixed(2) : '—'}</td>
                      <td className="px-2 py-1.5 text-[10px] text-gray-500">{animal.familyId ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        <StatusPill status={animal.programStatus} />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {animal.programStatus === 'candidate' ? (
                          <div className="inline-flex gap-1">
                            <button
                              disabled={busy}
                              onClick={() => onAct(animal.id, 'selected')}
                              title="Select — moves to maturation tank"
                              className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <CheckIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => onAct(animal.id, 'deselected')}
                              title="Deselect — release to multiplier"
                              className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            >
                              <NoSymbolIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => onAct(animal.id, 'culled')}
                              title="Cull — remove from program"
                              className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <ArrowUpRightIcon className="ml-auto h-3 w-3 text-gray-300" />
                        )}
                      </td>
                    </tr>
                  ))}
                  {(candidates?.length ?? 0) > 200 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-3 text-center text-[10px] text-gray-500">
                        showing first 200 of {candidates?.length}
                      </td>
                    </tr>
                  )}
                  {candidates && candidates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-6 text-center text-gray-500">
                        no candidates
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ProgramStatus }) {
  const cls: Record<ProgramStatus, string> = {
    candidate: 'bg-gray-100 text-gray-700',
    selected: 'bg-emerald-50 text-emerald-700',
    deselected: 'bg-amber-50 text-amber-800',
    mated: 'bg-indigo-50 text-indigo-700',
    culled: 'bg-rose-50 text-rose-700',
    inactive: 'bg-gray-50 text-gray-400',
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls[status]}`}>
      {status}
    </span>
  );
}
