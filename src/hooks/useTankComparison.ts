import { useState, useEffect, useRef } from 'react';
import { db } from '../db/database';
import {
  fetchMeasurementsFromSupabase,
  fetchMortalitiesFromSupabase,
} from '../services/supabaseDashboardQueries';
import type { DateRangeOption } from './useDashboardData';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComparisonFilters {
  farmSlug?: string;
  tank1?: string;
  tank2?: string;
  dateRange?: DateRangeOption;
}

export interface ComparisonGrowthPoint {
  week: number;
  label: string;
  [tankId: string]: number | string;
}

export interface ComparisonMortalityPoint {
  week: number;
  label: string;
  [tankId: string]: number | string;
}

export interface TankStats {
  totalAnimals: number;
  avgWeight: number;
  survivalRate: number;
  mortalityCount: number;
}

export interface ComparisonData {
  growthData: ComparisonGrowthPoint[];
  mortalityData: ComparisonMortalityPoint[];
  tank1Stats: TankStats;
  tank2Stats: TankStats;
  availableTanks: string[];
  isLoading: boolean;
  dataSource: 'supabase' | 'local' | 'empty';
}

// ---------------------------------------------------------------------------
// Internal row types
// ---------------------------------------------------------------------------

interface RawMeasurement {
  tankId: string;
  weightGrams: number;
  createdAt: string;
}

