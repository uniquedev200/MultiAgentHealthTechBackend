import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import type { Case, Resource, ResourceDependency, Allocation, Bid, AuditLogEntry, Emergency, AllocationApprovalStatus } from "./types";

const HOSP_A = "11111111-1111-1111-1111-111111111111";
const HOSP_B = "22222222-2222-2222-2222-222222222222";

// ── Fake in-memory store ──────────────────────────────────────
const fakeCases: Case[] = [
  {
    id: "case-001",
    hospital_id: HOSP_A,
    emergency_id: "emo-001",
    acuity_score: 4,
    status: "pending",
    required_resource_types: ["icu_bed", "staff"],
    created_at: new Date().toISOString(),
  },
  {
    id: "case-002",
    hospital_id: HOSP_A,
    emergency_id: "emo-001",
    acuity_score: 2,
    status: "pending",
    required_resource_types: ["er_bay"],
    created_at: new Date().toISOString(),
  },
];

const fakeResources: Resource[] = [
  {
    id: "res-001",
    hospital_id: HOSP_A,
    type: "icu_bed",
    label: "ICU Bed A",
    status: "available",
    department: "ICU",
    metadata: { ventilator: true },
  },
  {
    id: "res-002",
    hospital_id: HOSP_A,
    type: "er_bay",
    label: "ER Bay 1",
    status: "available",
    department: "Emergency",
    metadata: { beds: 2 },
  },
  {
    id: "res-003",
    hospital_id: HOSP_A,
    type: "staff",
    label: "Dr. Smith",
    status: "available",
    department: "Emergency",
    metadata: { specialty: "trauma" },
  },
  {
    id: "res-b01",
    hospital_id: HOSP_B,
    type: "icu_bed",
    label: "ICU Bed B",
    status: "available",
    department: "ICU",
    metadata: { ventilator: false },
  },
  {
    id: "res-b02",
    hospital_id: HOSP_B,
    type: "er_bay",
    label: "ER Bay B",
    status: "available",
    department: "Emergency",
    metadata: { beds: 3 },
  },
];

const fakeDependencies: ResourceDependency[] = [
  {
    id: "dep-001",
    resource_id: "res-001",
    depends_on_resource_id: "res-003",
    relation: "or_slot_requires_staff",
  },
];

const fakeAllocations: Allocation[] = [];

const fakeBids: Bid[] = [];

const fakeAuditLog: AuditLogEntry[] = [];

const fakeEmergencies: Emergency[] = [
  {
    id: "emo-001",
    hospital_id: HOSP_A,
    scope: "mass",
    status: "active",
    department_reach: ["Surgery", "Emergency", "ICU"],
    declared_at: new Date().toISOString(),
    resolved_at: null,
  },
];

// ── SSE client store (shared) ─────────────────────────────────
export type SSEClient = { id: string; res: import("express").Response };
export const sseClients = new Map<string, SSEClient[]>();

// ── Core function 1: loadState ────────────────────────────────
export async function loadState(
  emergencyId: string,
  hospitalId: string
): Promise<{ cases: Case[]; resources: Resource[]; dependencies: ResourceDependency[]; allocations: Allocation[] }> {
  const caseIds = fakeCases
    .filter((c) => c.emergency_id === emergencyId && c.hospital_id === hospitalId)
    .map((c) => c.id);
  return {
    cases: fakeCases.filter(
      (c) => c.emergency_id === emergencyId && c.hospital_id === hospitalId
    ),
    resources: fakeResources.filter((r) => r.hospital_id === hospitalId),
    dependencies: fakeDependencies,
    allocations: fakeAllocations.filter(
      (a) => caseIds.includes(a.case_id) && a.hospital_id === hospitalId
    ),
  };
}

