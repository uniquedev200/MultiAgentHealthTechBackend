import { v4 as uuidv4 } from "uuid";
import type { Hospital, HospitalApiKey, User, UserRole } from "./types";
import { query } from "./db";
import { hashPassword } from "./password";

const DATA_LAYER = process.env.DATA_LAYER || "fake";

// ── Fake in-memory hospital store ─────────────────────────────
const fakeHospitals: Hospital[] = [];
const fakeApiKeys: HospitalApiKey[] = [];
const fakeUsers: User[] = [];

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
  // Seed demo users
  if (fakeUsers.filter(u => u.hospital_id === DEMO_HOSPITAL_ID).length === 0) {
    await seedDemoUsers(DEMO_HOSPITAL_ID, hash);
  }
}

async function seedDemoUsers(hospitalId: string, passwordHash: string): Promise<void> {
  const roles: { role: UserRole; name: string; email: string }[] = [
    { role: "admin", name: "Dr. Admin", email: "admin@generalhospital.demo" },
    { role: "department_head", name: "Dr. Sarah Chen", email: "sarah@generalhospital.demo" },
    { role: "doctor", name: "Dr. James Wilson", email: "james@generalhospital.demo" },
    { role: "nurse", name: "Nurse Emily Park", email: "emily@generalhospital.demo" },
    { role: "triage_officer", name: "Triage Officer Lee", email: "lee@generalhospital.demo" },
  ];
  for (const u of roles) {
    fakeUsers.push({
      id: uuidv4(),
      hospital_id: hospitalId,
      email: u.email,
      full_name: u.name,
      role: u.role,
      password_hash: passwordHash,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
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
    // Auto-seed demo users for new hospital
    await seedDemoUsers(hospital.id, passwordHash);
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

// ── User CRUD ────────────────────────────────────────────────

export async function findUserByEmail(
  hospitalId: string,
  email: string
): Promise<User | null> {
  if (DATA_LAYER === "fake") {
    return fakeUsers.find(u => u.hospital_id === hospitalId && u.email === email) || null;
  }
  const { rows } = await query(
    "SELECT * FROM users WHERE hospital_id = $1 AND email = $2",
    [hospitalId, email]
  );
  return rows[0] || null;
}

export async function findUserByEmailGlobal(
  email: string
): Promise<User | null> {
  if (DATA_LAYER === "fake") {
    return fakeUsers.find(u => u.email === email) || null;
  }
  const { rows } = await query(
    "SELECT * FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  return rows[0] || null;
}

export async function findUserById(
  userId: string
): Promise<User | null> {
  if (DATA_LAYER === "fake") {
    return fakeUsers.find(u => u.id === userId) || null;
  }
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [userId]);
  return rows[0] || null;
}

export async function listUsers(
  hospitalId: string
): Promise<Omit<User, "password_hash">[]> {
  if (DATA_LAYER === "fake") {
    return fakeUsers
      .filter(u => u.hospital_id === hospitalId)
      .map(({ password_hash, ...rest }) => rest);
  }
  const { rows } = await query(
    "SELECT id, hospital_id, email, full_name, role, is_active, created_at, updated_at FROM users WHERE hospital_id = $1 ORDER BY created_at DESC",
    [hospitalId]
  );
  return rows;
}

export async function createUser(
  hospitalId: string,
  email: string,
  fullName: string,
  role: UserRole,
  password: string
): Promise<User> {
  const pwHash = await hashPassword(password);
  if (DATA_LAYER === "fake") {
    const user: User = {
      id: uuidv4(),
      hospital_id: hospitalId,
      email,
      full_name: fullName,
      role,
      password_hash: pwHash,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fakeUsers.push(user);
    return user;
  }
  const { rows } = await query(
    `INSERT INTO users (hospital_id, email, full_name, role, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [hospitalId, email, fullName, role, pwHash]
  );
  return rows[0] as User;
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
  hospitalId: string
): Promise<User | null> {
  if (DATA_LAYER === "fake") {
    const user = fakeUsers.find(u => u.id === userId && u.hospital_id === hospitalId);
    if (!user) return null;
    user.role = role;
    user.updated_at = new Date().toISOString();
    return user;
  }
  const { rows } = await query(
    `UPDATE users SET role = $1, updated_at = now() WHERE id = $2 AND hospital_id = $3 RETURNING *`,
    [role, userId, hospitalId]
  );
  return rows[0] || null;
}

export async function deleteUser(
  userId: string,
  hospitalId: string
): Promise<boolean> {
  if (DATA_LAYER === "fake") {
    const idx = fakeUsers.findIndex(u => u.id === userId && u.hospital_id === hospitalId);
    if (idx === -1) return false;
    fakeUsers.splice(idx, 1);
    return true;
  }
  const { rowCount } = await query(
    "DELETE FROM users WHERE id = $1 AND hospital_id = $2",
    [userId, hospitalId]
  );
  return (rowCount ?? 0) > 0;
}

// ── Auto-seed resources for new hospital ─────────────────────
const DEFAULT_RESOURCES = [
  { type: "or_slot", label: "OR Suite 1", department: "Surgery", metadata: { capacity: 1, specialty: "general" } },
  { type: "icu_bed", label: "ICU Bed 1", department: "ICU", metadata: { ventilator: true } },
  { type: "er_bay", label: "ER Bay 1", department: "Emergency", metadata: { beds: 2 } },
  { type: "staff", label: "ER Physician", department: "Emergency", metadata: { role: "physician", specialty: "emergency" } },
  { type: "equipment", label: "Ventilator", department: "ICU", metadata: { model: "standard" } },
];

export async function seedHospitalDefaults(hospitalId: string): Promise<void> {
  if (DATA_LAYER === "fake") {
    for (const r of DEFAULT_RESOURCES) {
      fakeResources.push({
        id: uuidv4(),
        hospital_id: hospitalId,
        type: r.type as any,
        label: r.label,
        status: "available",
        department: r.department,
        metadata: r.metadata,
      });
    }
    return;
  }
  for (const r of DEFAULT_RESOURCES) {
    await query(
      `INSERT INTO resources (hospital_id, type, label, status, department, metadata)
       VALUES ($1, $2, $3, 'available', $4, $5)`,
      [hospitalId, r.type, r.label, r.department, JSON.stringify(r.metadata)]
    );
  }
}

// Fake resources store for fake mode auto-seed
import type { Resource } from "./types";
const fakeResources: Resource[] = [];
