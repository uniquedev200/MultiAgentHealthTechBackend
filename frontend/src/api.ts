const BASE_URL = import.meta.env.VITE_API_URL || "";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const opts: RequestInit = { method, headers };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE_URL}${path}`, opts);
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      const err = data as { error?: string };
      if (res.status === 401) {
        this.token = null;
        localStorage.removeItem("sievege_auth");
        window.location.href = "/login";
      }
      throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return data as T;
  }

  // ── Auth ──────────────────────────────────────────────────
  async register(name: string, email: string, password: string) {
    return this.request<{
      hospital_id: string;
      name: string;
      api_key: string;
    }>("POST", "/hospitals/register", { name, email, password });
  }

  async login(email: string, password: string) {
    return this.request<{
      token: string;
      hospital_id: string;
      user_id?: string;
      name: string;
      role?: string;
    }>("POST", "/auth/login", { email, password });
  }

  // ── Users ─────────────────────────────────────────────────
  async getUsers() {
    return this.request<import("./types").User[]>("GET", "/users");
  }

  async getMe() {
    return this.request<import("./types").User & { role?: string }>("GET", "/users/me");
  }

  async createUser(email: string, fullName: string, role: string, password: string) {
    return this.request<import("./types").User>("POST", "/auth/register-user", {
      email, full_name: fullName, role, password,
    });
  }

  async updateUserRole(userId: string, role: string) {
    return this.request<import("./types").User>("PATCH", `/users/${userId}/role`, { role });
  }

  async deleteUser(userId: string) {
    return this.request<{ ok: boolean }>("DELETE", `/users/${userId}`);
  }

  // ── Patients ──────────────────────────────────────────────
  async createPatient(data: {
    name: string;
    age: number;
    gender?: string;
    blood_type?: string;
    medical_history?: string;
    allergies?: string;
    current_medications?: string;
  }) {
    return this.request<import("./types").Patient>("POST", "/patients", data);
  }

  async listPatients(search?: string) {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request<import("./types").Patient[]>("GET", `/patients${q}`);
  }

  // ── Health ────────────────────────────────────────────────
  async health() {
    return this.request<{ status: string }>("GET", "/health");
  }

  // ── Emergencies ───────────────────────────────────────────
  async getEmergencies() {
    return this.request<import("./types").Emergency[]>("GET", "/emergencies");
  }

  async searchEmergencies(q: string) {
    return this.request<import("./types").Emergency[]>(
      "GET",
      `/emergencies/search?q=${encodeURIComponent(q)}`
    );
  }

  async declareEmergency(scope: string, department_reach: string[], name?: string) {
    return this.request<{ id: string; [k: string]: unknown }>(
      "POST",
      "/emergencies",
      { scope, department_reach, name }
    );
  }

  async getEmergencyState(emergencyId: string) {
    return this.request<{
      cases: import("./types").Case[];
      resources: import("./types").Resource[];
      dependencies: import("./types").ResourceDependency[];
      allocations: import("./types").Allocation[];
    }>("GET", `/emergencies/${emergencyId}`);
  }

  async addCase(
    emergencyId: string,
    required_resource_types: string[],
    clinicalData?: {
      patient_id?: string;
      patient_name?: string;
      symptoms?: string;
      vital_signs?: Record<string, unknown>;
      triage_note?: string;
      suggested_resource_types?: string[];
      age?: number;
      medical_history?: string;
    }
  ) {
    return this.request<{ id: string; [k: string]: unknown }>(
      "POST",
      `/emergencies/${emergencyId}/cases`,
      { required_resource_types, ...clinicalData }
    );
  }

  async resolveEmergency(emergencyId: string) {
    return this.request<{ id: string; [k: string]: unknown }>(
      "PATCH",
      `/emergencies/${emergencyId}/resolve`
    );
  }

  async getRoundDetails(emergencyId: string, roundId: string) {
    return this.request<import("./types").RoundDetails>(
      "GET",
      `/emergencies/${emergencyId}/rounds/${roundId}`
    );
  }

  // ── Resources ─────────────────────────────────────────────
  async listResources() {
    return this.request<import("./types").Resource[]>("GET", "/resources");
  }

  async patchResource(id: string, status: string) {
    return this.request<import("./types").Resource>("PATCH", `/resources/${id}`, {
      status,
    });
  }

  async resetResources() {
    return this.request<{ message: string; resourcesReset: number; casesReverted: number; allocationsCleared: number }>(
      "POST",
      "/admin/reset"
    );
  }

  // ── Audit Log ─────────────────────────────────────────────
  async getAuditLog(page = 1, limit = 20, filters?: { event_type?: string; search?: string }) {
    let params = `page=${page}&limit=${limit}`;
    if (filters?.event_type) params += `&event_type=${encodeURIComponent(filters.event_type)}`;
    if (filters?.search) params += `&search=${encodeURIComponent(filters.search)}`;
    return this.request<{
      entries: import("./types").AuditLogEntry[];
      page: number;
      limit: number;
      total: number;
    }>("GET", `/audit-log?${params}`);
  }

  // ── LLM Keys ─────────────────────────────────────────────
  async getLLMKeyStatus() {
    return this.request<Record<string, { configured: boolean }>>(
      "GET",
      "/settings/llm-keys"
    );
  }

  async upsertLLMKey(provider: string, api_key: string) {
    return this.request<{ ok: boolean; provider: string; configured: boolean }>(
      "PUT",
      `/settings/llm-keys/${provider}`,
      { api_key }
    );
  }

  async deleteLLMKey(provider: string) {
    return this.request<{ ok: boolean; provider: string; configured: boolean }>(
      "DELETE",
      `/settings/llm-keys/${provider}`
    );
  }

  // ── HITL ──────────────────────────────────────────────────
  async approveAllocation(allocationId: string) {
    return this.request<import("./types").Allocation>(
      "PATCH",
      `/allocations/${allocationId}/approve`
    );
  }

  async rejectAllocation(allocationId: string) {
    return this.request<import("./types").Allocation>(
      "PATCH",
      `/allocations/${allocationId}/reject`
    );
  }

  async approveCase(caseId: string) {
    return this.request<import("./types").Case>(
      "PATCH",
      `/cases/${caseId}/approve`
    );
  }

  async rejectCase(caseId: string) {
    return this.request<import("./types").Case>(
      "PATCH",
      `/cases/${caseId}/reject`
    );
  }

  // ── SSE ───────────────────────────────────────────────────
  openSSE(
    emergencyId: string,
    onEvent: (eventType: string, data: unknown) => void
  ): () => void {
    const controller = new AbortController();

    fetch(`${BASE_URL}/emergencies/${emergencyId}/stream`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      signal: controller.signal,
    })
      .then(async (res) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "";
        let eventData = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            } else if (line.trim() === "" && eventType && eventData) {
              let parsed: unknown;
              try {
                parsed = JSON.parse(eventData);
              } catch {
                parsed = eventData;
              }
              onEvent(eventType, parsed);
              eventType = "";
              eventData = "";
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("[SSE]", err);
        }
      });

    return () => controller.abort();
  }
}

export const api = new ApiClient();
