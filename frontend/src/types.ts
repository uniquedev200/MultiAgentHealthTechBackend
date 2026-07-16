export type EmergencyScope = "individual" | "mass";
export type EmergencyStatus = "active" | "resolved";
export type CaseStatus = "pending" | "allocated" | "discharged";
export type ResourceType = "or_slot" | "icu_bed" | "staff" | "equipment" | "er_bay";
export type ResourceStatus = "available" | "occupied" | "reserved" | "offline";
export type AllocationApprovalStatus = "pending" | "approved" | "rejected";

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

export interface EmergencyState {
  cases: Case[];
  resources: Resource[];
  dependencies: ResourceDependency[];
  allocations: Allocation[];
}

export interface RoundDetails {
  bids: Bid[];
  allocations: Allocation[];
}

export interface EmergencyComment {
  id: string;
  emergency_id: string;
  hospital_id: string;
  author: string;
  content: string;
  created_at: string;
}
