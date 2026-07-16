-- ============================================================
-- Hospital Emergency Resource Negotiation MVP — Database Schema
-- Paste this into Supabase SQL Editor and run.
-- ============================================================

-- 1. EMERGENCIES
CREATE TABLE IF NOT EXISTS emergencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL CHECK (scope IN ('individual', 'mass')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  department_reach TEXT[] NOT NULL DEFAULT '{}',
  declared_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

-- 2. CASES
CREATE TABLE IF NOT EXISTS cases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id           UUID NOT NULL REFERENCES emergencies(id) ON DELETE CASCADE,
  acuity_score           INTEGER NOT NULL CHECK (acuity_score BETWEEN 1 AND 5),
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allocated', 'discharged')),
  required_resource_types TEXT[] NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_emergency_id ON cases(emergency_id);

-- 3. RESOURCES
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

-- 4. RESOURCE DEPENDENCIES
CREATE TABLE IF NOT EXISTS resource_dependencies (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id            UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  depends_on_resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  relation               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rd_resource_id ON resource_dependencies(resource_id);

-- 5. BIDS
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

-- 6. ALLOCATIONS
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

-- 7. AUDIT LOG
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

-- ============================================================
-- Seed some sample resources for testing
-- ============================================================
INSERT INTO resources (id, type, label, status, department, metadata) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'or_slot',    'OR-1',           'available', 'Surgery',    '{"capacity_minutes": 120}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'or_slot',    'OR-2',           'available', 'Surgery',    '{"capacity_minutes": 90}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'icu_bed',    'ICU Bed A',      'available', 'ICU',        '{"ventilator": true}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'icu_bed',    'ICU Bed B',      'occupied',  'ICU',        '{"ventilator": false}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'staff',      'Dr. Smith',      'available', 'Emergency',  '{"specialty": "trauma", "shift": "night"}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', 'staff',      'Nurse Patel',    'available', 'Emergency',  '{"specialty": "general", "shift": "night"}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', 'equipment',  'Portable X-Ray', 'available', 'Radiology',  '{"portable": true}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a18', 'er_bay',     'ER Bay 1',       'available', 'Emergency',  '{"beds": 2}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a19', 'er_bay',     'ER Bay 2',       'reserved',  'Emergency',  '{"beds": 1}')
ON CONFLICT (id) DO NOTHING;
