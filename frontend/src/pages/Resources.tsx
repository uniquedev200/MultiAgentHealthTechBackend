import { useEffect, useState } from "react";
import { api } from "../api";
import type { Resource, ResourceStatus } from "../types";

const STATUSES: ResourceStatus[] = ["available", "occupied", "reserved", "offline"];

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
        <p className="text-sm text-gray-500 mt-1">Manage hospital resource availability</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">✕</button>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex gap-4 mb-6">
        {STATUSES.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                s === "available"
                  ? "bg-emerald-500"
                  : s === "occupied"
                  ? "bg-red-500"
                  : s === "reserved"
                  ? "bg-amber-500"
                  : "bg-gray-400"
              }`}
            />
            <span className="text-sm text-gray-600">
              {s}: {resources.filter((r) => r.status === s).length}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {typeLabels[type] || type} ({items.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Label</th>
                    <th className="pb-3 pr-4">Department</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 pr-4">
                        <span className="font-medium text-gray-900">{r.label}</span>
                        <span className="block text-xs text-gray-400 font-mono">{r.id.slice(0, 12)}…</span>
                      </td>
                      <td className="py-3 pr-4 text-gray-600">{r.department}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`badge ${
                            r.status === "available"
                              ? "badge-green"
                              : r.status === "occupied"
                              ? "badge-red"
                              : r.status === "reserved"
                              ? "badge-yellow"
                              : "badge-gray"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <select
                          className="input py-1 px-2 text-xs w-36"
                          value={r.status}
                          onChange={(e) => changeStatus(r.id, e.target.value)}
                          disabled={savingId === r.id}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
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
