import { useState, useEffect, useRef } from 'react';
import { db } from '../db/database';
import {
  fetchMeasurementsFromSupabase,
  fetchMortalitiesFromSupabase,
} from '../services/supabaseDashboardQueries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DateRangeOption = 'last4w' | 'last8w' | 'last12w' | 'all';

export interface DashboardFilters {
  farmSlug?: string;
  dateRange?: DateRangeOption;
  selectedTanks?: string[];
}

export interface DashboardGrowthPoint {
  week: number;
  label: string;
  [tankId: string]: number | string;
}

export interface DashboardMortalityPoint {
  week: number;
  label: string;
  [tankId: string]: number | string;
}

export interface DashboardSummaryStats {
  totalAnimals: number;
  averageWeight: number;
  survivalRate: number;
  bestTank: string;
}

export interface DashboardData {
  growthData: DashboardGrowthPoint[];
  mortalityData: DashboardMortalityPoint[];
  summaryStats: DashboardSummaryStats;
  tankIds: string[];
  availableTanks: string[];
  isLoading: boolean;
  dataSource: 'supabase' | 'local' | 'empty';
}

// ---------------------------------------------------------------------------
// Common row shapes used by the aggregation function
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
// Pure aggregation (shared by Supabase + IndexedDB code paths)
// ---------------------------------------------------------------------------

function getISOWeekKey(dateStr: string): { weekNum: number; label: string } {
  const date = new Date(dateStr);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  // Use year*100+week so sorting works across year boundaries (e.g. 202551 < 202601)
  return { weekNum: year * 100 + week, label: `Wk ${week}` };
}

interface AggregateResult {
  growthData: DashboardGrowthPoint[];
  mortalityData: DashboardMortalityPoint[];
  summaryStats: DashboardSummaryStats;
  allTankIds: string[];
}

function computeDashboardAggregates(
  measurements: RawMeasurement[],
  mortalities: RawMortality[],
): AggregateResult {
  // Collect unique tank IDs
  const tankIdSet = new Set<string>();
  measurements.forEach((m) => { if (m.tankId) tankIdSet.add(m.tankId); });
  mortalities.forEach((m) => { if (m.tankId) tankIdSet.add(m.tankId); });
  const allTankIds = Array.from(tankIdSet).sort();

  // --- Growth: group by week + tank, average weight ---
  const growthMap = new Map<
    number,
    { label: string; tanks: Map<string, { sum: number; count: number }> }
  >();

  for (const m of measurements) {
    if (!m.tankId) continue;
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

  const growthData: DashboardGrowthPoint[] = Array.from(growthMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([weekNum, { label, tanks }]) => {
      const point: DashboardGrowthPoint = { week: weekNum, label };
      for (const tankId of allTankIds) {
        const entry = tanks.get(tankId);
        point[tankId] = entry ? Math.round((entry.sum / entry.count) * 10) / 10 : 0;
      }
      return point;
    });

  // --- Mortality: group by week + tank, count ---
  const mortalityMap = new Map<number, { label: string; tanks: Map<string, number> }>();

  for (const m of mortalities) {
    if (!m.tankId) continue;
    const { weekNum, label } = getISOWeekKey(m.createdAt);
    if (!mortalityMap.has(weekNum)) {
      mortalityMap.set(weekNum, { label, tanks: new Map() });
    }
    const weekEntry = mortalityMap.get(weekNum)!;
    weekEntry.tanks.set(m.tankId, (weekEntry.tanks.get(m.tankId) || 0) + 1);
  }

  const allWeeks = new Set([...growthMap.keys(), ...mortalityMap.keys()]);
  const mortalityData: DashboardMortalityPoint[] = Array.from(allWeeks)
    .sort((a, b) => a - b)
    .map((weekNum) => {
      const entry = mortalityMap.get(weekNum);
      const growthEntry = growthMap.get(weekNum);
      const label = entry?.label || growthEntry?.label || `Wk ${weekNum}`;
      const point: DashboardMortalityPoint = { week: weekNum, label };
      for (const tankId of allTankIds) {
        point[tankId] = entry?.tanks.get(tankId) || 0;
      }
      return point;
    });

  // --- Summary stats ---
  const totalMeasurements = measurements.length;
  const totalMortalities = mortalities.length;

  const sortedWeeks = Array.from(growthMap.keys()).sort((a, b) => a - b);
  const latestWeek = sortedWeeks.length > 0 ? sortedWeeks[sortedWeeks.length - 1] : null;
  let averageWeight = 0;
  if (latestWeek !== null) {
    const tanks = growthMap.get(latestWeek)!.tanks;
    let totalSum = 0;
    let totalCount = 0;
    tanks.forEach(({ sum, count }) => { totalSum += sum; totalCount += count; });
    if (totalCount > 0) {
      averageWeight = Math.round((totalSum / totalCount) * 10) / 10;
    }
  }

  const total = totalMeasurements + totalMortalities;
  const survivalRate = total > 0
    ? Math.round((totalMeasurements / total) * 1000) / 10
    : 100;

  let bestTank = allTankIds[0] || '-';
  if (latestWeek !== null) {
    const tanks = growthMap.get(latestWeek)!.tanks;
    let bestAvg = -1;
    tanks.forEach(({ sum, count }, tankId) => {
      const avg = count > 0 ? sum / count : 0;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestTank = tankId;
      }
    });
  }

  return {
    growthData,
    mortalityData,
    summaryStats: { totalAnimals: totalMeasurements, averageWeight, survivalRate, bestTank },
    allTankIds,
  };
}

