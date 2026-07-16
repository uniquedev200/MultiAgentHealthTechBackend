import { v4 as uuidv4 } from "uuid";
import type { Hospital, HospitalApiKey } from "./types";
import { query } from "./db";

const DATA_LAYER = process.env.DATA_LAYER || "fake";

// ── Fake in-memory hospital store ─────────────────────────────
const fakeHospitals: Hospital[] = [];
const fakeApiKeys: HospitalApiKey[] = [];

// ── Fake mode: static demo hospital credentials ──────────────
const DEMO_HOSPITAL_ID = "11111111-1111-1111-1111-111111111111";
const DEMO_EMAIL = "admin@generalhospital.demo";

let _demoHash: string | null = null;

async function getDemoHash(): Promise<string> {
  if (!_demoHash) {
    const bcrypt = await import("bcrypt");
    _demoHash = await bcrypt.hash("demo1234", 10);
  }
  return _demoHash;
}

async function ensureDemoHospital(): Promise<void> {
  if (fakeHospitals.find((h) => h.email === DEMO_EMAIL)) return;
  const hash = await getDemoHash();
  fakeHospitals.push({
    id: DEMO_HOSPITAL_ID,
    name: "General Hospital",
    email: DEMO_EMAIL,
    password_hash: hash,
    created_at: new Date().toISOString(),
  });
  fakeApiKeys.push({
    id: uuidv4(),
    hospital_id: DEMO_HOSPITAL_ID,
    api_key: "gh-live-key-001",
    created_at: new Date().toISOString(),
  });
}

// ── findHospitalByEmail ──────────────────────────────────────
export async function findHospitalByEmail(
  email: string
): Promise<Hospital | null> {
  if (DATA_LAYER === "fake") {
    await ensureDemoHospital();
    return fakeHospitals.find((h) => h.email === email) || null;
  }

  const { rows } = await query(
    "SELECT id, name, email, password_hash, created_at FROM hospitals WHERE email = $1",
    [email]
  );
  return rows[0] || null;
}

// ── findHospitalById ─────────────────────────────────────────
export async function findHospitalById(
  id: string
): Promise<Hospital | null> {
  if (DATA_LAYER === "fake") {
    await ensureDemoHospital();
    return fakeHospitals.find((h) => h.id === id) || null;
  }

  const { rows } = await query(
    "SELECT id, name, email, password_hash, created_at FROM hospitals WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

// ── createHospital ───────────────────────────────────────────
export async function createHospital(
  name: string,
  email: string,
  passwordHash: string
): Promise<Hospital> {
  if (DATA_LAYER === "fake") {
    const hospital: Hospital = {
      id: uuidv4(),
      name,
      email,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };
    fakeHospitals.push(hospital);
    return hospital;
  }

  const { rows } = await query(
    `INSERT INTO hospitals (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, password_hash, created_at`,
    [name, email, passwordHash]
  );
  return rows[0] as Hospital;
}

// ── createApiKey ─────────────────────────────────────────────
export async function createApiKey(
  hospitalId: string,
  apiKey: string
): Promise<HospitalApiKey> {
  if (DATA_LAYER === "fake") {
    const key: HospitalApiKey = {
      id: uuidv4(),
      hospital_id: hospitalId,
      api_key: apiKey,
      created_at: new Date().toISOString(),
    };
    fakeApiKeys.push(key);
    return key;
  }

  const { rows } = await query(
    `INSERT INTO hospital_api_keys (hospital_id, api_key)
     VALUES ($1, $2)
     RETURNING id, hospital_id, api_key, created_at`,
    [hospitalId, apiKey]
  );
  return rows[0] as HospitalApiKey;
}

// ── findApiKey ───────────────────────────────────────────────
export async function findApiKey(
  apiKey: string
): Promise<{ hospital_id: string } | null> {
  if (DATA_LAYER === "fake") {
    await ensureDemoHospital();
    const found = fakeApiKeys.find((k) => k.api_key === apiKey);
    return found ? { hospital_id: found.hospital_id } : null;
  }

  const { rows } = await query(
    "SELECT hospital_id FROM hospital_api_keys WHERE api_key = $1",
    [apiKey]
  );
  return rows[0] || null;
}
