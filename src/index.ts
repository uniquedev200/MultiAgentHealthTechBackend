import express from "express";
import dotenv from "dotenv";
import { authMiddleware, generateToken } from "./auth";
import { hashPassword, comparePassword } from "./password";
import {
  findHospitalByEmail,
  createHospital,
  createApiKey,
} from "./hospital";
import {
  loadState,
  broadcast,
  sseClients,
  createEmergency,
  createCase,
  listResources,
  updateResourceStatus,
  getRoundDetails,
  getAuditLog,
  getEmergency,
  getEmergencies,
  resolveEmergency,
  updateEmergencyStatus,
  getLLMKeyStatus,
  upsertLLMKey,
  deleteLLMKey,
  updateAllocationApproval,
  type SSEClient,
} from "./data";
import { scheduleEmergency, cancelSchedule } from "./scheduler";

dotenv.config();

const app = express();

// ── CORS — allow Vercel frontend + localhost dev ───────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ── Health check (no auth) ────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── POST /hospitals/register (no auth) ────────────────────────
app.post("/hospitals/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return res.status(400).json({ error: "email is required" });
    }
    if (!password || typeof password !== "string" || password.length < 1) {
      return res.status(400).json({ error: "password is required" });
    }

    const existing = await findHospitalByEmail(email.trim());
    if (existing) {
      return res
        .status(409)
        .json({ error: "A hospital is already registered with this email" });
    }

    const passwordHash = await hashPassword(password);
    const hospital = await createHospital(
      name.trim(),
      email.trim(),
      passwordHash
    );

    const apiKey = `hosp-${crypto.randomUUID()}`;
    await createApiKey(hospital.id, apiKey);

    res.status(201).json({
      hospital_id: hospital.id,
      name: hospital.name,
      api_key: apiKey,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /auth/login (no auth) ────────────────────────────────
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return res.status(400).json({ error: "email is required" });
    }
    if (!password || typeof password !== "string" || password.length < 1) {
      return res.status(400).json({ error: "password is required" });
    }

    const hospital = await findHospitalByEmail(email.trim());
    if (!hospital || !hospital.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await comparePassword(password, hospital.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(hospital.id);

    res.json({
      token,
      hospital_id: hospital.id,
      name: hospital.name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Auth middleware on all routes below ────────────────────────
app.use(authMiddleware);

// ── SSE endpoint ──────────────────────────────────────────────
app.get("/emergencies/:id/stream", (req, res) => {
  const emergencyId = req.params.id;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(
    `event: connected\ndata: ${JSON.stringify({ emergencyId })}\n\n`
  );

  const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const client: SSEClient = { id: clientId, res };

  const clients = sseClients.get(emergencyId) || [];
  clients.push(client);
  sseClients.set(emergencyId, clients);

  console.log(
    `[SSE] Client ${clientId} connected for emergency ${emergencyId} (${clients.length} total)`
  );

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    const list = sseClients.get(emergencyId) || [];
    const idx = list.findIndex((c: SSEClient) => c.id === clientId);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) sseClients.delete(emergencyId);
    console.log(
      `[SSE] Client ${clientId} disconnected from emergency ${emergencyId}`
    );
  });
});

// ── POST /emergencies — declare emergency ─────────────────────
app.post("/emergencies", async (req, res) => {
  try {
    const { scope, department_reach } = req.body;
    if (!scope || !["individual", "mass"].includes(scope)) {
      return res
        .status(400)
        .json({ error: "scope must be 'individual' or 'mass'" });
    }
    if (!Array.isArray(department_reach) || department_reach.length === 0) {
      return res
        .status(400)
        .json({ error: "department_reach must be a non-empty array of strings" });
    }

    const emergency = await createEmergency(
      scope,
      department_reach,
      req.hospitalId
    );
    broadcast(emergency.id, "emergency_declared", emergency);

    res.status(201).json(emergency);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /emergencies/:id/cases — add a case ─────────────────
app.post("/emergencies/:id/cases", async (req, res) => {
  try {
    const emergencyId = req.params.id;
    const { acuity_score, required_resource_types } = req.body;

    // Cross-hospital guard: verify emergency belongs to this hospital
    const emergency = await getEmergency(emergencyId, req.hospitalId);
    if (!emergency) {
      return res.status(404).json({ error: "Emergency not found" });
    }

    if (acuity_score === undefined || typeof acuity_score !== "number") {
      return res
        .status(400)
        .json({ error: "acuity_score must be a number (1-5)" });
    }
    if (acuity_score < 1 || acuity_score > 5) {
      return res
        .status(400)
        .json({ error: "acuity_score must be between 1 and 5" });
    }
    if (
      !Array.isArray(required_resource_types) ||
      required_resource_types.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "required_resource_types must be a non-empty array" });
    }

    const newCase = await createCase(
      emergencyId,
      acuity_score,
      required_resource_types,
      req.hospitalId
    );
    broadcast(emergencyId, "case_added", newCase);

    // Reactivate emergency if it was auto-resolved
    if (emergency.status === "resolved") {
      await updateEmergencyStatus(emergencyId, "active", req.hospitalId);
      const refreshed = await getEmergency(emergencyId, req.hospitalId);
      if (refreshed) broadcast(emergencyId, "emergency_reactivated", refreshed);
    }

    // Trigger negotiation scheduler (debounced — rapid case additions batch together)
    scheduleEmergency(emergencyId, req.hospitalId);

    res.status(201).json(newCase);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /emergencies — list all emergencies for this hospital ─
app.get("/emergencies", async (req, res) => {
  try {
    const emergencies = await getEmergencies(req.hospitalId);
    res.json(emergencies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /emergencies/:id — current state ──────────────────────
app.get("/emergencies/:id", async (req, res) => {
  try {
    // Cross-hospital guard: verify emergency belongs to this hospital
    const emergency = await getEmergency(req.params.id, req.hospitalId);
    if (!emergency) {
      return res.status(404).json({ error: "Emergency not found" });
    }

    const state = await loadState(req.params.id, req.hospitalId);
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /emergencies/:id/rounds/:roundId — bids + allocations ─
app.get("/emergencies/:id/rounds/:roundId", async (req, res) => {
  try {
    // Cross-hospital guard
    const emergency = await getEmergency(req.params.id, req.hospitalId);
    if (!emergency) {
      return res.status(404).json({ error: "Emergency not found" });
    }

    const details = await getRoundDetails(req.params.roundId, req.hospitalId);

    if (details.bids.length === 0 && details.allocations.length === 0) {
      return res
        .status(404)
        .json({ error: `Round "${req.params.roundId}" not found` });
    }

    res.json(details);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /resources — list all resources ────────────────────────
app.get("/resources", async (req, res) => {
  try {
    const resources = await listResources(req.hospitalId);
    res.json(resources);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /resources/:id — manual status override ─────────────
app.patch("/resources/:id", async (req, res) => {
  try {
    const { status } = req.body;
    if (
      !status ||
      !["available", "occupied", "reserved", "offline"].includes(status)
    ) {
      return res.status(400).json({
        error: "status must be one of: available, occupied, reserved, offline",
      });
    }

    const updated = await updateResourceStatus(
      req.params.id,
      status,
      req.hospitalId
    );
    if (!updated) {
      return res.status(404).json({ error: "Resource not found" });
    }

    broadcast("global", "resource_status_changed", updated);

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /emergencies/:id/resolve ─────────────────────────────
app.patch("/emergencies/:id/resolve", async (req, res) => {
  try {
    const emergencyId = req.params.id;
    const emergency = await getEmergency(emergencyId, req.hospitalId);
    if (!emergency) {
      return res.status(404).json({ error: "Emergency not found" });
    }
    if (emergency.status === "resolved") {
      return res
        .status(400)
        .json({ error: "Emergency is already resolved" });
    }

    await resolveEmergency(emergencyId, req.hospitalId);
    cancelSchedule(emergencyId);
    const updated = await getEmergency(emergencyId, req.hospitalId);
    if (!updated) {
      return res.status(500).json({ error: "Internal server error" });
    }

    broadcast(emergencyId, "emergency_resolved", updated);

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /audit-log — paginated audit trail ────────────────────
app.get("/audit-log", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 20)
    );

    const { entries, total } = await getAuditLog(page, limit, req.hospitalId);

    res.json({
      entries,
      page,
      limit,
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /settings/llm-keys — credential status ────────────────
app.get("/settings/llm-keys", async (req, res) => {
  try {
    const status = await getLLMKeyStatus(req.hospitalId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /settings/llm-keys/:provider — upsert key ─────────────
app.put("/settings/llm-keys/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    if (provider !== "groq" && provider !== "mistral") {
      return res.status(400).json({ error: "provider must be 'groq' or 'mistral'" });
    }
    const { api_key } = req.body;
    if (!api_key || typeof api_key !== "string" || api_key.trim().length === 0) {
      return res.status(400).json({ error: "api_key is required" });
    }

    await upsertLLMKey(req.hospitalId, provider, api_key.trim());
    res.json({ ok: true, provider, configured: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /settings/llm-keys/:provider — remove key ──────────
app.delete("/settings/llm-keys/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    if (provider !== "groq" && provider !== "mistral") {
      return res.status(400).json({ error: "provider must be 'groq' or 'mistral'" });
    }

    await deleteLLMKey(req.hospitalId, provider);
    res.json({ ok: true, provider, configured: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── HITL: Approve/Reject allocations ──────────────────────────
app.patch("/allocations/:id/approve", async (req, res) => {
  try {
    const updated = await updateAllocationApproval(req.params.id, "approved", req.hospitalId);
    if (!updated) return res.status(404).json({ error: "Allocation not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/allocations/:id/reject", async (req, res) => {
  try {
    const updated = await updateAllocationApproval(req.params.id, "rejected", req.hospitalId);
    if (!updated) return res.status(404).json({ error: "Allocation not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── 404 catch-all ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler (must have 4 args) ───────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[error]", err.message || err);

    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON in request body" });
    }

    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message || "Bad request" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
);

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(
    `\n🏥 Emergency Resource Negotiation server running on http://localhost:${PORT}`
  );
  console.log(`   POST   /hospitals/register  (no auth)`);
  console.log(`   POST   /auth/login          (no auth)`);
  console.log(`   GET    /health              (no auth)`);
  console.log(`   GET    /emergencies/:id/stream  (SSE)`);
  console.log(`   POST   /emergencies`);
  console.log(`   GET    /emergencies/:id`);
  console.log(`   POST   /emergencies/:id/cases`);
  console.log(`   GET    /emergencies/:id/rounds/:roundId`);
  console.log(`   GET    /resources`);
  console.log(`   PATCH  /resources/:id`);
  console.log(`   PATCH  /emergencies/:id/resolve`);
  console.log(`   GET    /audit-log`);
  console.log(`   GET    /settings/llm-keys`);
  console.log(`   PUT    /settings/llm-keys/:provider`);
  console.log(`   DELETE /settings/llm-keys/:provider`);
  console.log(`   PATCH  /allocations/:id/approve  (HITL)`);
  console.log(`   PATCH  /allocations/:id/reject   (HITL)\n`);
});