// ---------------------------------------------------------------------------
// Filter raw data by selected tanks (before aggregation so stats update too)
// ---------------------------------------------------------------------------

function filterByTanks<T extends { tankId: string }>(
  rows: T[],
  selectedTanks: string[],
): T[] {
  if (selectedTanks.length === 0) return rows; // empty = all
  return rows.filter((r) => selectedTanks.includes(r.tankId));
}

function collectTankIds(measurements: RawMeasurement[], mortalities: RawMortality[]): string[] {
  const set = new Set<string>();
  measurements.forEach((m) => set.add(m.tankId));
  mortalities.forEach((m) => set.add(m.tankId));
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Date range → since Date
// ---------------------------------------------------------------------------

function dateRangeToSince(range?: DateRangeOption): Date | undefined {
  if (!range || range === 'all') return undefined;
  const weeks = { last4w: 4, last8w: 8, last12w: 12 }[range];
  return new Date(Date.now() - weeks * 7 * 86400000);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const EMPTY: DashboardData = {
  growthData: [],
  mortalityData: [],
  summaryStats: { totalAnimals: 0, averageWeight: 0, survivalRate: 100, bestTank: '-' },
  tankIds: [],
  availableTanks: [],
  isLoading: true,
  dataSource: 'empty',
};

export function useDashboardData(filters: DashboardFilters): DashboardData {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const reqIdRef = useRef(0);

  const { farmSlug, dateRange, selectedTanks = [] } = filters;

  useEffect(() => {
    if (!farmSlug) {
      setData({ ...EMPTY, isLoading: false });
      return;
    }

    const reqId = ++reqIdRef.current;
    setData((prev) => ({ ...prev, isLoading: true }));

    const since = dateRangeToSince(dateRange);

    (async () => {
      // --- Try Supabase first ---
      const supaMeasurements = await fetchMeasurementsFromSupabase(farmSlug, since);
      const supaMortalities = await fetchMortalitiesFromSupabase(farmSlug, since);

      if (reqId !== reqIdRef.current) return; // stale request

      if (supaMeasurements !== null && supaMortalities !== null) {
        const rawM: RawMeasurement[] = supaMeasurements
          .filter((r) => r.tank_id)
          .map((r) => ({
            tankId: r.tank_id!,
            weightGrams: r.weight_grams,
            createdAt: r.client_created_at,
          }));
        const rawMort: RawMortality[] = supaMortalities
          .filter((r) => r.tank_id)
          .map((r) => ({
            tankId: r.tank_id!,
            createdAt: r.client_created_at,
          }));

        const availableTanks = collectTankIds(rawM, rawMort);
        const filteredM = filterByTanks(rawM, selectedTanks);
        const filteredMort = filterByTanks(rawMort, selectedTanks);
        const agg = computeDashboardAggregates(filteredM, filteredMort);

        if (reqId !== reqIdRef.current) return;
        setData({
          growthData: agg.growthData,
          mortalityData: agg.mortalityData,
          summaryStats: agg.summaryStats,
          tankIds: agg.allTankIds,
          availableTanks,
          isLoading: false,
          dataSource: rawM.length === 0 && rawMort.length === 0 ? 'empty' : 'supabase',
        });
        return;
      }

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

      const rawM: RawMeasurement[] = measurements
        .filter((m) => m.tankId)
        .map((m) => ({ tankId: m.tankId!, weightGrams: m.weightGrams, createdAt: m.createdAt }));
      const rawMort: RawMortality[] = morts
        .filter((m) => m.tankId)
        .map((m) => ({ tankId: m.tankId!, createdAt: m.createdAt }));

      const availableTanks = collectTankIds(rawM, rawMort);
      const filteredM = filterByTanks(rawM, selectedTanks);
      const filteredMort = filterByTanks(rawMort, selectedTanks);
      const agg = computeDashboardAggregates(filteredM, filteredMort);

      if (reqId !== reqIdRef.current) return;
      setData({
        growthData: agg.growthData,
        mortalityData: agg.mortalityData,
        summaryStats: agg.summaryStats,
        tankIds: agg.allTankIds,
        availableTanks,
        isLoading: false,
        dataSource: rawM.length === 0 && rawMort.length === 0 ? 'empty' : 'local',
      });
    })();
  }, [farmSlug, dateRange, selectedTanks.join(',')]);

  return data;
}
