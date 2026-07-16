-- ============================================================
-- Multi-Hospital Scoping Migration
-- Run this AFTER the base schema.sql
-- ============================================================

-- 1. NEW TABLE: hospitals
CREATE TABLE IF NOT EXISTS hospitals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. NEW TABLE: hospital_api_keys
CREATE TABLE IF NOT EXISTS hospital_api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  api_key     TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hak_api_key ON hospital_api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_hak_hospital_id ON hospital_api_keys(hospital_id);

-- 3. ADD hospital_id to existing tables
-- We use NOT NULL DEFAULT since these are existing tables that may have data.
-- After seeding, you can ALTER DEFAULT and drop it if desired.

ALTER TABLE emergencies
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;

ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;

ALTER TABLE allocations
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;

-- Indexes for the new column
CREATE INDEX IF NOT EXISTS idx_emergencies_hospital ON emergencies(hospital_id);
CREATE INDEX IF NOT EXISTS idx_cases_hospital ON cases(hospital_id);
CREATE INDEX IF NOT EXISTS idx_resources_hospital ON resources(hospital_id);
CREATE INDEX IF NOT EXISTS idx_bids_hospital ON bids(hospital_id);
CREATE INDEX IF NOT EXISTS idx_allocations_hospital ON allocations(hospital_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_hospital ON audit_log(hospital_id);

-- 4. Seed: two hospitals with API keys
-- Hospital A (General Hospital)
INSERT INTO hospitals (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'General Hospital')
ON CONFLICT (id) DO NOTHING;

INSERT INTO hospital_api_keys (hospital_id, api_key) VALUES
  ('11111111-1111-1111-1111-111111111111', 'gh-live-key-001')
ON CONFLICT (api_key) DO NOTHING;

-- Hospital B (City Medical Center)
INSERT INTO hospitals (id, name) VALUES
  ('22222222-2222-2222-2222-222222222222', 'City Medical Center')
ON CONFLICT (id) DO NOTHING;

INSERT INTO hospital_api_keys (hospital_id, api_key) VALUES
  ('22222222-2222-2222-2222-222222222222', 'cmc-live-key-002')
ON CONFLICT (api_key) DO NOTHING;

-- 5. Stamp existing seed resources with Hospital A's id
UPDATE resources SET hospital_id = '11111111-1111-1111-1111-111111111111'
  WHERE hospital_id IS NULL;
