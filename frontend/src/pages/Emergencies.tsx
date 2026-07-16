import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Emergency } from "../types";

const VALID_DEPARTMENTS = [
  "Emergency", "ICU", "Surgery", "Radiology", "Cardiology",
  "Neurology", "Oncology", "Pediatrics", "Orthopedics", "Trauma",
  "Anesthesiology", "Internal Medicine", "Laboratory", "Pharmacy",
];

export default function EmergenciesPage() {
  const navigate = useNavigate();
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"individual" | "mass">("individual");
  const [selectedDepts, setSelectedDepts] = useState<string[]>(["Emergency", "ICU", "Surgery"]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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
      const emergency = await api.declareEmergency(scope, selectedDepts);
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Emergencies</h1>
        <p className="text-sm text-gray-500 mt-1">Declare and manage emergency events</p>
      </div>

      {/* Existing emergencies */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Emergencies</h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : emergencies.filter((e) => e.status === "active").length === 0 ? (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">No active emergencies.</p>
        ) : (
          <div className="space-y-3">
            {emergencies
              .filter((e) => e.status === "active")
              .map((em) => (
                <button
                  key={em.id}
                  onClick={() => navigate(`/emergencies/${em.id}`)}
                  className="w-full text-left card hover:border-brand-300 hover:bg-brand-50/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {em.scope === "mass" ? "Mass Casualty" : "Individual"} Emergency
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{em.id.slice(0, 12)}...</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {new Date(em.declared_at).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Depts: {(em.department_reach || []).join(", ") || "—"}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Resolved emergencies */}
      {emergencies.filter((e) => e.status === "resolved").length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resolved</h2>
          <div className="space-y-2">
            {emergencies
              .filter((e) => e.status === "resolved")
              .map((em) => (
                <button
                  key={em.id}
                  onClick={() => navigate(`/emergencies/${em.id}`)}
                  className="w-full text-left card opacity-60 hover:opacity-100 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {em.scope === "mass" ? "Mass Casualty" : "Individual"} Emergency
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{em.id.slice(0, 12)}...</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        Declared: {new Date(em.declared_at).toLocaleString()}
                      </p>
                      {em.resolved_at && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Resolved: {new Date(em.resolved_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Declare new */}
      <div className="card max-w-xl">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Declare New Emergency</h2>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleDeclare} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Scope</label>
            <div className="flex gap-3">
              {(["individual", "mass"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`flex-1 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    scope === s
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {s === "individual" ? "⚡ Individual" : "🔄 Mass Casualty"}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {scope === "individual"
                ? "Single negotiation round when cases arrive"
                : "Continuous negotiation loop until resolved"}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                      ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {selectedDepts.includes(dept) ? "✓ " : ""}{dept}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Select departments this emergency covers
            </p>
          </div>

          <button type="submit" disabled={creating} className="btn-danger w-full">
            {creating ? "Declaring..." : "🚨 Declare Emergency"}
          </button>
        </form>
      </div>
    </div>
  );
}
