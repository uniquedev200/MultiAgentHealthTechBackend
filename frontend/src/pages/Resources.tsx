import { useEffect, useState } from "react";
import { api } from "../api";
import type { Resource, ResourceStatus } from "../types";

const STATUSES: ResourceStatus[] = ["available", "occupied", "reserved", "offline"];

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadResources();
  }, []);

  async function loadResources() {
    try {
      const data = await api.listResources();
      setResources(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(id: string, status: string) {
    setSavingId(id);
    try {
      const updated = await api.patchResource(id, status);
      setResources((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function handleReset() {
    if (!confirm("Reset all occupied resources to available and revert allocated cases?")) return;
    setResetting(true);
    try {
      const result = await api.resetResources();
      alert(`Done: ${result.resourcesReset} resources freed, ${result.casesReverted} cases reverted, ${result.allocationsCleared} allocations cleared`);
      await loadResources();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading resources...</div>;
  }

  const grouped = resources.reduce(
    (acc, r) => {
      (acc[r.type] = acc[r.type] || []).push(r);
      return acc;
    },
    {} as Record<string, Resource[]>
  );

  const typeLabels: Record<string, string> = {
    icu_bed: "ICU Beds",
    er_bay: "ER Bays",
    staff: "Staff",
    or_slot: "Operating Rooms",
    equipment: "Equipment",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Resources</h1>
          <p className="text-sm text-gray-400 mt-1">Manage hospital resource availability</p>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="glass-btn-secondary bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
        >
          {resetting ? (
            <span>Resetting...</span>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18v3.51" />
              </svg>
              <span>Reset All to Available</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-950/20 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-2 font-bold hover:text-white transition-colors">✕</button>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex gap-4 mb-6">
        {STATUSES.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                s === "available"
                  ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                  : s === "occupied"
                  ? "bg-red-500 shadow-sm shadow-red-500/50"
                  : s === "reserved"
                  ? "bg-amber-500 shadow-sm shadow-amber-500/50"
                  : "bg-gray-600"
              }`}
            />
            <span className="text-sm text-gray-400">
              {s}: {resources.filter((r) => r.status === s).length}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="glass-card-no-hover p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              {typeLabels[type] || type} ({items.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-white/5">
                    <th className="pb-3 pr-4">Label</th>
                    <th className="pb-3 pr-4">Department</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-white/[0.01] transition-colors duration-150">
                      <td className="py-3.5 pr-4">
                        <span className="font-medium text-white">{r.label}</span>
                        <span className="block text-xs text-gray-500 font-mono mt-0.5">{r.id.slice(0, 12)}…</span>
                      </td>
                      <td className="py-3.5 pr-4 text-gray-400">{r.department}</td>
                      <td className="py-3.5 pr-4">
                        <span
                          className={`badge ${
                            r.status === "available"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : r.status === "occupied"
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : r.status === "reserved"
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <select
                          className="glass-input py-1 px-2 text-xs w-36"
                          value={r.status}
                          onChange={(e) => changeStatus(r.id, e.target.value)}
                          disabled={savingId === r.id}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s} className="bg-[#0c0f17] text-white">
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
