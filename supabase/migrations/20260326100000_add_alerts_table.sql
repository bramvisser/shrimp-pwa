CREATE TYPE alert_type AS ENUM ('critical', 'warning', 'info');

CREATE TABLE alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       alert_type NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  farm_id    TEXT,
  farm_name  TEXT,
  tank_id    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ
);

CREATE INDEX idx_alerts_farm ON alerts(farm_id);
CREATE INDEX idx_alerts_type ON alerts(type);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to alerts" ON alerts
  FOR ALL USING (true) WITH CHECK (true);

-- Seed realistic alerts tied to the 3 existing farms
INSERT INTO alerts (type, title, message, farm_id, farm_name, tank_id, created_at) VALUES
  (
    'critical',
    'Mortality spike detected',
    'Mortality rate increased 40% this week. Check water quality parameters immediately.',
    'chanthaburi-farm',
    'Chanthaburi Farm',
    'TNK-B1',
    now() - interval '2 hours'
  ),
  (
    'warning',
    'Below-average growth',
    'Average weight 15% below expected growth curve. Consider feed adjustment.',
    'bang-pla-farm',
    'Bang Pla Farm',
    'TNK-A2',
    now() - interval '5 hours'
  ),
  (
    'warning',
    'High temperature recorded',
    'Water temperature exceeded 32°C threshold.',
    'surat-thani-farm',
    'Surat Thani Farm',
    'TNK-C1',
    now() - interval '8 hours'
  ),
  (
    'info',
    'Growth milestone reached',
    'Animals reached 20g average weight ahead of schedule.',
    'bang-pla-farm',
    'Bang Pla Farm',
    'TNK-A1',
    now() - interval '1 day'
  ),
  (
    'info',
    'Sync completed',
    'All pending records synced successfully.',
    NULL,
    NULL,
    NULL,
    now() - interval '1 day'
  ),
  (
    'warning',
    'Low dissolved oxygen',
    'DO levels dropped below 4 mg/L. Increase aeration.',
    'chanthaburi-farm',
    'Chanthaburi Farm',
    'TNK-B1',
    now() - interval '3 hours'
  );
