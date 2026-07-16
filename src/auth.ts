import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { findApiKey } from "./hospital";

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

  // 1. Try JWT first
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { hospital_id: string };
    if (payload && payload.hospital_id) {
      req.hospitalId = payload.hospital_id;
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

// ── Helper: generate JWT ─────────────────────────────────────
export function generateToken(hospitalId: string): string {
  return jwt.sign({ hospital_id: hospitalId }, getJwtSecret(), {
    expiresIn: "24h",
  });
}
