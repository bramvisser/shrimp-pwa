import { useMemo, useState } from 'react';
import { AppTopBar } from '../../components/AppTopBar';
import { useAnimals, useLines } from '../../breeding/hooks';
import type { Animal } from '../../breeding/types';

export function PedigreeScreen() {
  const lines = useLines() ?? [];
  const [lineId, setLineId] = useState<string | undefined>();
  const animals = useAnimals(lineId);
  const [generation, setGeneration] = useState<number | 'all'>('all');
  const [sex, setSex] = useState<'all' | 'M' | 'F'>('all');
  const [selected, setSelected] = useState<Animal | null>(null);
  const filtered = useMemo(() => {
    return (animals ?? [])
      .filter((a) => generation === 'all' || a.generation === generation)
      .filter((a) => sex === 'all' || a.sex === sex)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [animals, generation, sex]);
  const generations = useMemo(() => {
    const s = new Set<number>();
    (animals ?? []).forEach((a) => s.add(a.generation));
    return [...s].sort((a, b) => a - b);
  }, [animals]);
  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <AppTopBar />
      <div className="flex flex-col gap-3 p-4">
        <h1 className="text-lg font-bold">Pedigree explorer</h1>
        <div className="flex flex-wrap gap-2">
          <select
            value={lineId ?? ''}
            onChange={(e) => setLineId(e.target.value || undefined)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">All lines</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <select
            value={String(generation)}
            onChange={(e) => setGeneration(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">All generations</option>
            {generations.map((g) => (
              <option key={g} value={g}>G{g}</option>
            ))}
          </select>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as 'all' | 'M' | 'F')}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">Any sex</option>
            <option value="M">♂ Male</option>
            <option value="F">♀ Female</option>
          </select>
          <span className="ml-auto text-xs text-gray-500">{filtered.length} animals</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-gray-500 shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Sex</th>
                <th className="px-3 py-2 text-left">Gen</th>
                <th className="px-3 py-2 text-left">Family</th>
                <th className="px-3 py-2 text-left">Sire</th>
                <th className="px-3 py-2 text-left">Dam</th>
                <th className="px-3 py-2 text-right">F</th>
                <th className="px-3 py-2 text-left">Stage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="cursor-pointer border-t border-gray-100 hover:bg-blue-50"
                >
                  <td className="px-3 py-1.5 font-mono text-xs">{a.id}</td>
                  <td className="px-3 py-1.5">{a.sex === 'M' ? '♂' : '♀'}</td>
                  <td className="px-3 py-1.5">G{a.generation}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500">{a.familyId ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500">{a.sireId ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500">{a.damId ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{a.inbreeding != null ? a.inbreeding.toFixed(3) : '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{a.stage}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-xs text-gray-500">No animals match.</td></tr>
              )}
              {filtered.length > 500 && (
                <tr><td colSpan={8} className="p-2 text-center text-[11px] text-gray-400">Showing first 500 of {filtered.length}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <AnimalDrawer animal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AnimalDrawer({ animal, onClose }: { animal: Animal; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/30" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-2xl bg-white p-4 shadow-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <h2 className="text-lg font-bold">Animal {animal.id}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Field label="Line" value={animal.lineId} />
          <Field label="Generation" value={`G${animal.generation}`} />
          <Field label="Sex" value={animal.sex} />
          <Field label="Family" value={animal.familyId ?? '—'} />
          <Field label="Sire" value={animal.sireId ?? '—'} />
          <Field label="Dam" value={animal.damId ?? '—'} />
          <Field label="Stage" value={animal.stage} />
          <Field label="SPF status" value={animal.spfStatus} />
          <Field label="Tank" value={animal.tankId ?? '—'} />
          <Field label="Inbreeding F" value={animal.inbreeding != null ? animal.inbreeding.toFixed(4) : '—'} />
          <Field label="Born" value={animal.birthDate} />
        </dl>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-md bg-blue-500 py-2 text-sm font-medium text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
