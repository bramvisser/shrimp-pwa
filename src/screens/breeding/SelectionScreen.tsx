import { useState } from 'react';
import { AppTopBar } from '../../components/AppTopBar';
import { useProposeMatingPlan } from '../../breeding/hooks';
import type { MatingPlan, TraitCode } from '../../breeding/types';
import { TRAITS } from '../../breeding/simulator';
import { db } from '../../db/database';

export function SelectionScreen() {
  const propose = useProposeMatingPlan();
  const [weights, setWeights] = useState<Record<TraitCode, number>>(() => {
    const o: Record<TraitCode, number> = {} as Record<TraitCode, number>;
    for (const t of TRAITS) o[t.code] = t.economicWeight;
    return o;
  });
  const [inbreedingCeiling, setInbreedingCeiling] = useState(0.0625);
  const [nMatings, setNMatings] = useState(40);
  const [autonomous, setAutonomous] = useState(false);
  const [plan, setPlan] = useState<MatingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePropose = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await propose({
        generation: 4,
        weights,
        inbreedingCeiling,
        nMatings,
      });
      setPlan(p);
      if (autonomous) await approve(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const approve = async (p: MatingPlan) => {
    const approved: MatingPlan = {
      ...p,
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: autonomous ? 'system (dark-farm)' : (localStorage.getItem('operator_name') ?? 'operator'),
    };
    await db.matingPlans.put(approved);
    await db.decisionLog.put({
      id: `dec-${Date.now()}`,
      ts: new Date().toISOString(),
      kind: 'mating-plan',
      actor: approved.approvedBy ?? 'unknown',
      payload: approved,
      references: { planId: approved.id },
    });
    setPlan(approved);
  };

  const meanIndex = plan && plan.matings.length > 0
    ? plan.matings.reduce((s, m) => s + m.expectedIndex, 0) / plan.matings.length
    : 0;
  const meanF = plan && plan.matings.length > 0
    ? plan.matings.reduce((s, m) => s + m.expectedF, 0) / plan.matings.length
    : 0;

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-3 text-lg font-bold">Selection &amp; mating</h1>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-gray-500">Economic weights ($/unit)</h2>
          <div className="grid grid-cols-2 gap-3">
            {TRAITS.map((t) => (
              <div key={t.code}>
                <label className="text-xs text-gray-500">
                  {t.code}
                  <span className="text-[10px] text-gray-400"> · {t.unit}</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={weights[t.code]}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, [t.code]: Number(e.target.value) }))
                  }
                  className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Inbreeding ceiling F</label>
              <input
                type="number"
                step="0.005"
                value={inbreedingCeiling}
                onChange={(e) => setInbreedingCeiling(Number(e.target.value))}
                className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Mating slots</label>
              <input
                type="number"
                value={nMatings}
                onChange={(e) => setNMatings(Number(e.target.value))}
                className="mt-0.5 w-full rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autonomous}
                onChange={(e) => setAutonomous(e.target.checked)}
              />
              <span>Dark-farm autonomous mode (auto-approve)</span>
            </label>
          </div>
          <button
            disabled={busy}
            onClick={handlePropose}
            className="mt-4 w-full rounded-md bg-blue-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Optimising…' : 'Propose mating plan'}
          </button>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        {plan && (
          <div className="mt-4 rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500">Plan {plan.id}</div>
                <div className="text-sm font-semibold">{plan.matings.length} pairs · status {plan.status}</div>
              </div>
              {plan.status === 'proposed' && (
                <button
                  onClick={() => approve(plan)}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Approve
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
              <Stat label="Mean index" value={`$${meanIndex.toFixed(2)}`} />
              <Stat label="Mean F(o)" value={meanF.toFixed(4)} />
              <Stat label="Approved by" value={plan.approvedBy ?? '—'} />
            </div>
            <table className="mt-3 w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="py-1 text-left">Sire</th>
                  <th className="py-1 text-left">Dam</th>
                  <th className="py-1 text-right">Mid-index</th>
                  <th className="py-1 text-right">F(offspring)</th>
                </tr>
              </thead>
              <tbody>
                {plan.matings.map((m, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5 font-mono text-xs">{m.sireId}</td>
                    <td className="py-1.5 font-mono text-xs">{m.damId}</td>
                    <td className="py-1.5 text-right tabular-nums">${m.expectedIndex.toFixed(2)}</td>
                    <td className={`py-1.5 text-right tabular-nums ${m.expectedF > inbreedingCeiling * 0.5 ? 'text-amber-700' : ''}`}>
                      {m.expectedF.toFixed(4)}
                    </td>
                  </tr>
                ))}
                {plan.matings.length === 0 && (
                  <tr><td colSpan={4} className="p-3 text-center text-xs text-gray-500">No feasible pairs found — relax the constraints.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 p-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
