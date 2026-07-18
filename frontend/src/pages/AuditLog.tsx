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
  round_saved: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
  emergency_declared: "bg-red-500/10 text-red-300 border border-red-500/20",
  emergency_resolved: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
  case_added: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
  allocation_approved: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
  allocation_rejected: "bg-red-500/10 text-red-300 border border-red-500/20",
};

const EVENT_DOTS: Record<string, string> = {
  round_saved: "bg-blue-500 shadow-sm shadow-blue-500/50",
  emergency_declared: "bg-red-500 shadow-sm shadow-red-500/50",
  emergency_resolved: "bg-emerald-500 shadow-sm shadow-emerald-500/50",
  case_added: "bg-amber-500 shadow-sm shadow-amber-500/50",
  allocation_approved: "bg-emerald-500 shadow-sm shadow-emerald-500/50",
  allocation_rejected: "bg-red-500 shadow-sm shadow-red-500/50",
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
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="text-sm text-gray-400 mt-1">
          Append-only, tamper-evident event trail · {total} total entries
        </p>
      </div>

      {/* Filters */}
      <div className="glass-card-no-hover p-6 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-400 mb-1">Search</label>
            <input
              type="text"
              className="glass-input w-full"
              placeholder="Search audit entries..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-400 mb-1">Event Type</label>
            <select
              className="glass-input w-full"
              value={eventType}
              onChange={(e) => { setEventType(e.target.value); setPage(1); }}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-[#0c0f17] text-white">{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="glass-card-no-hover p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">Loading...</div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">No audit entries {search || eventType ? "match your filters" : "yet"}.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="border border-white/5 bg-white/[0.01] rounded-lg p-4 hover:bg-white/[0.03] transition-all duration-200"
              >
                <div className="flex items-start gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${EVENT_DOTS[entry.event_type] || "bg-gray-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${EVENT_COLORS[entry.event_type] || "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>
                        {entry.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white">
                      {getHumanDescription(entry)}
                    </p>
                    {getDetailText(entry) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {getDetailText(entry)}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <span className="text-[10px] text-emerald-400/60 font-mono" title={`Full hash: ${entry.hash}`}>
                      {entry.hash.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="glass-btn-secondary text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="glass-btn-secondary text-xs"
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
