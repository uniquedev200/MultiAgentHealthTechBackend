import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditLogEntry } from "../types";

const EVENT_TYPES = [
  { value: "", label: "All Events" },
  { value: "round_saved", label: "Negotiation Round" },
  { value: "emergency_declared", label: "Emergency Declared" },
  { value: "emergency_resolved", label: "Emergency Resolved" },
  { value: "case_added", label: "Case Added" },
  { value: "allocation_approved", label: "Allocation Approved" },
  { value: "allocation_rejected", label: "Allocation Rejected" },
];

const EVENT_COLORS: Record<string, string> = {
  round_saved: "bg-blue-100 text-blue-700",
  emergency_declared: "bg-red-100 text-red-700",
  emergency_resolved: "bg-emerald-100 text-emerald-700",
  case_added: "bg-amber-100 text-amber-700",
  allocation_approved: "bg-emerald-100 text-emerald-700",
  allocation_rejected: "bg-red-100 text-red-700",
};

const EVENT_ICONS: Record<string, string> = {
  round_saved: "🤖",
  emergency_declared: "🚨",
  emergency_resolved: "✅",
  case_added: "📋",
  allocation_approved: "👍",
  allocation_rejected: "👎",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState("");
  const [search, setSearch] = useState("");
  const limit = 20;

  useEffect(() => {
    loadPage(page);
  }, [page, eventType, search]);

  async function loadPage(p: number) {
    setLoading(true);
    try {
      const data = await api.getAuditLog(p, limit, {
        event_type: eventType || undefined,
        search: search || undefined,
      });
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  function getHumanDescription(entry: AuditLogEntry): string {
    if (entry.description) return entry.description;

    const p = entry.payload;
    switch (entry.event_type) {
      case "round_saved": {
        const allocs = (p.allocations as Array<{ caseId: string; resourceId: string }>) || [];
        return allocs.length > 0
          ? `Negotiation round completed. ${allocs.length} resource allocation${allocs.length > 1 ? "s" : ""} made.`
          : "Negotiation round completed. No resources were allocated.";
      }
      case "emergency_declared":
        return "New emergency declared by hospital staff.";
      case "emergency_resolved":
        return "Emergency resolved — all cases have been addressed.";
      case "case_added":
        return "New patient case added to the emergency.";
      case "allocation_approved":
        return "An allocation was approved by staff.";
      case "allocation_rejected":
        return "An allocation was rejected by staff.";
      default:
        return entry.event_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  function getDetailText(entry: AuditLogEntry): string {
    const p = entry.payload;
    switch (entry.event_type) {
      case "round_saved": {
        const allocs = (p.allocations as Array<{ caseId: string; resourceId: string }>) || [];
        return allocs.map(a => `Case ${a.caseId.slice(0, 8)} → Resource ${a.resourceId.slice(0, 8)}`).join("; ");
      }
      case "emergency_declared":
        return `Scope: ${p.scope || "unknown"}, Depts: ${(p.department_reach as string[])?.join(", ") || "—"}`;
      case "case_added":
        return `Acuity ${p.acuityScore || "—"}`;
      case "allocation_approved":
      case "allocation_rejected":
        return `Case ${String(p.caseId || "").slice(0, 8)} → Resource ${String(p.resourceId || "").slice(0, 8)}`;
      default:
        return "";
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Append-only, tamper-evident event trail · {total} total entries
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Search audit entries..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Event Type</label>
            <select
              className="input"
              value={eventType}
              onChange={(e) => { setEventType(e.target.value); setPage(1); }}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">Loading...</div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">No audit entries {search || eventType ? "match your filters" : "yet"}.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">
                    {EVENT_ICONS[entry.event_type] || "📝"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EVENT_COLORS[entry.event_type] || "bg-gray-100 text-gray-600"}`}>
                        {entry.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {getHumanDescription(entry)}
                    </p>
                    {getDetailText(entry) && (
                      <p className="text-xs text-gray-500 mt-1">
                        {getDetailText(entry)}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <span className="text-[10px] text-gray-300 font-mono" title={`Full hash: ${entry.hash}`}>
                      {entry.hash.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