interface RawMortality {
  tankId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers (mirrors useDashboardData logic)
// ---------------------------------------------------------------------------

function getISOWeekKey(dateStr: string): { weekNum: number; label: string } {
  const date = new Date(dateStr);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { weekNum: year * 100 + week, label: `Wk ${week}` };
}

function dateRangeToSince(range?: DateRangeOption): Date | undefined {
  if (!range || range === 'all') return undefined;
  const weeks = { last4w: 4, last8w: 8, last12w: 12 }[range];
  return new Date(Date.now() - weeks * 7 * 86400000);
}

// ---------------------------------------------------------------------------
// Aggregation for two specific tanks
// ---------------------------------------------------------------------------

function computeTankStats(
  measurements: RawMeasurement[],
  mortalities: RawMortality[],
): TankStats {
  const totalAnimals = measurements.length;
  const mortalityCount = mortalities.length;

  // Average weight from latest week
  const weekWeights = new Map<number, { sum: number; count: number }>();
  for (const m of measurements) {
    const { weekNum } = getISOWeekKey(m.createdAt);
    if (!weekWeights.has(weekNum)) weekWeights.set(weekNum, { sum: 0, count: 0 });
    const entry = weekWeights.get(weekNum)!;
    entry.sum += m.weightGrams;
    entry.count += 1;
  }

  let avgWeight = 0;
  const sortedWeeks = Array.from(weekWeights.keys()).sort((a, b) => a - b);
  if (sortedWeeks.length > 0) {
    const latest = weekWeights.get(sortedWeeks[sortedWeeks.length - 1])!;
    avgWeight = Math.round((latest.sum / latest.count) * 10) / 10;
  }

  const total = totalAnimals + mortalityCount;
  const survivalRate = total > 0
    ? Math.round((totalAnimals / total) * 1000) / 10
    : 100;

  return { totalAnimals, avgWeight, survivalRate, mortalityCount };
}

function computeComparisonCharts(
  measurements: RawMeasurement[],
  mortalities: RawMortality[],
  tank1: string,
  tank2: string,
): { growthData: ComparisonGrowthPoint[]; mortalityData: ComparisonMortalityPoint[] } {
  const tanks = [tank1, tank2];

  // --- Growth: group by week + tank, average weight ---
  const growthMap = new Map<
    number,
    { label: string; tanks: Map<string, { sum: number; count: number }> }
  >();

  for (const m of measurements) {
    if (!tanks.includes(m.tankId)) continue;
    const { weekNum, label } = getISOWeekKey(m.createdAt);
    if (!growthMap.has(weekNum)) {
      growthMap.set(weekNum, { label, tanks: new Map() });
    }
    const weekEntry = growthMap.get(weekNum)!;
    if (!weekEntry.tanks.has(m.tankId)) {
      weekEntry.tanks.set(m.tankId, { sum: 0, count: 0 });
    }
    const tankEntry = weekEntry.tanks.get(m.tankId)!;
    tankEntry.sum += m.weightGrams;
    tankEntry.count += 1;
  }

  const growthData: ComparisonGrowthPoint[] = Array.from(growthMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([weekNum, { label, tanks: tankMap }]) => {
      const point: ComparisonGrowthPoint = { week: weekNum, label };
      for (const tankId of tanks) {
        const entry = tankMap.get(tankId);
        point[tankId] = entry ? Math.round((entry.sum / entry.count) * 10) / 10 : 0;
      }
      return point;
    });

  // --- Mortality: group by week + tank, count ---
  const mortalityMap = new Map<number, { label: string; tanks: Map<string, number> }>();

  for (const m of mortalities) {
    if (!tanks.includes(m.tankId)) continue;
    const { weekNum, label } = getISOWeekKey(m.createdAt);
    if (!mortalityMap.has(weekNum)) {
      mortalityMap.set(weekNum, { label, tanks: new Map() });
    }
    const weekEntry = mortalityMap.get(weekNum)!;
    weekEntry.tanks.set(m.tankId, (weekEntry.tanks.get(m.tankId) || 0) + 1);
  }

  // Union of all weeks from both datasets
  const allWeeks = new Set([...growthMap.keys(), ...mortalityMap.keys()]);
  const mortalityData: ComparisonMortalityPoint[] = Array.from(allWeeks)
    .sort((a, b) => a - b)
    .map((weekNum) => {
      const entry = mortalityMap.get(weekNum);
      const growthEntry = growthMap.get(weekNum);
      const label = entry?.label || growthEntry?.label || `Wk ${weekNum}`;
      const point: ComparisonMortalityPoint = { week: weekNum, label };
      for (const tankId of tanks) {
        point[tankId] = entry?.tanks.get(tankId) || 0;
      }
      return point;
    });

  return { growthData, mortalityData };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const EMPTY_STATS: TankStats = { totalAnimals: 0, avgWeight: 0, survivalRate: 100, mortalityCount: 0 };

const EMPTY: ComparisonData = {
  growthData: [],
  mortalityData: [],
  tank1Stats: EMPTY_STATS,
  tank2Stats: EMPTY_STATS,
  availableTanks: [],
  isLoading: false,
  dataSource: 'empty',
};

export function useTankComparison(filters: ComparisonFilters): ComparisonData {
  const [data, setData] = useState<ComparisonData>(EMPTY);
  const reqIdRef = useRef(0);

  const { farmSlug, tank1, tank2, dateRange } = filters;

  useEffect(() => {
    if (!farmSlug) {
      setData({ ...EMPTY });
      return;
    }

    const reqId = ++reqIdRef.current;
    setData((prev) => ({ ...prev, isLoading: true }));

    const since = dateRangeToSince(dateRange);

    (async () => {
      // --- Try Supabase first ---
      const supaMeasurements = await fetchMeasurementsFromSupabase(farmSlug, since);
      const supaMortalities = await fetchMortalitiesFromSupabase(farmSlug, since);

      if (reqId !== reqIdRef.current) return;

      let rawM: RawMeasurement[];
      let rawMort: RawMortality[];
      let source: 'supabase' | 'local' | 'empty';

      if (supaMeasurements !== null && supaMortalities !== null) {
        rawM = supaMeasurements
          .filter((r) => r.tank_id)
          .map((r) => ({
            tankId: r.tank_id!,
            weightGrams: r.weight_grams,
            createdAt: r.client_created_at,
          }));
        rawMort = supaMortalities
          .filter((r) => r.tank_id)
          .map((r) => ({
            tankId: r.tank_id!,
            createdAt: r.client_created_at,
          }));
        source = rawM.length === 0 && rawMort.length === 0 ? 'empty' : 'supabase';
      } else {
        // --- Fallback to IndexedDB ---
        const allMeasurements = await db.measurements.orderBy('createdAt').toArray();
        let measurements = allMeasurements.filter((m) => m.farmId === farmSlug);
        if (since) {
          const sinceISO = since.toISOString();
          measurements = measurements.filter((m) => m.createdAt >= sinceISO);
        }

        const allMortalities = await db.mortalities.orderBy('createdAt').toArray();
        let morts = allMortalities.filter((m) => m.farmId === farmSlug);
        if (since) {
          const sinceISO = since.toISOString();
          morts = morts.filter((m) => m.createdAt >= sinceISO);
        }

        if (reqId !== reqIdRef.current) return;

        rawM = measurements
          .filter((m) => m.tankId)
          .map((m) => ({ tankId: m.tankId!, weightGrams: m.weightGrams, createdAt: m.createdAt }));
        rawMort = morts
          .filter((m) => m.tankId)
          .map((m) => ({ tankId: m.tankId!, createdAt: m.createdAt }));
        source = rawM.length === 0 && rawMort.length === 0 ? 'empty' : 'local';
      }

      if (reqId !== reqIdRef.current) return;

      // Collect available tanks
      const tankSet = new Set<string>();
      rawM.forEach((m) => tankSet.add(m.tankId));
      rawMort.forEach((m) => tankSet.add(m.tankId));
      const availableTanks = Array.from(tankSet).sort();

      // If two tanks aren't selected yet, return early with just availableTanks
      if (!tank1 || !tank2 || tank1 === tank2) {
        setData({
          ...EMPTY,
          availableTanks,
          isLoading: false,
          dataSource: source,
        });
        return;
      }

      // Filter data for the two selected tanks
      const tank1Measurements = rawM.filter((m) => m.tankId === tank1);
      const tank2Measurements = rawM.filter((m) => m.tankId === tank2);
      const tank1Mortalities = rawMort.filter((m) => m.tankId === tank1);
      const tank2Mortalities = rawMort.filter((m) => m.tankId === tank2);

      const tank1Stats = computeTankStats(tank1Measurements, tank1Mortalities);
      const tank2Stats = computeTankStats(tank2Measurements, tank2Mortalities);

      const { growthData, mortalityData } = computeComparisonCharts(
        rawM,
        rawMort,
        tank1,
        tank2,
      );

      if (reqId !== reqIdRef.current) return;

      setData({
        growthData,
        mortalityData,
        tank1Stats,
        tank2Stats,
        availableTanks,
        isLoading: false,
        dataSource: source,
      });
    })();
  }, [farmSlug, tank1, tank2, dateRange]);

  return data;
}
