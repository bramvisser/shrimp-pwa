CREATE TYPE mortality_cause AS ENUM ('unknown', 'disease', 'handling', 'water', 'other');

CREATE TABLE measurements (
  id                UUID PRIMARY KEY,
  farm_id           TEXT NOT NULL,
  tank_id           TEXT,
  cohort_id         TEXT,
  rfid_tag          TEXT,
  barcode           TEXT,
  animal_id         TEXT,
  weight_grams      DOUBLE PRECISION NOT NULL,
  operator_name     TEXT NOT NULL,
  device_id         TEXT,
  scale_id          TEXT,
  client_created_at TIMESTAMPTZ NOT NULL,
  server_created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mortalities (
  id                UUID PRIMARY KEY,
  farm_id           TEXT NOT NULL,
  tank_id           TEXT,
  cohort_id         TEXT,
  rfid_tag          TEXT,
  animal_id         TEXT,
  cause             mortality_cause NOT NULL DEFAULT 'unknown',
  remarks           TEXT,
  operator_name     TEXT NOT NULL,
  client_created_at TIMESTAMPTZ NOT NULL,
  server_created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_measurements_farm ON measurements(farm_id);
CREATE INDEX idx_mortalities_farm ON mortalities(farm_id);

-- Allow anonymous inserts and reads (tighten with real auth later)
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE mortalities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to measurements" ON measurements
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to mortalities" ON mortalities
  FOR ALL USING (true) WITH CHECK (true);
