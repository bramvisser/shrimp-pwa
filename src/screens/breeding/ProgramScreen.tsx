import { useMemo } from 'react';
import { AppTopBar } from '../../components/AppTopBar';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { TRAITS, GCORR } from '../../breeding/simulator';
import type { TraitCode } from '../../breeding/types';

const TRAIT_ORDER: TraitCode[] = ['HBW', 'TagW', 'EMS_SURV', 'EMS_DtD', 'OP'];

export function ProgramScreen() {
  const lines = useLiveQuery(() => db.lines.toArray()) ?? [];
  const decisions = useLiveQuery(async () => {
    const all = await db.decisionLog.toArray();
    all.sort((a, b) => b.ts.localeCompare(a.ts));
    return all.slice(0, 25);
  });
  const matingPlans = useLiveQuery(async () => {
    const all = await db.matingPlans.toArray();
    all.sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
    return all.slice(0, 10);
  });

  // Pivot the genetic-correlation list into a symmetric matrix for display.
  const gMatrix = useMemo(() => {
    const m: Record<TraitCode, Record<TraitCode, number>> = {} as Record<TraitCode, Record<TraitCode, number>>;
    for (const a of TRAIT_ORDER) {
      m[a] = {} as Record<TraitCode, number>;
      for (const b of TRAIT_ORDER) m[a][b] = a === b ? 1 : 0;
    }
    for (const c of GCORR) {
      m[c.a][c.b] = c.rg;
      m[c.b][c.a] = c.rg;
    }
    return m;
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-3 text-lg font-bold">Program profile</h1>

        <Section title="Lines">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-1 text-left">ID</th>
                <th className="py-1 text-left">Name</th>
                <th className="py-1 text-left">Kind</th>
                <th className="py-1 text-left">Pathogen focus</th>
                <th className="py-1 text-left">Founded</th>
                <th className="py-1 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="py-1.5 font-mono text-xs">{l.id}</td>
                  <td className="py-1.5">{l.name}</td>
                  <td className="py-1.5">{l.kind}</td>
                  <td className="py-1.5">{l.pathogenFocus ?? '—'}</td>
                  <td className="py-1.5 text-xs">{l.foundedAt}</td>
                  <td className="py-1.5 text-[11px] text-gray-500">{l.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Trait reference (BLUP priors)">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-1 text-left">Code</th>
                <th className="py-1 text-left">Name</th>
                <th className="py-1 text-left">Unit</th>
                <th className="py-1 text-right">h²</th>
                <th className="py-1 text-right">σ²ₐ</th>
                <th className="py-1 text-right">σ²ₑ</th>
                <th className="py-1 text-right">$/unit</th>
              </tr>
            </thead>
            <tbody>
              {TRAITS.map((t) => (
                <tr key={t.code} className="border-t border-gray-100">
                  <td className="py-1.5 font-mono text-xs">{t.code}</td>
                  <td className="py-1.5">{t.name}</td>
                  <td className="py-1.5 text-xs">{t.unit}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.heritability.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.geneticVariance}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.residualVariance}</td>
                  <td className="py-1.5 text-right tabular-nums">${t.economicWeight}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-500">
            Heritabilities and variance components are literature priors for <em>Penaeus vannamei</em>;
            economic weights are the demo defaults used by the selection index. Edit them on the
            Selection &amp; Mating screen.
          </p>
        </Section>

        <Section title="Genetic correlations">
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-xs text-gray-500"></th>
                  {TRAIT_ORDER.map((t) => (
                    <th key={t} className="px-2 py-1 text-center text-xs font-mono text-gray-500">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TRAIT_ORDER.map((a) => (
                  <tr key={a}>
                    <th className="px-2 py-1 text-left text-xs font-mono text-gray-500">{a}</th>
                    {TRAIT_ORDER.map((b) => {
                      const v = gMatrix[a][b];
                      const intensity = Math.min(1, Math.abs(v));
                      const bg = v >= 0
                        ? `rgba(34, 197, 94, ${intensity * 0.6})`
                        : `rgba(239, 68, 68, ${intensity * 0.6})`;
                      return (
                        <td
                          key={b}
                          className="px-2 py-1 text-center text-xs tabular-nums"
                          style={{ background: a === b ? '#e5e7eb' : bg }}
                        >
                          {v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Antagonism between growth and EMS resistance is the central tension of vannamei breeding —
            r<sub>g</sub>(HBW, EMS_SURV) ≈ −0.35. Selection-index economics decide
            which side of the trade-off gets weight; the Speed line leans growth-first, Strength leans EMS-first.
          </p>
        </Section>

        <Section title="Population structure (configured)">
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <Stat label="Generations modelled" value="6 (G0 founders + 5 historic + current)" />
            <Stat label="Founders / line" value="120 (60 ♂ + 60 ♀)" />
            <Stat label="Hatching tanks / gen" value="80 (one family per tank)" />
            <Stat label="Juveniles / family" value="375" />
            <Stat label="Juveniles / gen / line" value="30,000" />
            <Stat label="Adults retained / gen / line" value="3,000" />
            <Stat label="SNP panel" value="2,000 markers · 28 chr" />
            <Stat label="Genotyped on chip" value="adults only (~20% of selected)" />
            <Stat label="Selection intensity" value="≈10% (3k of 30k)" />
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Generation interval ≈ 12 months for vannamei. Effective population size in a closed nucleus
            of this design ≈ 50 (target ΔF &lt; 1%/gen).
          </p>
        </Section>

        <Section title="Recent autonomous decisions">
          {(!decisions || decisions.length === 0) && (
            <p className="text-xs text-gray-500">No decisions logged yet. Approve a mating plan on the Selection screen to populate the audit trail.</p>
          )}
          {decisions && decisions.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="py-1 text-left">When</th>
                  <th className="py-1 text-left">Kind</th>
                  <th className="py-1 text-left">Actor</th>
                  <th className="py-1 text-left">References</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="py-1.5 text-xs">{d.ts.slice(0, 19).replace('T', ' ')}</td>
                    <td className="py-1.5 text-xs">{d.kind}</td>
                    <td className="py-1.5 text-xs">{d.actor}</td>
                    <td className="py-1.5 font-mono text-[11px] text-gray-500">
                      {Object.entries(d.references ?? {}).map(([k, v]) => `${k}=${v}`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Mating plans">
          {(!matingPlans || matingPlans.length === 0) && (
            <p className="text-xs text-gray-500">No mating plans persisted yet.</p>
          )}
          {matingPlans && matingPlans.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="py-1 text-left">ID</th>
                  <th className="py-1 text-left">Status</th>
                  <th className="py-1 text-right">Pairs</th>
                  <th className="py-1 text-right">F ceiling</th>
                  <th className="py-1 text-left">Approved by</th>
                  <th className="py-1 text-left">Proposed</th>
                </tr>
              </thead>
              <tbody>
                {matingPlans.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="py-1.5 font-mono text-[11px]">{p.id}</td>
                    <td className="py-1.5 text-xs">{p.status}</td>
                    <td className="py-1.5 text-right">{p.matings.length}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.inputs.inbreedingCeiling.toFixed(4)}</td>
                    <td className="py-1.5 text-xs">{p.approvedBy ?? '—'}</td>
                    <td className="py-1.5 text-xs">{p.proposedAt.slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      <div className="rounded-xl bg-white p-3 shadow-sm">{children}</div>
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