// ── Core function 2b: saveBids ────────────────────────────────
export async function saveBids(
  roundId: string,
  bids: Bid[],
  hospitalId: string
): Promise<void> {
  for (const bid of bids) {
    fakeBids.push({
      ...bid,
      id: bid.id || uuidv4(),
      hospital_id: hospitalId,
      round_id: roundId,
      created_at: bid.created_at || new Date().toISOString(),
    });
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
): Promise<Allocation[]> {
  const saved: Allocation[] = [];
  for (const alloc of allocations) {
    const id = alloc.id || uuidv4();
    alloc.id = id;
    const entry: Allocation = {
      ...alloc,
      hospital_id: hospitalId,
      round_id: roundId,
      explanation,
      approval_status: "pending",
      created_at: alloc.created_at || new Date().toISOString(),
    };
    fakeAllocations.push(entry);
    saved.push(entry);
  }
  console.log(
    `[saveResult] Round ${roundId}: saved ${allocations.length} allocation(s) for hospital ${hospitalId}`
  );

  // Write audit log entry
  const auditPayload = {
    roundId,
    allocations: allocations.map((a) => ({
      caseId: a.case_id,
      resourceId: a.resource_id,
    })),
    explanation,
  };
  const prevHash = fakeAuditLog.length > 0 ? fakeAuditLog[fakeAuditLog.length - 1].hash : null;
  const hash = createHash("sha256")
    .update(JSON.stringify(auditPayload) + (prevHash || ""))
    .digest("hex");
  fakeAuditLog.push({
    id: `audit-${Date.now()}`,
    hospital_id: hospitalId,
    event_type: "round_saved",
    payload: auditPayload,
    prev_hash: prevHash,
    hash,
    created_at: new Date().toISOString(),
  });

  // Mark allocated cases
  const allocatedCaseIds = new Set(allocations.map((a) => a.case_id));
  for (const c of fakeCases) {
    if (allocatedCaseIds.has(c.id) && c.hospital_id === hospitalId) {
      c.status = "allocated";
    }
  }

  // Mark allocated resources
  const allocatedResourceIds = new Set(allocations.map((a) => a.resource_id));
  for (const r of fakeResources) {
    if (allocatedResourceIds.has(r.id) && r.hospital_id === hospitalId) {
      r.status = "occupied";
    }
  }

  // Check if any emergency has zero pending cases → auto-resolve
  const emergencyIds = new Set<string>();
  for (const c of fakeCases) {
    if (allocatedCaseIds.has(c.id) && c.hospital_id === hospitalId) {
      emergencyIds.add(c.emergency_id);
    }
  }

  for (const eid of emergencyIds) {
    const hasPending = fakeCases.some(
      (c) =>
        c.emergency_id === eid &&
        c.status === "pending" &&
        c.hospital_id === hospitalId
    );
    if (!hasPending) {
      const emergency = fakeEmergencies.find(
        (e) => e.id === eid && e.hospital_id === hospitalId
      );
      if (emergency && emergency.status === "active") {
        emergency.status = "resolved";
        emergency.resolved_at = new Date().toISOString();
        broadcast(eid, "emergency_resolved", emergency);
        console.log(
          `[saveResult] Emergency ${eid} auto-resolved — no pending cases remaining`
        );
      }
    }
  }

  return saved;
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

// ── getEmergency ──────────────────────────────────────────────
export async function getEmergency(
  emergencyId: string,
  hospitalId: string
): Promise<Emergency | null> {
  return (
    fakeEmergencies.find(
      (e) => e.id === emergencyId && e.hospital_id === hospitalId
    ) || null
  );
}

export async function getEmergencies(
  hospitalId: string
): Promise<Emergency[]> {
  return fakeEmergencies
    .filter((e) => e.hospital_id === hospitalId)
    .sort((a, b) => new Date(b.declared_at).getTime() - new Date(a.declared_at).getTime());
}

// ── resolveEmergency ──────────────────────────────────────────
export async function resolveEmergency(
  emergencyId: string,
  hospitalId: string
): Promise<void> {
  const emergency = fakeEmergencies.find(
    (e) => e.id === emergencyId && e.hospital_id === hospitalId
  );
  if (!emergency)
    throw new Error(
      `resolveEmergency: emergency ${emergencyId} not found for hospital ${hospitalId}`
    );
  emergency.status = "resolved";
  emergency.resolved_at = new Date().toISOString();
}

// ── updateEmergencyStatus ─────────────────────────────────────
export async function updateEmergencyStatus(
  emergencyId: string,
  status: string,
  hospitalId: string
): Promise<void> {
  const emergency = fakeEmergencies.find(
    (e) => e.id === emergencyId && e.hospital_id === hospitalId
  );
  if (!emergency) return;
  emergency.status = status as Emergency["status"];
  if (status === "active") emergency.resolved_at = null;
  else emergency.resolved_at = new Date().toISOString();
}

// ── createEmergency ───────────────────────────────────────────
export async function createEmergency(
  scope: string,
  department_reach: string[],
  hospitalId: string
): Promise<Emergency> {
  const emergency: Emergency = {
    id: `emo-${Date.now()}`,
    hospital_id: hospitalId,
    scope: scope as Emergency["scope"],
    status: "active",
    department_reach,
    declared_at: new Date().toISOString(),
    resolved_at: null,
  };
  fakeEmergencies.push(emergency);
  return emergency;
}

// ── createCase ────────────────────────────────────────────────
export async function createCase(
  emergencyId: string,
  acuityScore: number,
  requiredResourceTypes: string[],
  hospitalId: string
): Promise<Case> {
  const newCase: Case = {
    id: `case-${Date.now()}`,
    hospital_id: hospitalId,
    emergency_id: emergencyId,
    acuity_score: acuityScore,
    status: "pending",
    required_resource_types: requiredResourceTypes,
    created_at: new Date().toISOString(),
  };
  fakeCases.push(newCase);
  return newCase;
}

// ── listResources ─────────────────────────────────────────────
export async function listResources(
  hospitalId: string
): Promise<Resource[]> {
  return fakeResources.filter((r) => r.hospital_id === hospitalId);
}

// ── resetResources ────────────────────────────────────────────
export async function resetResources(
  hospitalId: string
): Promise<{ resourcesReset: number; casesReverted: number; allocationsCleared: number }> {
  let resourcesReset = 0;
  for (const r of fakeResources) {
    if (r.hospital_id === hospitalId && r.status === "occupied") {
      r.status = "available";
      resourcesReset++;
    }
  }
  let casesReverted = 0;
  for (const c of fakeCases) {
    if (c.hospital_id === hospitalId && c.status === "allocated") {
      c.status = "pending";
      casesReverted++;
    }
  }
  const before = fakeAllocations.length;
  for (let i = fakeAllocations.length - 1; i >= 0; i--) {
    if (fakeAllocations[i].hospital_id === hospitalId) {
      fakeAllocations.splice(i, 1);
    }
  }
  return { resourcesReset, casesReverted, allocationsCleared: before - fakeAllocations.length };
}

// ── updateResourceStatus ──────────────────────────────────────
export async function updateResourceStatus(
  resourceId: string,
  status: string,
  hospitalId: string
): Promise<Resource | null> {
  const resource = fakeResources.find(
    (r) => r.id === resourceId && r.hospital_id === hospitalId
  );
  if (!resource) return null;
  resource.status = status as ResourceStatus;
  return resource;
}

// ── getRoundDetails ───────────────────────────────────────────
export async function getRoundDetails(
  roundId: string,
  hospitalId: string
): Promise<{ bids: Bid[]; allocations: Allocation[] }> {
  return {
    bids: fakeBids.filter(
      (b) => b.round_id === roundId && b.hospital_id === hospitalId
    ),
    allocations: fakeAllocations.filter(
      (a) => a.round_id === roundId && a.hospital_id === hospitalId
    ),
  };
}

// ── getAuditLog ───────────────────────────────────────────────
export async function getAuditLog(
  page: number,
  limit: number,
  hospitalId: string
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const filtered = fakeAuditLog.filter((e) => e.hospital_id === hospitalId);
  const offset = (page - 1) * limit;
  return {
    entries: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

type ResourceStatus = "available" | "occupied" | "reserved" | "offline";

// ── HITL: Allocation approval ─────────────────────────────────
export async function updateAllocationApproval(
  allocationId: string,
  approvalStatus: AllocationApprovalStatus,
  hospitalId: string
): Promise<Allocation | null> {
  const alloc = fakeAllocations.find(
    (a) => a.id === allocationId && a.hospital_id === hospitalId
  );
  if (!alloc) return null;
  alloc.approval_status = approvalStatus;

  if (approvalStatus === "rejected") {
    const resource = fakeResources.find(
      (r) => r.id === alloc.resource_id && r.hospital_id === hospitalId
    );
    if (resource) resource.status = "available";

    const c = fakeCases.find(
      (ca) => ca.id === alloc.case_id && ca.hospital_id === hospitalId
    );
    if (c) c.status = "pending";

    // Reactivate emergency if it was auto-resolved
    if (c) {
      const emergency = fakeEmergencies.find(
        (e) => e.id === c.emergency_id && e.hospital_id === hospitalId
      );
      if (emergency && emergency.status === "resolved") {
        emergency.status = "active";
        emergency.resolved_at = null;
      }
    }
  }

  return alloc;
}

// ── LLM credential management (in-memory) ────────────────────
import { encryptCredential, decryptCredential } from "../credentials";
import type { LlmProvider } from "./types";

const fakeLlmCredentials: Array<{ hospital_id: string; provider: LlmProvider; api_key_encrypted: string }> = [];

export async function upsertLLMKey(hospitalId: string, provider: LlmProvider, apiKey: string): Promise<void> {
  const encrypted = encryptCredential(apiKey);
  const existing = fakeLlmCredentials.find(c => c.hospital_id === hospitalId && c.provider === provider);
  if (existing) {
    existing.api_key_encrypted = encrypted;
  } else {
    fakeLlmCredentials.push({ hospital_id: hospitalId, provider, api_key_encrypted: encrypted });
  }
}

export async function getLLMKeyStatus(hospitalId: string): Promise<Record<string, { configured: boolean }>> {
  return {
    groq: { configured: fakeLlmCredentials.some(c => c.hospital_id === hospitalId && c.provider === "groq") },
    mistral: { configured: fakeLlmCredentials.some(c => c.hospital_id === hospitalId && c.provider === "mistral") },
  };
}

export async function deleteLLMKey(hospitalId: string, provider: LlmProvider): Promise<void> {
  const idx = fakeLlmCredentials.findIndex(c => c.hospital_id === hospitalId && c.provider === provider);
  if (idx !== -1) fakeLlmCredentials.splice(idx, 1);
}

export async function getLLMKeys(hospitalId: string): Promise<{ groqKey: string; mistralKey: string }> {
  const groqCred = fakeLlmCredentials.find(c => c.hospital_id === hospitalId && c.provider === "groq");
  const mistralCred = fakeLlmCredentials.find(c => c.hospital_id === hospitalId && c.provider === "mistral");
  return {
    groqKey: groqCred ? decryptCredential(groqCred.api_key_encrypted) : (process.env.GROQ_API_KEY || ""),
    mistralKey: mistralCred ? decryptCredential(mistralCred.api_key_encrypted) : (process.env.MISTRAL_API_KEY || ""),
  };
}
