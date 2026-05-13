import { useMemo, useState } from 'react';
import { AppTopBar } from '../../components/AppTopBar';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { usePredictGEBV } from '../../breeding/hooks';
import type { TraitCode } from '../../breeding/types';

export function GEBVScreen() {
  const predict = usePredictGEBV();
  const animals = useLiveQuery(async () => {
    const all = await db.animals.toArray();
    return all.sort((a, b) => b.generation - a.generation || a.id.localeCompare(b.id));
  });
  const genotypedSet = useLiveQuery(async () => {
    const set = new Set<string>();
    for (const g of await db.genotypes.toArray()) set.add(g.animalId);
    return set;
  }, [], new Set<string>());
  const effectsCount = useLiveQuery(() => db.snpEffects.count());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<{
    rows: { trait: TraitCode; gebv: number; modelVersion: string; usedLine: string | null }[];
    ms: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const genotyped = useMemo(() => (animals ?? []).filter((a) => genotypedSet.has(a.id)).slice(0, 200), [animals, genotypedSet]);

  const handlePredict = async (id: string) => {
    setSelectedId(id);
    setError(null);
    try {
      const r = await predict(id);
      setResult({ rows: r.result, ms: r.ms });
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-2 text-lg font-bold">Instant GEBV</h1>
        <p className="mb-4 text-xs text-gray-600">
          For genotyped animals we compute (G)EBVs from stored SNP effects β̂ via a single dot product
          ĝ = (x − 2p)′ β̂. Fast enough that the dark-farm engine can rank thousands of candidates
          per second.
        </p>

        {effectsCount === 0 && (
          <div className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            No SNP effects on file yet. Run an ssGBLUP evaluation first.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Pick a genotyped animal</div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {genotyped.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => handlePredict(a.id)}
                      className={`cursor-pointer border-t border-gray-100 hover:bg-blue-50 ${
                        selectedId === a.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-2 py-1.5 font-mono text-xs">{a.id}</td>
                      <td className="px-2 py-1.5">G{a.generation}</td>
                      <td className="px-2 py-1.5">{a.sex}</td>
                      <td className="px-2 py-1.5 font-mono text-[11px] text-gray-500">{a.familyId ?? '—'}</td>
                    </tr>
                  ))}
                  {genotyped.length === 0 && (
                    <tr><td className="p-3 text-center text-xs text-gray-500">No genotyped animals.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl bg-white p-3 shadow-sm">
            <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">GEBV prediction</div>
            {!result && !error && <div className="text-xs text-gray-500">Tap an animal to predict.</div>}
            {error && <div className="text-xs text-red-600">{error}</div>}
            {result && (
              <>
                <div className="mb-3 rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">
                  <span className="font-semibold">{result.ms.toFixed(2)} ms</span> · {result.rows.length} traits ·
                  animal {selectedId}
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="py-1 text-left">Trait</th>
                      <th className="py-1 text-right">GEBV</th>
                      <th className="py-1 text-left">Line</th>
                      <th className="py-1 text-left">Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.trait} className="border-t border-gray-100">
                        <td className="py-1.5 font-medium">{r.trait}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {r.gebv >= 0 ? '+' : ''}
                          {r.gebv.toFixed(3)}
                        </td>
                        <td className="py-1.5 text-[11px]">{r.usedLine ?? 'pooled'}</td>
                        <td className="py-1.5 font-mono text-[11px] text-gray-500">{r.modelVersion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
