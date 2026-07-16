const BASE = process.env.BASE_URL || "https://multiagenthealthtechbackend.onrender.com";
const DEMO_KEY = process.env.API_KEY || "gh-live-key-001";

let API_KEY = DEMO_KEY;
let HOSPITAL_ID = "";
let EMERGENCY_ID = "";
let CASE_IDS = [];

function headers() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

async function api(method, path, body, retries = 2) {
  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);
  const url = `${BASE}${path}`;
  console.log(`\n→ ${method} ${path}`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, { ...opts, signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      const result = { status: res.status, ok: res.ok, data };
      const icon = res.ok ? "✓" : "✗";
      console.log(`[${icon}] HTTP ${res.status}`);
      console.log(JSON.stringify(data, null, 2));
      return result;
    } catch (e) {
      if (attempt < retries) {
        console.log(`  Retry ${attempt + 1}/${retries} (${e.message?.slice(0, 50)})...`);
        await sleep(3000);
      } else {
        console.log(`[✗] FAILED: ${e.message}`);
        return { status: 0, ok: false, data: { error: e.message } };
      }
    }
  }
}

function log(heading) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${heading}`);
  console.log(`${"=".repeat(60)}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ════════════════════════════════════════════════════════════════
//  TEST RUNNER
// ════════════════════════════════════════════════════════════════

