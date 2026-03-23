CREATE TABLE farms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  location   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to farms" ON farms
  FOR ALL USING (true) WITH CHECK (true);

-- Seed the 3 initial farms
INSERT INTO farms (name, slug, location) VALUES
  ('Bang Pla Farm', 'bang-pla-farm', 'Samut Prakan, Thailand'),
  ('Chanthaburi Farm', 'chanthaburi-farm', 'Chanthaburi, Thailand'),
  ('Surat Thani Farm', 'surat-thani-farm', 'Surat Thani, Thailand');
