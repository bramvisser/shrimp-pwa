export interface GrowthDataPoint {
  week: number;
  label: string;
  'TNK-A1': number;
  'TNK-A2': number;
  'TNK-B1': number;
  [tankId: string]: number | string;
}

export interface MortalityDataPoint {
  week: number;
  label: string;
  'TNK-A1': number;
  'TNK-A2': number;
  'TNK-B1': number;
  [tankId: string]: number | string;
}

export interface SummaryStats {
  totalAnimals: number;
  averageWeight: number;
  survivalRate: number;
  bestTank: string;
}

export const growthData: GrowthDataPoint[] = [
  { week: 1, label: 'Wk 1', 'TNK-A1': 2.1, 'TNK-A2': 1.9, 'TNK-B1': 2.0 },
  { week: 2, label: 'Wk 2', 'TNK-A1': 4.3, 'TNK-A2': 3.8, 'TNK-B1': 3.9 },
  { week: 3, label: 'Wk 3', 'TNK-A1': 7.2, 'TNK-A2': 6.5, 'TNK-B1': 6.8 },
  { week: 4, label: 'Wk 4', 'TNK-A1': 10.5, 'TNK-A2': 9.8, 'TNK-B1': 10.1 },
  { week: 5, label: 'Wk 5', 'TNK-A1': 14.1, 'TNK-A2': 13.2, 'TNK-B1': 12.8 },
  { week: 6, label: 'Wk 6', 'TNK-A1': 17.8, 'TNK-A2': 16.9, 'TNK-B1': 15.4 },
  { week: 7, label: 'Wk 7', 'TNK-A1': 21.3, 'TNK-A2': 20.1, 'TNK-B1': 19.2 },
  { week: 8, label: 'Wk 8', 'TNK-A1': 24.7, 'TNK-A2': 23.5, 'TNK-B1': 22.1 },
];

export const mortalityData: MortalityDataPoint[] = [
  { week: 1, label: 'Wk 1', 'TNK-A1': 1, 'TNK-A2': 2, 'TNK-B1': 1 },
  { week: 2, label: 'Wk 2', 'TNK-A1': 0, 'TNK-A2': 1, 'TNK-B1': 2 },
  { week: 3, label: 'Wk 3', 'TNK-A1': 1, 'TNK-A2': 0, 'TNK-B1': 1 },
  { week: 4, label: 'Wk 4', 'TNK-A1': 2, 'TNK-A2': 1, 'TNK-B1': 3 },
  { week: 5, label: 'Wk 5', 'TNK-A1': 1, 'TNK-A2': 2, 'TNK-B1': 5 },
  { week: 6, label: 'Wk 6', 'TNK-A1': 0, 'TNK-A2': 1, 'TNK-B1': 4 },
  { week: 7, label: 'Wk 7', 'TNK-A1': 1, 'TNK-A2': 0, 'TNK-B1': 2 },
  { week: 8, label: 'Wk 8', 'TNK-A1': 0, 'TNK-A2': 1, 'TNK-B1': 1 },
];

export const summaryStats: SummaryStats = {
  totalAnimals: 14_520,
  averageWeight: 23.4,
  survivalRate: 94.2,
  bestTank: 'TNK-A1',
};
