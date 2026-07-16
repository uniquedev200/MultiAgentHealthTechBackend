import { query } from "../db";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { encryptCredential, decryptCredential } from "../credentials";
import type {
  Case,
  Resource,
  ResourceDependency,
  Allocation,
  Bid,
  AuditLogEntry,
  Emergency,
  LlmProvider,
} from "../types";

// ── SSE client store (shared across fake & live) ──────────────
export type SSEClient = { id: string; res: import("express").Response };
export const sseClients = new Map<string, SSEClient[]>();

// ── Core function 1: loadState ────────────────────────────────
export async function loadState(
  emergencyId: string,
  hospitalId: string
): Promise<{ cases: Case[]; resources: Resource[]; dependencies: ResourceDependency[] }> {
  const [casesRes, resourcesRes, depsRes] = await Promise.all([
    query(
      "SELECT * FROM cases WHERE emergency_id = $1 AND hospital_id = $2 ORDER BY created_at DESC",
      [emergencyId, hospitalId]
    ),
    query(
      "SELECT * FROM resources WHERE hospital_id = $1 ORDER BY type ASC",
      [hospitalId]
    ),
    query("SELECT * FROM resource_dependencies", []),
  ]);

  return {
    cases: casesRes.rows as Case[],
    resources: resourcesRes.rows as Resource[],
    dependencies: depsRes.rows as ResourceDependency[],
  };
}

