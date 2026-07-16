-- ============================================================
-- Combined migration — run in order against real Supabase
-- ============================================================

-- PART 1: Core tables
-- ============================================================

CREATE TABLE IF NOT EXISTS emergencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL CHECK (scope IN ('individual', 'mass')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  department_reach TEXT[] NOT NULL DEFAULT '{}',
  declared_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id           UUID NOT NULL REFERENCES emergencies(id) ON DELETE CASCADE,
  acuity_score           INTEGER NOT NULL CHECK (acuity_score BETWEEN 1 AND 5),
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allocated', 'discharged')),
  required_resource_types TEXT[] NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cases_emergency_id ON cases(emergency_id);

CREATE TABLE IF NOT EXISTS resources (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type      TEXT NOT NULL CHECK (type IN ('or_slot', 'icu_bed', 'staff', 'equipment', 'er_bay')),
  label     TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'offline')),
  department TEXT NOT NULL,
  metadata  JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);

CREATE TABLE IF NOT EXISTS resource_dependencies (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id            UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  depends_on_resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  relation               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rd_resource_id ON resource_dependencies(resource_id);

CREATE TABLE IF NOT EXISTS bids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    TEXT NOT NULL,
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  bid_score   NUMERIC(10,4) NOT NULL,
  reasoning   TEXT NOT NULL DEFAULT '',
  conditions  TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bids_round_id ON bids(round_id);
CREATE INDEX IF NOT EXISTS idx_bids_case_id ON bids(case_id);

CREATE TABLE IF NOT EXISTS allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  round_id    TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_allocations_round_id ON allocations(round_id);
CREATE INDEX IF NOT EXISTS idx_allocations_case_id ON allocations(case_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  prev_hash   TEXT,
  hash        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);

-- PART 2: Hospital scoping
-- ============================================================

CREATE TABLE IF NOT EXISTS hospitals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hospital_api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  api_key     TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hak_api_key ON hospital_api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_hak_hospital_id ON hospital_api_keys(hospital_id);

ALTER TABLE emergencies    ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;
ALTER TABLE cases          ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;
ALTER TABLE resources      ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;
ALTER TABLE bids           ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;
ALTER TABLE allocations    ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;
ALTER TABLE audit_log      ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emergencies_hospital  ON emergencies(hospital_id);
CREATE INDEX IF NOT EXISTS idx_cases_hospital        ON cases(hospital_id);
CREATE INDEX IF NOT EXISTS idx_resources_hospital    ON resources(hospital_id);
CREATE INDEX IF NOT EXISTS idx_bids_hospital         ON bids(hospital_id);
CREATE INDEX IF NOT EXISTS idx_allocations_hospital  ON allocations(hospital_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_hospital    ON audit_log(hospital_id);

-- PART 3: Auth columns
-- ============================================================

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
