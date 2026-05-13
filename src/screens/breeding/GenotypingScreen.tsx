import { useEffect, useMemo, useState } from 'react';
import { AppTopBar } from '../../components/AppTopBar';
import { db } from '../../db/database';
import { useAnimals, useGenotypeAction, useGenotypeQC } from '../../breeding/hooks';
import { useLiveQuery } from 'dexie-react-hooks';

export function GenotypingScreen() {
  const animals = useAnimals();
  const panel = useLiveQuery(() => db.snpPanels.toCollection().first());
  const genotypedIds = useLiveQuery(async () => {
    const set = new Set<string>();
    for (const g of await db.genotypes.toArray()) set.add(g.animalId);
    return set;
  }, [], new Set<string>());
  const qc = useGenotypeQC(panel?.id ?? null);
  const genotype = useGenotypeAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  const ungenotyped = useMemo(() => {
    if (!animals) return [];
    return animals
      .filter((a) => !genotypedIds.has(a.id))
      .sort((a, b) => b.generation - a.generation || a.id.localeCompare(b.id));
  }, [animals, genotypedIds]);

  const handleGenotype = async (id: string) => {
    if (!panel) return;
    setBusyId(id);
    try {
      await genotype(id, panel.id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-2 text-lg font-bold">Genotyping</h1>

        {panel && (
          <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">SNP panel</div>
            <div className="mt-1 text-sm font-semibold">{panel.name}</div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-gray-600">
              <div>Markers <span className="font-mono">{panel.density.toLocaleString()}</span></div>
              <div>Chrs <span className="font-mono">{panel.chrCount}</span></div>
              <div>Genotyped <span className="font-mono">{genotypedIds.size}</span></div>
            </div>
          </div>
        )}

        {qc && qc.nSamples > 0 && (
          <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Panel QC</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <Stat label="Samples" value={qc.nSamples.toString()} />
              <Stat label="Mean call rate" value={(qc.meanCallRate * 100).toFixed(1) + '%'} />
              <Stat label="HWE flagged" value={qc.hweFlagged.toString()} />
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-500">MAF distribution</div>
              <div className="flex h-16 items-end gap-1">
                {qc.mafBins.map((c, i) => {
                  const max = Math.max(...qc.mafBins, 1);
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-blue-400"
                      style={{ height: `${(c / max) * 100}%` }}
                      title={`bin ${i}: ${c}`}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-gray-500">
                <span>0</span><span>0.25</span><span>0.5</span>
              </div>
            </div>
          </div>
        )}

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Awaiting genotyping ({ungenotyped.length})
        </h2>
        <div className="rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Gen</th>
                <th className="px-3 py-2 text-left">Sex</th>
                <th className="px-3 py-2 text-left">Family</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {ungenotyped.slice(0, 50).map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 font-mono text-xs">{a.id}</td>
                  <td className="px-3 py-1.5">G{a.generation}</td>
                  <td className="px-3 py-1.5">{a.sex}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500">{a.familyId ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      disabled={busyId === a.id || !panel}
                      onClick={() => handleGenotype(a.id)}
                      className="rounded-md bg-blue-500 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {busyId === a.id ? 'Calling…' : 'Genotype'}
                    </button>
                  </td>
                </tr>
              ))}
              {ungenotyped.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-xs text-gray-500">All on-file animals are genotyped.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
          Genotyping simulates a tissue clip → plate → BeadChip call. Mendelian inheritance from
          recorded parents is applied; otherwise allele frequencies from the panel are used to
          draw a founder-like genotype.
        </p>
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

// Hook reference required for static import order in some bundlers — keeps
// dexie-react-hooks tree-shakeable.
void useEffect;
