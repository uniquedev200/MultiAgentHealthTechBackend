import * as fake from "./fake";
import * as live from "./live";

const layer = process.env.DATA_LAYER || "fake";

if (layer === "live") {
  console.log("[data] Using LIVE Supabase data layer");
} else {
  console.log("[data] Using FAKE (in-memory) data layer");
}

const backend = layer === "live" ? live : fake;

export const loadState = backend.loadState;
export const saveResult = backend.saveResult;
export const saveBids = backend.saveBids;
export const broadcast = backend.broadcast;
export const sseClients = backend.sseClients;
export const createEmergency = backend.createEmergency;
export const createCase = backend.createCase;
export const getEmergency = backend.getEmergency;
export const getEmergencies = backend.getEmergencies;
export const resolveEmergency = backend.resolveEmergency;
export const updateEmergencyStatus = backend.updateEmergencyStatus;
export const listResources = backend.listResources;
export const updateResourceStatus = backend.updateResourceStatus;
export const resetResources = backend.resetResources;
export const getRoundDetails = backend.getRoundDetails;
export const getAuditLog = backend.getAuditLog;
export const upsertLLMKey = backend.upsertLLMKey;
export const getLLMKeyStatus = backend.getLLMKeyStatus;
export const deleteLLMKey = backend.deleteLLMKey;
export const getLLMKeys = backend.getLLMKeys;
export const updateAllocationApproval = backend.updateAllocationApproval;
export type SSEClient = fake.SSEClient;
