import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditLogEntry } from "../types";

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    loadPage(page);
  }, [page]);

  async function loadPage(p: number) {
    setLoading(true);
    try {
      const data = await api.getAuditLog(p, limit);
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Append-only, tamper-evident event trail · {total} total entries
        </p>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">Loading...</div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">No audit entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Event</th>
                  <th className="pb-3 pr-4">Payload</th>
                  <th className="pb-3">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`badge ${
                          entry.event_type === "emergency_declared"
                            ? "badge-red"
                            : entry.event_type === "round_saved"
                            ? "badge-blue"
                            : entry.event_type === "emergency_resolved"
                            ? "badge-green"
                            : "badge-gray"
                        }`}
                      >
                        {entry.event_type}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <pre className="text-xs text-gray-600 max-w-md truncate font-mono">
                        {JSON.stringify(entry.payload)}
                      </pre>
                    </td>
                    <td className="py-3">
                      <span className="text-xs text-gray-400 font-mono">
                        {entry.hash.slice(0, 12)}…
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
                ← Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary text-xs"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
