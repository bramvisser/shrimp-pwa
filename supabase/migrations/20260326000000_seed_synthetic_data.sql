-- Seed synthetic measurement and mortality data for dashboard development.
-- Covers 3 farms, 10 tanks, 14 weeks of realistic shrimp growth data.

DO $$
DECLARE
  farm_slugs   TEXT[]  := ARRAY['bang-pla-farm', 'chanthaburi-farm', 'surat-thani-farm'];
  operators    TEXT[]  := ARRAY['Somchai P.', 'Nattapong K.', 'Priya S.', 'Waraporn T.'];
  causes       mortality_cause[] := ARRAY['unknown', 'disease', 'handling', 'water', 'other']::mortality_cause[];
  cause_weights DOUBLE PRECISION[] := ARRAY[0.30, 0.35, 0.15, 0.12, 0.08]; -- cumulative thresholds applied below

  -- Tank assignments per farm index (0-based)
  -- Bang Pla: TNK-A1..A3, Chanthaburi: TNK-B1..B4, Surat Thani: TNK-C1..C3
  farm_tank_prefixes TEXT[] := ARRAY['A', 'B', 'C'];
  farm_tank_counts   INT[]  := ARRAY[3, 4, 3];

  start_date TIMESTAMPTZ := now() - interval '14 weeks';

  f_idx       INT;
  t_idx       INT;
  w           INT;
  m           INT;
  farm_slug   TEXT;
  tank_id     TEXT;
  tank_prefix TEXT;
  tank_count  INT;
  week_start  TIMESTAMPTZ;
  rec_time    TIMESTAMPTZ;
  base_weight DOUBLE PRECISION;
  tank_offset DOUBLE PRECISION;
  jitter      DOUBLE PRECISION;
  weight_val  DOUBLE PRECISION;
  op_name     TEXT;
  animal_num  INT := 0;
  cause_roll  DOUBLE PRECISION;
  chosen_cause mortality_cause;
  mort_prob   DOUBLE PRECISION;
BEGIN
  FOR f_idx IN 1..array_length(farm_slugs, 1) LOOP
    farm_slug   := farm_slugs[f_idx];
    tank_prefix := farm_tank_prefixes[f_idx];
    tank_count  := farm_tank_counts[f_idx];

    FOR t_idx IN 1..tank_count LOOP
      tank_id := 'TNK-' || tank_prefix || t_idx::TEXT;

      -- Per-tank growth offset: some tanks grow slightly faster/slower
      tank_offset := (random() - 0.5) * 2.0;  -- range: -1.0 to +1.0 g

      FOR w IN 0..13 LOOP
        week_start := start_date + (w * interval '1 week');

        -- Logistic-ish growth: ~2g at week 0, ~28g at week 13
        base_weight := 2.0 + 26.0 * power((w::DOUBLE PRECISION / 13.0), 1.3);

        -- Insert 8-12 measurements per tank per week
        FOR m IN 1..(8 + floor(random() * 5)::INT) LOOP
          animal_num := animal_num + 1;

          -- Random time within the week
          rec_time := week_start
            + (floor(random() * 6) * interval '1 day')
            + (floor(random() * 9) * interval '1 hour')
            + (floor(random() * 60) * interval '1 minute');

          -- Individual weight with jitter
          jitter := (random() - 0.5) * base_weight * 0.2;  -- ±10% variation
          weight_val := greatest(0.5, base_weight + tank_offset + jitter);
          weight_val := round(weight_val::NUMERIC, 1)::DOUBLE PRECISION;

          -- Rotate operators
          op_name := operators[1 + (animal_num % array_length(operators, 1))];

          INSERT INTO measurements (
            id, farm_id, tank_id, cohort_id, animal_id,
            weight_grams, operator_name, client_created_at
          ) VALUES (
            gen_random_uuid(),
            farm_slug,
            tank_id,
            'COH-2026-Q1',
            'SHP-' || lpad(animal_num::TEXT, 5, '0'),
            weight_val,
            op_name,
            rec_time
          );
        END LOOP;

        -- Mortalities: base probability ~20% chance per tank per week,
        -- higher in early weeks and for some tanks
        mort_prob := 0.20 + (CASE WHEN w < 3 THEN 0.15 ELSE 0.0 END);

        -- Occasional spike for tank B1 around weeks 4-6
        IF tank_id = 'TNK-B1' AND w BETWEEN 4 AND 6 THEN
          mort_prob := 0.7;
        END IF;

        -- Generate 0-3 mortalities based on probability
        FOR m IN 1..3 LOOP
          IF random() < mort_prob THEN
            rec_time := week_start
              + (floor(random() * 6) * interval '1 day')
              + (floor(random() * 9) * interval '1 hour');

            -- Weighted random cause selection
            cause_roll := random();
            IF cause_roll < 0.30 THEN
              chosen_cause := 'unknown';
            ELSIF cause_roll < 0.65 THEN
              chosen_cause := 'disease';
            ELSIF cause_roll < 0.80 THEN
              chosen_cause := 'handling';
            ELSIF cause_roll < 0.92 THEN
              chosen_cause := 'water';
            ELSE
              chosen_cause := 'other';
            END IF;

            animal_num := animal_num + 1;
            op_name := operators[1 + (animal_num % array_length(operators, 1))];

            INSERT INTO mortalities (
              id, farm_id, tank_id, cohort_id, animal_id,
              cause, remarks, operator_name, client_created_at
            ) VALUES (
              gen_random_uuid(),
              farm_slug,
              tank_id,
              'COH-2026-Q1',
              'SHP-' || lpad(animal_num::TEXT, 5, '0'),
              chosen_cause,
              CASE chosen_cause
                WHEN 'disease' THEN 'Suspected white spot syndrome'
                WHEN 'water' THEN 'Low dissolved oxygen event'
                WHEN 'handling' THEN 'Damaged during sampling'
                ELSE NULL
              END,
              op_name,
              rec_time
            );
          END IF;
        END LOOP;

      END LOOP; -- weeks
    END LOOP; -- tanks
  END LOOP; -- farms
END $$;
