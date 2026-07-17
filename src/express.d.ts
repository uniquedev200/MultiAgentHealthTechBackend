/* eslint-disable @typescript-eslint/no-explicit-any */

type UserRoleLiteral = "admin" | "department_head" | "doctor" | "nurse" | "triage_officer" | "paramedic" | "charge_nurse";

declare namespace Express {
  interface Request {
    hospitalId: string;
    userId?: string;
    userRole?: UserRoleLiteral;
  }
}
