// Synthetic farm-data generator for demos. Produces realistic-looking
// measurements and mortality events across the current set of farms, spread
// over the last `daysOfHistory` days so dashboards have something recent to
// show. All generated records are marked `syncStatus: 'synced'` so they don't
// flood the sync queue.

import { db, type Measurement, type Mortality, type MortalityCause } from '../db/database';

const TANK_LETTERS = ['A', 'B', 'C'];
const TANK_NUMBERS = [1, 2];
const OPERATORS = ['demo-andy', 'demo-priya', 'demo-thanat', 'demo-luca'];
const CAUSES: MortalityCause[] = ['unknown', 'disease', 'handling', 'water', 'other'];

const DAY_MS = 86_400_000;

export type DemoSeedResult = {
  farms: number;
  tanks: number;
  measurements: number;
  mortalities: number;
};

export type DemoSeedOptions = {
  daysOfHistory: number;
  measurementsPerDayMin: number;
  measurementsPerDayMax: number;
  mortalityProbabilityPerDay: number; // 0..1, applied per (tank, day)
};

const DEFAULTS: DemoSeedOptions = {
  daysOfHistory: 60,
  measurementsPerDayMin: 4,
  measurementsPerDayMax: 12,
  mortalityProbabilityPerDay: 0.18,
};

export async function resetAndReseedFarmDemoData(
  opts: Partial<DemoSeedOptions> = {},
): Promise<DemoSeedResult> {
  await db.transaction('rw', [db.measurements, db.mortalities], async () => {
    await db.measurements.clear();
    await db.mortalities.clear();
  });
  return seedFarmDemoData(opts);
}

export async function seedFarmDemoData(
  opts: Partial<DemoSeedOptions> = {},
): Promise<DemoSeedResult> {
  const cfg = { ...DEFAULTS, ...opts };
  const farms = await db.farms.toArray();
  if (farms.length === 0) {
    throw new Error(
      'No farms in the local cache yet. Open the app while online so farms sync from Supabase, then retry.',
    );
  }

  const measurements: Measurement[] = [];
  const mortalities: Mortality[] = [];
  const now = Date.now();
  // Use the index-of-farm as a seed nudge so tanks differ between farms.
  let tankCount = 0;

  for (let fi = 0; fi < farms.length; fi++) {
    const farm = farms[fi];
    const farmPrefix = (farm.slug ?? farm.id).slice(0, 2).toUpperCase();
    for (const L of TANK_LETTERS) {
      for (const N of TANK_NUMBERS) {
        const tankId = `T-${farmPrefix}-${L}${N}`;
        tankCount++;
        // Each tank gets its own grow-out curve. We pretend the tank was
        // stocked about `daysOfHistory + 30` days ago at ~3 g and is on its
        // way to harvest weight (~28 g) — so today's measurements land in the
        // mid-to-late part of the curve.
        const cycleAgeAtStart = cfg.daysOfHistory + 20 + rng(fi * 11 + L.charCodeAt(0)) * 20;
        const dailyGain = 0.18 + rng(fi * 13 + N) * 0.08; // 0.18..0.26 g/day
        const startWeight = 3 + rng(fi * 7 + L.charCodeAt(0)) * 1.5;

        for (let d = cfg.daysOfHistory; d >= 0; d--) {
          const tankAgeDays = cycleAgeAtStart - d;
          const meanWeight = Math.max(0.5, startWeight + dailyGain * tankAgeDays);
          const measCount =
            cfg.measurementsPerDayMin +
            Math.floor(
              rng(fi * 31 + L.charCodeAt(0) * 17 + N * 7 + d) *
                (cfg.measurementsPerDayMax - cfg.measurementsPerDayMin + 1),
            );
          for (let m = 0; m < measCount; m++) {
            const jitter = (rng(d * 101 + m * 13 + tankCount) - 0.5) * (meanWeight * 0.25);
            const weight = Math.max(0.1, meanWeight + jitter);
            const tsOffset = rng(d * 211 + m * 19 + tankCount) * DAY_MS;
            const createdAt = new Date(now - d * DAY_MS + tsOffset - 8 * 3600_000);
            measurements.push({
              id: crypto.randomUUID(),
              farmId: farm.slug ?? farm.id,
              tankId,
              weightGrams: round2(weight),
              operatorName: OPERATORS[(d + m) % OPERATORS.length],
              createdAt: createdAt.toISOString(),
              syncStatus: 'synced',
              syncAttempts: 0,
            });
          }
          // Per-day mortality coin-flip.
          if (rng(d * 53 + tankCount * 311) < cfg.mortalityProbabilityPerDay) {
            const cause = CAUSES[Math.floor(rng(d * 17 + tankCount) * CAUSES.length)];
            const tsOffset = rng(d * 41 + tankCount * 7) * DAY_MS;
            const createdAt = new Date(now - d * DAY_MS + tsOffset - 8 * 3600_000);
            mortalities.push({
              id: crypto.randomUUID(),
              farmId: farm.slug ?? farm.id,
              tankId,
              cause,
              operatorName: OPERATORS[(d + tankCount) % OPERATORS.length],
              createdAt: createdAt.toISOString(),
              syncStatus: 'synced',
              syncAttempts: 0,
            });
          }
        }
      }
    }
  }

  // Persist in chunks so a large IndexedDB write doesn't choke a phone.
  const CHUNK = 1000;
  for (let i = 0; i < measurements.length; i += CHUNK) {
    await db.measurements.bulkAdd(measurements.slice(i, i + CHUNK));
  }
  for (let i = 0; i < mortalities.length; i += CHUNK) {
    await db.mortalities.bulkAdd(mortalities.slice(i, i + CHUNK));
  }

  return {
    farms: farms.length,
    tanks: tankCount,
    measurements: measurements.length,
    mortalities: mortalities.length,
  };
}

// Tiny deterministic-ish PRNG: hashes the seed and returns a value in [0, 1).
// Lets the generator produce stable-looking variation without bringing in a
// real RNG dependency, while still scattering values when called with growing
// seed values like (d * 101 + m * 13 + tankCount).
function rng(seed: number): number {
  let x = (seed * 2654435761) >>> 0;
  x ^= x >>> 13;
  x = (x * 1597334677) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
