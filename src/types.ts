export type EmergencyScope = "individual" | "mass";
export type EmergencyStatus = "active" | "resolved";
export type CaseStatus = "pending" | "allocated" | "discharged";
export type ResourceType = "or_slot" | "icu_bed" | "staff" | "equipment" | "er_bay";
export type ResourceStatus = "available" | "occupied" | "reserved" | "offline";

export interface Hospital {
  id: string;
  name: string;
  email: string | null;
  password_hash: string | null;
  created_at: string;
}

export interface HospitalApiKey {
  id: string;
  hospital_id: string;
  api_key: string;
  created_at: string;
}

export interface Emergency {
  id: string;
  hospital_id: string;
  scope: EmergencyScope;
  status: EmergencyStatus;
  department_reach: string[];
  declared_at: string;
  resolved_at: string | null;
}

export interface Case {
  id: string;
  hospital_id: string;
  emergency_id: string;
  acuity_score: number;
  status: CaseStatus;
  required_resource_types: string[];
  created_at: string;
}

export interface Resource {
  id: string;
  hospital_id: string;
  type: ResourceType;
  label: string;
  status: ResourceStatus;
  department: string;
  metadata: Record<string, unknown>;
}

export interface ResourceDependency {
  id: string;
  resource_id: string;
  depends_on_resource_id: string;
  relation: string;
}

export interface Bid {
  id: string;
  hospital_id: string;
  round_id: string;
  case_id: string;
  resource_id: string;
  bid_score: number;
  reasoning: string;
  conditions: string[];
  created_at: string;
}

export type AllocationApprovalStatus = "pending" | "approved" | "rejected";

export interface Allocation {
  id: string;
  hospital_id: string;
  case_id: string;
  resource_id: string;
  round_id: string;
  explanation: string;
  approval_status: AllocationApprovalStatus;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  hospital_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  prev_hash: string | null;
  hash: string;
  created_at: string;
}

export type LlmProvider = "groq" | "mistral";

export interface HospitalLlmCredential {
  id: string;
  hospital_id: string;
  provider: LlmProvider;
  api_key_encrypted: string;
  created_at: string;
  updated_at: string;
}

export interface EmergencyComment {
  id: string;
  emergency_id: string;
  hospital_id: string;
  author: string;
  content: string;
  created_at: string;
}
