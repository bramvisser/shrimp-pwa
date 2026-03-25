import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import {
  growthData as mockGrowthData,
  mortalityData as mockMortalityData,
  summaryStats as mockSummaryStats,
} from '../data/mockDashboardData';

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
  isMockData: boolean;
}

/**
 * Get the ISO week number from a date string.
 * Returns a string like "2024-W03" for sorting/grouping.
 */
function getISOWeekKey(dateStr: string): { weekNum: number; label: string } {
  const date = new Date(dateStr);
  // Calculate ISO week number
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { weekNum, label: `Wk ${weekNum}` };
}

export function useDashboardData(farmId?: string): DashboardData {
  const result = useLiveQuery(async () => {
    // Query measurements
    const allMeasurements = await db.measurements.orderBy('createdAt').toArray();
    const measurements = farmId
      ? allMeasurements.filter((m) => m.farmId === farmId)
      : allMeasurements;

    // Query mortalities
    const allMortalities = await db.mortalities.orderBy('createdAt').toArray();
    const mortalities = farmId
      ? allMortalities.filter((m) => m.farmId === farmId)
      : allMortalities;

    // If no real data, return null to signal fallback
    if (measurements.length === 0 && mortalities.length === 0) {
      return null;
    }

    // Collect unique tank IDs
    const tankIdSet = new Set<string>();
    measurements.forEach((m) => {
      if (m.tankId) tankIdSet.add(m.tankId);
    });
    mortalities.forEach((m) => {
      if (m.tankId) tankIdSet.add(m.tankId);
    });
    const tankIds = Array.from(tankIdSet).sort();

    // --- Growth data: group by week and tankId, compute average weight ---
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
        for (const tankId of tankIds) {
          const entry = tanks.get(tankId);
          point[tankId] = entry
            ? Math.round((entry.sum / entry.count) * 10) / 10
            : 0;
        }
        return point;
      });

    // --- Mortality data: group by week and tankId, count per tank ---
    const mortalityMap = new Map<
      number,
      { label: string; tanks: Map<string, number> }
    >();

    for (const m of mortalities) {
      if (!m.tankId) continue;
      const { weekNum, label } = getISOWeekKey(m.createdAt);
      if (!mortalityMap.has(weekNum)) {
        mortalityMap.set(weekNum, { label, tanks: new Map() });
      }
      const weekEntry = mortalityMap.get(weekNum)!;
      weekEntry.tanks.set(m.tankId, (weekEntry.tanks.get(m.tankId) || 0) + 1);
    }

    // Include all weeks from both growth and mortality
    const allWeeks = new Set([...growthMap.keys(), ...mortalityMap.keys()]);

    const mortalityData: DashboardMortalityPoint[] = Array.from(allWeeks)
      .sort((a, b) => a - b)
      .map((weekNum) => {
        const entry = mortalityMap.get(weekNum);
        const growthEntry = growthMap.get(weekNum);
        const label = entry?.label || growthEntry?.label || `Wk ${weekNum}`;
        const point: DashboardMortalityPoint = { week: weekNum, label };
        for (const tankId of tankIds) {
          point[tankId] = entry?.tanks.get(tankId) || 0;
        }
        return point;
      });

    // --- Summary stats ---
    const totalMeasurements = measurements.length;
    const totalMortalities = mortalities.length;

    // Most recent week's average weight
    const sortedWeeks = Array.from(growthMap.keys()).sort((a, b) => a - b);
    const latestWeek = sortedWeeks.length > 0 ? sortedWeeks[sortedWeeks.length - 1] : null;
    let averageWeight = 0;
    if (latestWeek !== null) {
      const tanks = growthMap.get(latestWeek)!.tanks;
      let totalSum = 0;
      let totalCount = 0;
      tanks.forEach(({ sum, count }) => {
        totalSum += sum;
        totalCount += count;
      });
      if (totalCount > 0) {
        averageWeight = Math.round((totalSum / totalCount) * 10) / 10;
      }
    }

    // Survival rate
    const total = totalMeasurements + totalMortalities;
    const survivalRate = total > 0
      ? Math.round((totalMeasurements / total) * 1000) / 10
      : 100;

    // Best tank: highest avg weight in the most recent week
    let bestTank = tankIds[0] || '-';
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
      summaryStats: {
        totalAnimals: totalMeasurements,
        averageWeight,
        survivalRate,
        bestTank,
      },
      tankIds,
    };
  }, [farmId]);

  // Fallback to mock data when there's no real data (result is null)
  // or while useLiveQuery is still loading (result is undefined)
  if (result === null || result === undefined) {
    const mockTankIds = ['TNK-A1', 'TNK-A2', 'TNK-B1'];
    return {
      growthData: mockGrowthData,
      mortalityData: mockMortalityData,
      summaryStats: mockSummaryStats,
      tankIds: mockTankIds,
      isMockData: true,
    };
  }

  return { ...result, isMockData: false };
}
