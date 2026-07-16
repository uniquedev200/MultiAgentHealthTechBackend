CREATE TABLE IF NOT EXISTS hospital_llm_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('groq', 'mistral')),
  api_key_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_hllmcred_hospital ON hospital_llm_credentials(hospital_id);
