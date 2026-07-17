import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { findApiKey } from "./hospital";
import { ROLE_PERMISSIONS } from "./types";
import type { UserRole } from "./types";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

// ── Combined auth middleware: JWT first, then API key ─────────
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    void res.status(401).json({ error: "Invalid or missing credentials" });
    return;
  }

  const token = authHeader.slice(7);

  // 1. Try JWT first (v2: includes user_id + role)
  try {
    const payload = jwt.verify(token, getJwtSecret()) as {
      hospital_id: string;
      user_id?: string;
      role?: UserRole;
    };
    if (payload && payload.hospital_id) {
      req.hospitalId = payload.hospital_id;
      req.userId = payload.user_id;
      req.userRole = payload.role;
      next();
      return;
    }
  } catch {
    // Not a valid JWT — fall through to API key check
  }

  // 2. Fall back to API key lookup
  const keyRecord = await findApiKey(token);
  if (keyRecord) {
    req.hospitalId = keyRecord.hospital_id;
    next();
    return;
  }

  // 3. Neither worked
  void res.status(401).json({ error: "Invalid or missing credentials" });
}

// ── Role-based access control middleware ──────────────────────
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      void res.status(403).json({ error: "No role assigned. API key access does not support role-based operations." });
      return;
    }
    if (!allowedRoles.includes(req.userRole)) {
      void res.status(403).json({ error: `Access denied. Required role: ${allowedRoles.join(" or ")}. Your role: ${req.userRole}` });
      return;
    }
    next();
  };
}

// ── Permission-based access control middleware ────────────────
export function requirePermission(...requiredPerms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      void res.status(403).json({ error: "No role assigned." });
      return;
    }
    const userPerms = ROLE_PERMISSIONS[req.userRole] || [];
    const hasAll = requiredPerms.every(p => userPerms.includes(p));
    if (!hasAll) {
      void res.status(403).json({ error: `Missing permission: ${requiredPerms.join(", ")}` });
      return;
    }
    next();
  };
}

// ── Helper: generate JWT (v2 with user context) ──────────────
export function generateToken(
  hospitalId: string,
  userId?: string,
  role?: UserRole
): string {
  const payload: Record<string, unknown> = { hospital_id: hospitalId };
  if (userId) payload.user_id = userId;
  if (role) payload.role = role;
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "24h" });
}
