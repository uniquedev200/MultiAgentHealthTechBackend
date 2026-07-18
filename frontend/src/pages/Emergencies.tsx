import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../contexts/AuthContext";
import type { Emergency } from "../types";

const VALID_DEPARTMENTS = [
  "Emergency", "ICU", "Surgery", "Radiology", "Cardiology",
  "Neurology", "Oncology", "Pediatrics", "Orthopedics", "Trauma",
  "Anesthesiology", "Internal Medicine", "Laboratory", "Pharmacy",
];

export default function EmergenciesPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"individual" | "mass">("individual");
  const [selectedDepts, setSelectedDepts] = useState<string[]>(["Emergency", "ICU", "Surgery"]);
  const [emergencyName, setEmergencyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadEmergencies();
  }, []);

  async function loadEmergencies() {
    try {
      const list = await api.getEmergencies();
      setEmergencies(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      loadEmergencies();
      return;
    }
    setSearching(true);
    try {
      const results = await api.searchEmergencies(q);
      setEmergencies(results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  }, []);

  async function handleDeclare(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      if (selectedDepts.length === 0) {
        setError("Select at least one department");
        setCreating(false);
        return;
      }
      const emergency = await api.declareEmergency(scope, selectedDepts, emergencyName.trim() || undefined);
      navigate(`/emergencies/${emergency.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to declare emergency");
    } finally {
      setCreating(false);
    }
  }

  function toggleDept(dept: string) {
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  }

  const activeEmergencies = emergencies.filter((e) => e.status === "active");
  const resolvedEmergencies = emergencies.filter((e) => e.status === "resolved");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Emergencies</h1>
        <p className="text-sm text-gray-400 mt-1">Declare and manage emergency events</p>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            className="glass-input !pl-10 w-full max-w-md"
            placeholder="Search emergencies by scope, department, status..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 flex items-center justify-center pointer-events-none">
            {searching ? (
              <span className="text-[10px] animate-pulse">...</span>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </span>
        </div>
      </div>

      {/* Existing emergencies */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          Active Emergencies ({activeEmergencies.length})
        </h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : activeEmergencies.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white/[0.02] border border-white/5 rounded-lg px-4 py-3">
            {searchQuery ? "No emergencies match your search." : "No active emergencies."}
          </p>
        ) : (
          <div className="space-y-3">
            {activeEmergencies.map((em) => (
              <button
                key={em.id}
                onClick={() => navigate(`/emergencies/${em.id}`)}
                className="w-full text-left glass-card p-5 block transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <p className="text-sm font-medium text-white">
                        {em.name || (em.scope === "mass" ? "Mass Casualty Incident" : "Individual Emergency")}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">{em.id.slice(0, 12)}...</p>
                      {(em.case_count ?? 0) > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {em.case_count} case{(em.case_count ?? 0) !== 1 ? "s" : ""}
                          {em.patient_names && em.patient_names.length > 0 && (
                            <> — {em.patient_names.filter(Boolean).slice(0, 3).join(", ")}{em.patient_names.length > 3 ? ` +${em.patient_names.length - 3} more` : ""}</>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">
                        {new Date(em.declared_at).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Depts: {(em.department_reach || []).join(", ") || "—"}
                      </p>
                    </div>
                    <span className="text-gray-400 opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 font-bold">
                      →
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resolved emergencies */}
      {resolvedEmergencies.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">
            Resolved ({resolvedEmergencies.length})
          </h2>
          <div className="space-y-2">
            {resolvedEmergencies.map((em) => (
              <button
                key={em.id}
                onClick={() => navigate(`/emergencies/${em.id}`)}
                className="w-full text-left glass-card p-5 border-white/[0.04] opacity-55 hover:opacity-90 block transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-300">
                        {em.name || (em.scope === "mass" ? "Mass Casualty Incident" : "Individual Emergency")}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">{em.id.slice(0, 12)}...</p>
                      {(em.case_count ?? 0) > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {em.case_count} case{(em.case_count ?? 0) !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">
                        Declared: {new Date(em.declared_at).toLocaleString()}
                      </p>
                      {em.resolved_at && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Resolved: {new Date(em.resolved_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className="text-gray-400 opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 font-bold">
                      →
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Declare new */}
      {hasRole("admin", "department_head") && (
        <div className="glass-card-no-hover p-6 max-w-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Declare New Emergency</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-950/20 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleDeclare} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Emergency Name</label>
              <input
                type="text"
                className="glass-input w-full"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder="e.g. Multi-Vehicle Accident — Highway 101"
              />
              <p className="text-xs text-gray-500 mt-1">Descriptive name for this emergency event</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Scope</label>
              <div className="flex gap-3">
                {(["individual", "mass"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all ${
                      scope === s
                        ? "border-brand-500 bg-brand-500/10 text-brand-300"
                        : "border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {s === "individual" ? "Individual" : "Mass Casualty"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                {scope === "individual"
                  ? "Single negotiation round when cases arrive"
                  : "Continuous negotiation loop until resolved"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Departments
              </label>
              <div className="flex flex-wrap gap-2">
                {VALID_DEPARTMENTS.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggleDept(dept)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      selectedDepts.includes(dept)
                        ? "border-brand-500 bg-brand-500/20 text-brand-300 font-medium"
                        : "border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {selectedDepts.includes(dept) ? "✓ " : ""}{dept}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={creating} className="glass-btn-danger w-full">
              {creating ? "Declaring..." : "Declare Emergency"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
