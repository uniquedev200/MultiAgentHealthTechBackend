export type EmergencyScope = "individual" | "mass";
export type EmergencyStatus = "active" | "resolved";
export type CaseStatus = "pending" | "allocated" | "discharged" | "approved" | "rejected";
export type ResourceType = "or_slot" | "icu_bed" | "staff" | "equipment" | "er_bay";
export type ResourceStatus = "available" | "occupied" | "reserved" | "offline";
export type AllocationApprovalStatus = "pending" | "approved" | "rejected";
export type UserRole = "admin" | "department_head" | "doctor" | "nurse" | "triage_officer" | "paramedic" | "charge_nurse";
export type PatientGender = "male" | "female" | "non-binary" | "unknown";
export type BloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown";
export type SymptomSeverity = "mild" | "moderate" | "severe" | "critical";

export interface VitalSigns {
  heart_rate?: number;
  blood_pressure?: string;
  sp_o2?: number;
  temperature?: number;
  respiratory_rate?: number;
}

export interface User {
  id: string;
  hospital_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  hospital_id: string;
  name: string;
  age: number;
  gender: PatientGender;
  blood_type: BloodType;
  medical_history: string;
  allergies: string;
  current_medications: string;
  created_at: string;
}

export interface Emergency {
  id: string;
  hospital_id: string;
  name: string;
  scope: EmergencyScope;
  status: EmergencyStatus;
  department_reach: string[];
  declared_at: string;
  resolved_at: string | null;
  case_count?: number;
  patient_names?: string[];
}

export interface Case {
  id: string;
  hospital_id: string;
  emergency_id: string;
  acuity_score: number;
  status: CaseStatus;
  required_resource_types: string[];
  created_at: string;
  patient_id: string | null;
  patient_name: string;
  symptoms: string;
  symptom_severity: SymptomSeverity;
  vital_signs: VitalSigns;
  triage_note: string;
  suggested_resource_types: string[];
  created_by: string | null;
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
  description?: string;
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
