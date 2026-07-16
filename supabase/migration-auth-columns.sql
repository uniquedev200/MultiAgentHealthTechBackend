-- ============================================================
-- Add login credentials to hospitals
-- Run this AFTER migration-hospital-scoping.sql
-- ============================================================

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