async function run() {
  console.log(`\nTarget: ${BASE}`);
  console.log(`Starting API test run...\n`);

  // ── 1. Health ─────────────────────────────────────────────
  log("1. GET /health (no auth)");
  show("Health check", await api("GET", "/health"));

  // ── 2. Register ───────────────────────────────────────────
  log("2. POST /hospitals/register (no auth)");
  const reg = await api("POST", "/hospitals/register", {
    name: "API Test Hospital",
    email: `test-${Date.now()}@api-test.com`,
    password: "test123",
  });
  show("Register hospital", reg);
  if (reg.ok) {
    API_KEY = reg.data.api_key;
    HOSPITAL_ID = reg.data.hospital_id;
    console.log(`\n  → Using new API key: ${API_KEY}`);
    console.log(`  → Hospital ID: ${HOSPITAL_ID}`);
  }

  // ── 3. Login ──────────────────────────────────────────────
  log("3. POST /auth/login (no auth)");
  show("Login", await api("POST", "/auth/login", {
    email: "admin@generalhospital.demo",
    password: "demo1234",
  }));

  // Switch back to demo key for remaining tests
  API_KEY = DEMO_KEY;
  console.log(`\n  → Switched back to demo key: ${API_KEY}`);

  // ── 4. Resources ──────────────────────────────────────────
  log("4. GET /resources");
  const resources = await api("GET", "/resources");
  show("List resources", resources);

  // ── 5. LLM Keys ──────────────────────────────────────────
  log("5. GET /settings/llm-keys");
  show("LLM key status", await api("GET", "/settings/llm-keys"));

  // ── 6. Audit Log ──────────────────────────────────────────
  log("6. GET /audit-log");
  show("Audit log", await api("GET", "/audit-log?limit=3"));

  // ── 7. Declare Emergency ──────────────────────────────────
  log("7. POST /emergencies");
  const emergency = await api("POST", "/emergencies", {
    scope: "individual",
    department_reach: ["Emergency", "ICU", "Surgery"],
  });
  show("Declare emergency", emergency);
  if (emergency.ok) {
    EMERGENCY_ID = emergency.data.id;
    console.log(`\n  → Emergency ID: ${EMERGENCY_ID}`);
  }

  // ── 8. Get Emergency State ────────────────────────────────
  log("8. GET /emergencies/:id");
  show("Emergency state", await api("GET", `/emergencies/${EMERGENCY_ID}`));

  // ── 9. Add Cases ──────────────────────────────────────────
  log("9. POST /emergencies/:id/cases (3 cases, triggers negotiation)");

  const casePayloads = [
    { acuity_score: 5, required_resource_types: ["icu_bed", "staff"] },
    { acuity_score: 3, required_resource_types: ["er_bay"] },
    { acuity_score: 4, required_resource_types: ["or_slot", "equipment"] },
  ];

  for (const payload of casePayloads) {
    const c = await api("POST", `/emergencies/${EMERGENCY_ID}/cases`, payload);
    show(`Case (acuity=${payload.acuity_score})`, c);
    if (c.ok) CASE_IDS.push(c.data.id);
    await sleep(500);
  }

  console.log(`\n  → Case IDs: ${CASE_IDS.join(", ")}`);
  console.log(`  → Waiting 15s for Groq negotiation to complete...`);
  await sleep(15000);

  // ── 10. Updated State ─────────────────────────────────────
  log("10. GET /emergencies/:id (after negotiation)");
  const state = await api("GET", `/emergencies/${EMERGENCY_ID}`);
  show("Emergency state (post-negotiation)", state);

  if (state.ok) {
    console.log(`\n  ┌──────────────────────────────────────────────────────┐`);
    console.log(`  │ CASE STATUSES                                        │`);
    console.log(`  ├──────────────────────────────────────────────────────┤`);
    for (const c of state.data.cases) {
      const icon = c.status === "allocated" ? "✓" : "○";
      console.log(`  │ ${icon} ${c.id.slice(0,8)}... │ acuity=${c.acuity_score} │ ${c.status.padEnd(10)} │ [${c.required_resource_types.join(",")}]`);
    }
    console.log(`  └──────────────────────────────────────────────────────┘`);
  }

  // ── 11. Round Details ─────────────────────────────────────
  log("11. GET /emergencies/:id/rounds/:roundId");
  const auditAfter = await api("GET", "/audit-log?limit=5");
  if (auditAfter.ok) {
    for (const entry of auditAfter.data.entries) {
      const roundId = entry.payload?.roundId;
      if (roundId) {
        const details = await api("GET", `/emergencies/${EMERGENCY_ID}/rounds/${roundId}`);
        show(`Round ${roundId.slice(0,8)}...`, details);

        if (details.ok && details.data.allocations.length > 0) {
          console.log(`\n  ┌──────────────────────────────────────────────────────┐`);
          console.log(`  │ ALLOCATIONS                                          │`);
          console.log(`  ├──────────────────────────────────────────────────────┤`);
          for (const a of details.data.allocations) {
            console.log(`  │ ${a.case_id.slice(0,8)}... → ${a.resource_id.slice(0,8)}...`);
            console.log(`  │   "${a.explanation || "no explanation"}"`);
          }
          console.log(`  └──────────────────────────────────────────────────────┘`);
        }
        break;
      }
    }
  }

  // ── 12. Patch Resource ────────────────────────────────────
  log("12. PATCH /resources/:id");
  if (resources.ok && resources.data.length > 0) {
    const resId = resources.data[0].id;
    show("Patch resource to offline", await api("PATCH", `/resources/${resId}`, { status: "offline" }));
    show("Patch resource back to available", await api("PATCH", `/resources/${resId}`, { status: "available" }));
  }

  // ── 13. LLM Keys CRUD ────────────────────────────────────
  log("13. PUT /settings/llm-keys/:provider");
  show("Set groq key", await api("PUT", "/settings/llm-keys/groq", { api_key: "gsk_test_key_123" }));

  log("13b. GET /settings/llm-keys (after set)");
  show("LLM status (after set)", await api("GET", "/settings/llm-keys"));

  log("13c. DELETE /settings/llm-keys/:provider");
  show("Delete groq key", await api("DELETE", "/settings/llm-keys/groq"));

  // ── 14. Resolve Emergency ─────────────────────────────────
  log("14. PATCH /emergencies/:id/resolve");
  show("Resolve emergency", await api("PATCH", `/emergencies/${EMERGENCY_ID}/resolve`));

  // ── 15. Verify Resolved State ─────────────────────────────
  log("15. GET /emergencies/:id (after resolve)");
  show("Resolved state", await api("GET", `/emergencies/${EMERGENCY_ID}`));

  // ── 16. Audit Log (final) ─────────────────────────────────
  log("16. GET /audit-log (final)");
  show("Final audit log", await api("GET", "/audit-log?limit=10"));

  // ── Summary ───────────────────────────────────────────────
  log("TEST COMPLETE — Summary of data shapes");
  console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │ ENDPOINT                      │ METHOD │ RETURNS            │
  ├─────────────────────────────────────────────────────────────┤
  │ /health                       │ GET    │ { status }         │
  │ /hospitals/register           │ POST   │ { hospital_id,     │
  │                               │        │   name, api_key }  │
  │ /auth/login                   │ POST   │ { token,           │
  │                               │        │   hospital_id,     │
  │                               │        │   name }           │
  │ /resources                    │ GET    │ Resource[]         │
  │ /resources/:id                │ PATCH  │ Resource           │
  │ /emergencies                  │ POST   │ Emergency          │
  │ /emergencies/:id              │ GET    │ { cases[],         │
  │                               │        │   resources[],     │
  │                               │        │   dependencies[] } │
  │ /emergencies/:id/cases        │ POST   │ Case               │
  │ /emergencies/:id/resolve      │ PATCH  │ Emergency          │
  │ /emergencies/:id/rounds/:rid  │ GET    │ { bids[],          │
  │                               │        │   allocations[] }  │
  │ /emergencies/:id/stream       │ GET    │ SSE events         │
  │ /audit-log                    │ GET    │ { entries[],       │
  │                               │        │   page, limit,     │
  │                               │        │   total }          │
  │ /settings/llm-keys            │ GET    │ { groq, mistral }  │
  │ /settings/llm-keys/:provider  │ PUT    │ { ok, provider,    │
  │                               │        │   configured }     │
  │ /settings/llm-keys/:provider  │ DELETE │ { ok, provider,    │
  │                               │        │   configured }     │
  └─────────────────────────────────────────────────────────────┘

  SSE EVENTS (via GET /emergencies/:id/stream):
  ┌─────────────────────────────────────────────────────────────┐
  │ event: connected            → { emergencyId }              │
  │ event: emergency_declared   → Emergency object             │
  │ event: case_added           → Case object                  │
  │ event: bid_submitted        → Bid object (per resource)    │
  │ event: round:completed      → { roundId, emergencyId,      │
  │                                allocations[], explanation } │
  │ event: emergency_resolved   → Emergency object             │
  │ event: resource_status_changed → Resource object           │
  └─────────────────────────────────────────────────────────────┘

  DATA TYPES:
  ┌─────────────────────────────────────────────────────────────┐
  │ Emergency:  { id, hospital_id, scope, status,              │
  │               department_reach[], declared_at, resolved_at }│
  │ Case:       { id, hospital_id, emergency_id, acuity_score, │
  │               status, required_resource_types[], created_at}│
  │ Resource:   { id, hospital_id, type, label, status,        │
  │               department, metadata{} }                     │
  │ Bid:        { id, round_id, case_id, resource_id,          │
  │               bid_score, reasoning, conditions[] }         │
  │ Allocation: { id, round_id, case_id, resource_id,          │
  │               explanation }                                │
  │ AuditLog:   { id, hospital_id, event_type, payload{},      │
  │               prev_hash, hash, created_at }                │
  └─────────────────────────────────────────────────────────────┘
  `);
}

run().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
