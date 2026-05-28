// Live list of tank IDs known to the app, derived from the union of tank IDs
// that appear in measurements and mortalities. The entry forms use this to
// power their tank-selector dropdowns; useLiveQuery so new tanks appear as
// records sync in.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';

export function useTanks(): string[] {
  const tanks = useLiveQuery(async () => {
    const set = new Set<string>();
    const ms = await db.measurements.toArray();
    for (const r of ms) if (r.tankId) set.add(r.tankId);
    const xs = await db.mortalities.toArray();
    for (const r of xs) if (r.tankId) set.add(r.tankId);
    return Array.from(set).sort();
  }, []);
  return tanks ?? [];
}
