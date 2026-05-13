// One-time seeding routine. Runs the simulator and stores everything in
// Dexie so the rest of the app sees a populated breeding program on first
// load. Idempotent: if the database already has lines/animals, this is a no-op
// unless `force` is set (used by the in-app reseed action).

import { db } from '../db/database';
import { runSimulation, TRAITS, GCORR, resetIds } from './simulator';
import type { Line } from './types';

export type SeedResult = {
  seeded: boolean;
  nAnimals: number;
  nGenotypes: number;
  nPhenotypes: number;
};

const LINES: Line[] = [
  {
    id: 'SPF-A',
    name: 'Pacific Premium SPF',
    kind: 'SPF',
    pathogenFocus: null,
    foundedAt: '2022-01-01',
    notes: 'High-growth elite line.',
  },
  {
    id: 'SPR-WSSV',
    name: 'WSSV-Resistant Line',
    kind: 'SPR',
    pathogenFocus: 'WSSV',
    foundedAt: '2022-01-01',
    notes: 'Selected for WSSV survival under repeated challenge.',
  },
];

export async function seedBreedingDataIfEmpty(): Promise<SeedResult> {
  const existing = await db.animals.count();
  if (existing > 0) {
    return {
      seeded: false,
      nAnimals: existing,
      nGenotypes: await db.genotypes.count(),
      nPhenotypes: await db.phenotypes.count(),
    };
  }
  return runSeed();
}

export async function resetAndReseedBreedingData(
  onProgress?: (msg: string) => void,
): Promise<SeedResult> {
  onProgress?.('Clearing existing breeding tables…');
  await db.transaction(
    'rw',
    [
      db.lines, db.traits, db.geneticCorrelations, db.animals, db.phenotypes,
      db.challenges, db.snpPanels, db.genotypes, db.snpEffects, db.bvRuns,
      db.breedingValues, db.selectionIndices, db.matingPlans, db.decisionLog,
    ],
    async () => {
      await Promise.all([
        db.lines.clear(),
        db.traits.clear(),
        db.geneticCorrelations.clear(),
        db.animals.clear(),
        db.phenotypes.clear(),
        db.challenges.clear(),
        db.snpPanels.clear(),
        db.genotypes.clear(),
        db.snpEffects.clear(),
        db.bvRuns.clear(),
        db.breedingValues.clear(),
        db.selectionIndices.clear(),
        db.matingPlans.clear(),
        db.decisionLog.clear(),
      ]);
    },
  );
  return runSeed(onProgress);
}

async function runSeed(onProgress?: (msg: string) => void): Promise<SeedResult> {
  resetIds();
  await db.lines.bulkPut(LINES);
  await db.traits.bulkPut(TRAITS);
  await db.geneticCorrelations.bulkPut(GCORR);

  let allAnimals = 0;
  let allGenos = 0;
  let allPhenos = 0;
  let panelStored = false;

  for (const line of LINES) {
    onProgress?.(`Simulating ${line.name}…`);
    const sim = runSimulation({
      seed: line.id === 'SPF-A' ? 42 : 7,
      lineId: line.id,
      generations: 4,
      foundersPerSex: 60,            // 120 founders per line
      familiesPerGen: 80,            // 80 hatching tanks
      juvenilesPerFamily: 375,       // → 30,000 juveniles per generation
      selectedAdultsRetained: 3000,  // → 3,000 broodstock per gen (non-final)
      sexRatio: 0.5,
      panelDensity: 2000,
      genotypeBroodstockFraction: 0.20, // ~600 genotyped per gen of broodstock
      phenotypeFractionHBW: 0.10,    // 10% of juveniles HBW-tagged
      phenotypeFractionDisease: 0.03,
      startDate: new Date('2022-04-01'),
    });

    if (!panelStored) {
      await db.snpPanels.put(sim.panel);
      panelStored = true;
    }

    onProgress?.(`Persisting ${sim.animals.length.toLocaleString()} animals (${line.id})…`);
    // Chunk bulkPut to keep IndexedDB transactions reasonable.
    const CHUNK = 5000;
    for (let i = 0; i < sim.animals.length; i += CHUNK) {
      await db.animals.bulkPut(sim.animals.slice(i, i + CHUNK));
    }
    allAnimals += sim.animals.length;

    onProgress?.(`Persisting ${sim.genotypes.size.toLocaleString()} genotypes (${line.id})…`);
    const genoRows: { animalId: string; panelId: string; callRate: number; genotypedAt: string; dosage: Blob }[] = [];
    for (const [animalId, dosage] of sim.genotypes) {
      genoRows.push({
        animalId,
        panelId: sim.panel.id,
        callRate: 0.99,
        genotypedAt: new Date().toISOString(),
        dosage: new Blob([new Uint8Array(dosage)]),
      });
    }
    for (let i = 0; i < genoRows.length; i += CHUNK) {
      await db.genotypes.bulkPut(genoRows.slice(i, i + CHUNK));
    }
    allGenos += genoRows.length;

    onProgress?.(`Persisting ${sim.phenotypes.length.toLocaleString()} phenotypes (${line.id})…`);
    for (let i = 0; i < sim.phenotypes.length; i += CHUNK) {
      await db.phenotypes.bulkPut(sim.phenotypes.slice(i, i + CHUNK));
    }
    allPhenos += sim.phenotypes.length;
  }

  onProgress?.('Done.');
  return { seeded: true, nAnimals: allAnimals, nGenotypes: allGenos, nPhenotypes: allPhenos };
}
