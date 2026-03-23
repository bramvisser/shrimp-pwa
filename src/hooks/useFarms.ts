import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Farm } from '../db/database';
import { supabase } from '../services/supabaseClient';

async function fetchAndCacheFarms() {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('farms')
      .select('id, name, slug, location')
      .order('name');

    if (error) throw error;
    if (!data || data.length === 0) return;

    await db.farms.clear();
    await db.farms.bulkAdd(data as Farm[]);
  } catch (err) {
    console.warn('Failed to fetch farms from Supabase, using cached data:', err);
  }
}

export function useFarms() {
  const farms = useLiveQuery(() => db.farms.orderBy('name').toArray(), []);

  useEffect(() => {
    fetchAndCacheFarms();
  }, []);

  return farms || [];
}
