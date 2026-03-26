import { supabase } from './supabaseClient';

export interface SupaMeasurementRow {
  tank_id: string | null;
  weight_grams: number;
  client_created_at: string;
}

export interface SupaMortalityRow {
  tank_id: string | null;
  cause: string;
  client_created_at: string;
}

export async function fetchMeasurementsFromSupabase(
  farmSlug: string,
  since?: Date,
): Promise<SupaMeasurementRow[] | null> {
  if (!supabase) return null;

  let query = supabase
    .from('measurements')
    .select('tank_id, weight_grams, client_created_at')
    .eq('farm_id', farmSlug)
    .order('client_created_at');

  if (since) {
    query = query.gte('client_created_at', since.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Failed to fetch measurements from Supabase:', error.message);
    return null;
  }

  return data as SupaMeasurementRow[];
}

export async function fetchMortalitiesFromSupabase(
  farmSlug: string,
  since?: Date,
): Promise<SupaMortalityRow[] | null> {
  if (!supabase) return null;

  let query = supabase
    .from('mortalities')
    .select('tank_id, cause, client_created_at')
    .eq('farm_id', farmSlug)
    .order('client_created_at');

  if (since) {
    query = query.gte('client_created_at', since.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    console.warn('Failed to fetch mortalities from Supabase:', error.message);
    return null;
  }

  return data as SupaMortalityRow[];
}