// ── Core function 2b: saveBids ────────────────────────────────
export async function saveBids(
  roundId: string,
  bids: Bid[],
  hospitalId: string
): Promise<void> {
  for (const b of bids) {
    await query(
      `INSERT INTO bids (id, hospital_id, round_id, case_id, resource_id, bid_score, reasoning, conditions, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        b.id || uuidv4(),
        hospitalId,
        roundId,
        b.case_id,
        b.resource_id,
        b.bid_score,
        b.reasoning || "",
        b.conditions || [],
        b.created_at || new Date().toISOString(),
      ]
    );
  }

  console.log(
    `[saveBids] Round ${roundId}: saved ${bids.length} bid(s) for hospital ${hospitalId}`
  );
}

// ── Core function 2: saveResult ───────────────────────────────
export async function saveResult(
  roundId: string,
  allocations: Allocation[],
  explanation: string,
  hospitalId: string
): Promise<void> {
  // 1. Insert allocations
  for (const a of allocations) {
    await query(
      `INSERT INTO allocations (id, hospital_id, case_id, resource_id, round_id, explanation, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        a.id || uuidv4(),
        hospitalId,
        a.case_id,
        a.resource_id,
        roundId,
        explanation,
        a.created_at || new Date().toISOString(),
      ]
    );
  }

  // 2. Update case statuses to "allocated"
  const caseIds = [...new Set(allocations.map((a) => a.case_id))];
  if (caseIds.length > 0) {
    await query(
      `UPDATE cases SET status = 'allocated' WHERE id = ANY($1::uuid[]) AND hospital_id = $2`,
      [caseIds, hospitalId]
    );
  }

  // 3. Update resource statuses to "occupied"
  const resourceIds = [...new Set(allocations.map((a) => a.resource_id))];
  if (resourceIds.length > 0) {
    await query(
      `UPDATE resources SET status = 'occupied' WHERE id = ANY($1::uuid[]) AND hospital_id = $2`,
      [resourceIds, hospitalId]
    );
  }

  // 4. Write audit log entry
  const payload = {
    roundId,
    allocations: allocations.map((a) => ({
      caseId: a.case_id,
      resourceId: a.resource_id,
    })),
    explanation,
  };

  const prevHash = await getLastAuditHash(hospitalId);
  const hash = createHash("sha256")
    .update(JSON.stringify(payload) + (prevHash || ""))
    .digest("hex");

  await query(
    `INSERT INTO audit_log (id, hospital_id, event_type, payload, prev_hash, hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      uuidv4(),
      hospitalId,
      "round_saved",
      JSON.stringify(payload),
      prevHash,
      hash,
      new Date().toISOString(),
    ]
  );

  console.log(
    `[saveResult] Round ${roundId}: saved ${allocations.length} allocation(s) for hospital ${hospitalId}`
  );

  // 5. Check if any emergency has zero pending cases → auto-resolve
  if (caseIds.length > 0) {
    const caseRows = await query(
      "SELECT id, emergency_id FROM cases WHERE id = ANY($1::uuid[]) AND hospital_id = $2",
      [caseIds, hospitalId]
    );

    const emergencyIds = [
      ...new Set(caseRows.rows.map((c: any) => c.emergency_id)),
    ];

    for (const eid of emergencyIds) {
      const pendingCount = await query(
        "SELECT count(*) FROM cases WHERE emergency_id = $1 AND hospital_id = $2 AND status = 'pending'",
        [eid, hospitalId]
      );

      if (parseInt(pendingCount.rows[0].count) === 0) {
        const emergencyRes = await query(
          "SELECT * FROM emergencies WHERE id = $1 AND hospital_id = $2",
          [eid, hospitalId]
        );

        const emergency = emergencyRes.rows[0];
        if (emergency && emergency.status === "active") {
          await query(
            "UPDATE emergencies SET status = 'resolved', resolved_at = $1 WHERE id = $2 AND hospital_id = $3",
            [new Date().toISOString(), eid, hospitalId]
          );

          broadcast(eid, "emergency_resolved", {
            ...emergency,
            status: "resolved",
            resolved_at: new Date().toISOString(),
          });

          console.log(
            `[saveResult] Emergency ${eid} auto-resolved — no pending cases remaining`
          );
        }
      }
    }
  }
}

// ── Core function 3: broadcast ────────────────────────────────
export function broadcast(
  emergencyId: string,
  eventType: string,
  payload: object
): void {
  const clients = sseClients.get(emergencyId);
  if (!clients || clients.length === 0) {
    console.log(
      `[broadcast] No SSE clients for emergency ${emergencyId}, event "${eventType}" dropped`
    );
    return;
  }
  const data = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.res.write(data);
  }
  console.log(
    `[broadcast] Sent "${eventType}" to ${clients.length} client(s) for emergency ${emergencyId}`
  );
}

// ── Helper: get last audit log hash (per hospital) ────────────
async function getLastAuditHash(hospitalId: string): Promise<string | null> {
  const { rows } = await query(
    "SELECT hash FROM audit_log WHERE hospital_id = $1 ORDER BY created_at DESC LIMIT 1",
    [hospitalId]
  );
  return rows[0]?.hash || null;
}

// ── getEmergency ──────────────────────────────────────────────
export async function getEmergency(
  emergencyId: string,
  hospitalId: string
): Promise<Emergency | null> {
  const { rows } = await query(
    "SELECT * FROM emergencies WHERE id = $1 AND hospital_id = $2",
    [emergencyId, hospitalId]
  );
  return rows[0] || null;
}

// ── resolveEmergency ──────────────────────────────────────────
export async function resolveEmergency(
  emergencyId: string,
  hospitalId: string
): Promise<void> {
  await query(
    "UPDATE emergencies SET status = 'resolved', resolved_at = $1 WHERE id = $2 AND hospital_id = $3",
    [new Date().toISOString(), emergencyId, hospitalId]
  );
}

// ── createEmergency ───────────────────────────────────────────
export async function createEmergency(
  scope: string,
  department_reach: string[],
  hospitalId: string
): Promise<Emergency> {
  const { rows } = await query(
    `INSERT INTO emergencies (scope, department_reach, hospital_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [scope, department_reach, hospitalId]
  );
  return rows[0] as Emergency;
}

// ── createCase ────────────────────────────────────────────────
export async function createCase(
  emergencyId: string,
  acuityScore: number,
  requiredResourceTypes: string[],
  hospitalId: string
): Promise<Case> {
  const { rows } = await query(
    `INSERT INTO cases (emergency_id, acuity_score, required_resource_types, hospital_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [emergencyId, acuityScore, requiredResourceTypes, hospitalId]
  );
  return rows[0] as Case;
}

// ── listResources ─────────────────────────────────────────────
export async function listResources(
  hospitalId: string
): Promise<Resource[]> {
  const { rows } = await query(
    "SELECT * FROM resources WHERE hospital_id = $1 ORDER BY type ASC",
    [hospitalId]
  );
  return rows as Resource[];
}

// ── updateResourceStatus ──────────────────────────────────────
export async function updateResourceStatus(
  resourceId: string,
  status: string,
  hospitalId: string
): Promise<Resource | null> {
  const { rows } = await query(
    `UPDATE resources SET status = $1 WHERE id = $2 AND hospital_id = $3 RETURNING *`,
    [status, resourceId, hospitalId]
  );
  return rows[0] || null;
}

// ── getRoundDetails ───────────────────────────────────────────
export async function getRoundDetails(
  roundId: string,
  hospitalId: string
): Promise<{ bids: Bid[]; allocations: Allocation[] }> {
  const [bidsRes, allocRes] = await Promise.all([
    query(
      "SELECT * FROM bids WHERE round_id = $1 AND hospital_id = $2 ORDER BY bid_score DESC",
      [roundId, hospitalId]
    ),
    query(
      "SELECT * FROM allocations WHERE round_id = $1 AND hospital_id = $2",
      [roundId, hospitalId]
    ),
  ]);

  return {
    bids: bidsRes.rows as Bid[],
    allocations: allocRes.rows as Allocation[],
  };
}

// ── getAuditLog ───────────────────────────────────────────────
export async function getAuditLog(
  page: number,
  limit: number,
  hospitalId: string
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const offset = (page - 1) * limit;

  const [entriesRes, countRes] = await Promise.all([
    query(
      "SELECT * FROM audit_log WHERE hospital_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [hospitalId, limit, offset]
    ),
    query(
      "SELECT count(*) FROM audit_log WHERE hospital_id = $1",
      [hospitalId]
    ),
  ]);

  return {
    entries: entriesRes.rows as AuditLogEntry[],
    total: parseInt(countRes.rows[0].count) || 0,
  };
}

// ── LLM credential management ────────────────────────────────
export async function upsertLLMKey(hospitalId: string, provider: LlmProvider, apiKey: string): Promise<void> {
  const encrypted = encryptCredential(apiKey);
  await query(
    `INSERT INTO hospital_llm_credentials (hospital_id, provider, api_key_encrypted, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (hospital_id, provider)
     DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, updated_at = now()`,
    [hospitalId, provider, encrypted]
  );
}

export async function getLLMKeyStatus(hospitalId: string): Promise<Record<string, { configured: boolean }>> {
  const { rows } = await query(
    "SELECT provider FROM hospital_llm_credentials WHERE hospital_id = $1",
    [hospitalId]
  );
  const providers = new Set(rows.map((r: any) => r.provider));
  return {
    groq: { configured: providers.has("groq") },
    mistral: { configured: providers.has("mistral") },
  };
}

export async function deleteLLMKey(hospitalId: string, provider: LlmProvider): Promise<void> {
  await query(
    "DELETE FROM hospital_llm_credentials WHERE hospital_id = $1 AND provider = $2",
    [hospitalId, provider]
  );
}

export async function getLLMKeys(hospitalId: string): Promise<{ groqKey: string; mistralKey: string }> {
  const { rows } = await query(
    "SELECT provider, api_key_encrypted FROM hospital_llm_credentials WHERE hospital_id = $1",
    [hospitalId]
  );
  const credMap = new Map(rows.map((r: any) => [r.provider, r.api_key_encrypted]));
  return {
    groqKey: credMap.has("groq") ? decryptCredential(credMap.get("groq")) : (process.env.GROQ_API_KEY || ""),
    mistralKey: credMap.has("mistral") ? decryptCredential(credMap.get("mistral")) : (process.env.MISTRAL_API_KEY || ""),
  };
}
