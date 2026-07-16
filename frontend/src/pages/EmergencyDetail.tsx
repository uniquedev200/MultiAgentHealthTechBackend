import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { Case, Resource, Allocation, Bid, AllocationApprovalStatus } from "../types";

interface SSEEvent {
  id: number;
  type: string;
  data: unknown;
  time: string;
}

interface RoundInfo {
  roundId: string;
  allocations: Allocation[];
  explanation: string;
  bids: Bid[];
}

export default function EmergencyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const emergencyId = id!;

  const [cases, setCases] = useState<Case[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [sseEvents, setSseEvents] = useState<SSEEvent[]>([]);
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [connected, setConnected] = useState(false);

  const [acuity, setAcuity] = useState(5);
  const [requiredResources, setRequiredResources] = useState("icu_bed,staff");
  const [addingCase, setAddingCase] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const evtId = useRef(0);
  const closeSSE = useRef<(() => void) | null>(null);

  // Load initial state
  const loadState = useCallback(async () => {
    try {
      const state = await api.getEmergencyState(emergencyId);
      setCases(state.cases);
      setResources(state.resources);
      if (state.allocations && state.allocations.length > 0) {
        setAllocations((prev) => {
          const existing = new Set(prev.map((a) => a.id));
          const newAllocs = state.allocations.filter((a) => !existing.has(a.id));
          return [...prev, ...newAllocs];
        });
      }
    } catch (err) {
      console.error("Failed to load state:", err);
    }
  }, [emergencyId]);

  // Connect SSE
  useEffect(() => {
    closeSSE.current = api.openSSE(emergencyId, (eventType, data) => {
      const evt = {
        id: evtId.current++,
        type: eventType,
        data,
        time: new Date().toLocaleTimeString(),
      };
      setSseEvents((prev) => [...prev, evt]);

      if (eventType === "connected") {
        setConnected(true);
        loadState();
      } else if (eventType === "case_added") {
        setCases((prev) => {
          const c = data as Case;
          if (prev.some((x) => x.id === c.id)) return prev;
          return [c, ...prev];
        });
      } else if (eventType === "bid_submitted") {
        // Bids arrive live — handled in rounds
      } else if (eventType === "round:completed") {
        const round = data as {
          roundId: string;
          allocations: Allocation[];
          explanation: string;
        };
        // Use allocations from SSE event directly (reliable)
        setRounds((prev) => [
          {
            roundId: round.roundId,
            allocations: round.allocations || [],
            explanation: round.explanation || "",
            bids: [],
          },
          ...prev,
        ]);
        if (round.allocations && round.allocations.length > 0) {
          setAllocations((prev) => [...round.allocations, ...prev]);
          setCases((prev) =>
            prev.map((c) => {
              if (round.allocations.some((a: Allocation) => a.case_id === c.id)) {
                return { ...c, status: "allocated" as const };
              }
              return c;
            })
          );
          setResources((prev) =>
            prev.map((r) => {
              if (round.allocations.some((a: Allocation) => a.resource_id === r.id)) {
                return { ...r, status: "occupied" as const };
              }
              return r;
            })
          );
        }
        // Also try to get bids from API (non-critical)
        api
          .getRoundDetails(emergencyId, round.roundId)
          .then((details) => {
            if (details.bids.length > 0) {
              setRounds((prev) =>
                prev.map((r) =>
                  r.roundId === round.roundId ? { ...r, bids: details.bids } : r
                )
              );
            }
            // Also pick up any allocations with IDs from the API
            if (details.allocations.length > 0) {
              setAllocations((prev) => {
                const existing = new Set(prev.map((a) => a.id));
                const newAllocs = details.allocations.filter(
                  (a) => !existing.has(a.id)
                );
                return newAllocs.length > 0 ? [...newAllocs, ...prev] : prev;
              });
            }
          })
          .catch(() => {});
      } else if (eventType === "emergency_resolved") {
        loadState();
      }
    });

    return () => {
      closeSSE.current?.();
    };
  }, [emergencyId, loadState]);

  // Add case
  async function handleAddCase(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAddingCase(true);
    try {
      const types = requiredResources
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.addCase(emergencyId, acuity, types);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingCase(false);
    }
  }

  // Quick add presets
  async function quickAdd(acuityScore: number, types: string[]) {
    setAddingCase(true);
    try {
      await api.addCase(emergencyId, acuityScore, types);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingCase(false);
    }
  }

  // Resolve
  async function handleResolve() {
    setResolving(true);
    try {
      await api.resolveEmergency(emergencyId);
      closeSSE.current?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResolving(false);
    }
  }

  // HITL: Approve / Reject
  async function handleApproval(allocationId: string, action: "approve" | "reject") {
    setApprovingId(allocationId);
    try {
      const updated =
        action === "approve"
          ? await api.approveAllocation(allocationId)
          : await api.rejectAllocation(allocationId);
      setAllocations((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
      setRounds((prev) =>
        prev.map((r) => ({
          ...r,
          allocations: r.allocations.map((a) =>
            a.id === updated.id ? updated : a
          ),
        }))
      );
      if (action === "reject") {
        await loadState();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApprovingId(null);
    }
  }

  // Pending allocations for HITL
  const pendingAllocations = allocations.filter((a) => a.approval_status === "pending");
  const approvedAllocations = allocations.filter((a) => a.approval_status === "approved");
  const rejectedAllocations = allocations.filter((a) => a.approval_status === "rejected");

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emergency Operations</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono">{emergencyId}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`badge ${connected ? "badge-green" : "badge-gray"}`}
          >
            {connected ? "● Connected" : "○ Disconnected"}
          </span>
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="btn-secondary"
          >
            {resolving ? "Resolving..." : "✅ Resolve"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Add Case + Cases */}
        <div className="lg:col-span-2 space-y-6">
          {/* Add Case Form */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Patient Case</h2>
            <form onSubmit={handleAddCase} className="flex flex-wrap items-end gap-3">
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-500 mb-1">Acuity (1-5)</label>
                <select
                  className="input"
                  value={acuity}
                  onChange={(e) => setAcuity(Number(e.target.value))}
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} — {n === 5 ? "Critical" : n === 4 ? "Serious" : n === 3 ? "Moderate" : n === 2 ? "Minor" : "Low"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">Required Resources</label>
                <input
                  type="text"
                  className="input"
                  value={requiredResources}
                  onChange={(e) => setRequiredResources(e.target.value)}
                  placeholder="icu_bed,staff"
                />
              </div>
              <button type="submit" disabled={addingCase} className="btn-primary">
                + Add Case
              </button>
            </form>

            {/* Quick presets */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => quickAdd(5, ["icu_bed", "staff"])}
                disabled={addingCase}
                className="text-xs px-3 py-1.5 rounded-full bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
              >
                🔴 Critical (ICU + Staff)
              </button>
              <button
                onClick={() => quickAdd(4, ["or_slot", "equipment"])}
                disabled={addingCase}
                className="text-xs px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                🟠 Serious (OR + Equipment)
              </button>
              <button
                onClick={() => quickAdd(3, ["er_bay"])}
                disabled={addingCase}
                className="text-xs px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors"
              >
                🟡 Moderate (ER Bay)
              </button>
              <button
                onClick={() => quickAdd(2, ["er_bay"])}
                disabled={addingCase}
                className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                🔵 Minor (ER Bay)
              </button>
            </div>
          </div>

          {/* Cases List */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Cases ({cases.length})
            </h2>
            {cases.length === 0 ? (
              <p className="text-sm text-gray-500">No cases yet. Add one above.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {cases.map((c) => (
                  <div key={c.id} className="py-3 flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                        c.acuity_score >= 4
                          ? "bg-red-100 text-red-700"
                          : c.acuity_score === 3
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {c.acuity_score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.required_resource_types.join(", ")}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">{c.id.slice(0, 12)}…</p>
                    </div>
                    <span
                      className={`badge ${
                        c.status === "allocated"
                          ? "badge-green"
                          : c.status === "pending"
                          ? "badge-yellow"
                          : "badge-gray"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rounds History */}
          {rounds.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Negotiation Rounds ({rounds.length})
              </h2>
              <div className="space-y-4">
                {rounds.map((round) => (
                  <div
                    key={round.roundId}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">
                        Round <span className="font-mono">{round.roundId.slice(0, 8)}…</span>
                      </h3>
                      <span className="text-xs text-gray-500">
                        {round.bids.length} bids · {round.allocations.length} allocations
                      </span>
                    </div>

                    {/* Bids */}
                    {round.bids.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">AI Resource Agent Bids</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {round.bids
                            .sort((a, b) => Number(b.bid_score) - Number(a.bid_score))
                            .map((bid) => (
                              <div
                                key={bid.id}
                                className="text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-gray-600">
                                    {bid.resource_id.slice(0, 8)}…
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      Number(bid.bid_score) >= 80
                                        ? "text-emerald-600"
                                        : Number(bid.bid_score) >= 50
                                        ? "text-amber-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {Number(bid.bid_score).toFixed(1)}
                                  </span>
                                </div>
                                <p className="text-gray-500 mt-1 line-clamp-2">{bid.reasoning}</p>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Allocations */}
                    {round.allocations.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">Allocations</p>
                        {round.allocations.map((alloc) => (
                          <AllocationRow
                            key={alloc.id}
                            allocation={alloc}
                            onApprove={() => handleApproval(alloc.id, "approve")}
                            onReject={() => handleApproval(alloc.id, "reject")}
                            disabled={approvingId === alloc.id}
                          />
                        ))}
                      </div>
                    )}

                    {/* Explanation */}
                    {round.explanation && (
                      <div className="mt-3 bg-brand-50 border border-brand-100 rounded-lg px-4 py-3">
                        <p className="text-xs font-medium text-brand-700 mb-1">AI Explanation</p>
                        <p className="text-sm text-brand-900">{round.explanation}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: HITL + SSE + Resources */}
        <div className="space-y-6">
          {/* HITL Panel */}
          {pendingAllocations.length > 0 && (
            <div className="card border-amber-200 bg-amber-50/50">
              <h2 className="text-lg font-semibold text-amber-900 mb-3">
                ⏳ Pending Review ({pendingAllocations.length})
              </h2>
              <div className="space-y-3">
                {pendingAllocations.map((alloc) => (
                  <AllocationRow
                    key={alloc.id}
                    allocation={alloc}
                    onApprove={() => handleApproval(alloc.id, "approve")}
                    onReject={() => handleApproval(alloc.id, "reject")}
                    disabled={approvingId === alloc.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Approved count */}
          {approvedAllocations.length > 0 && (
            <div className="card border-emerald-200">
              <div className="flex items-center gap-2 text-emerald-700">
                <span className="text-lg">✅</span>
                <span className="text-sm font-medium">{approvedAllocations.length} allocation(s) approved</span>
              </div>
            </div>
          )}

          {/* Rejected count */}
          {rejectedAllocations.length > 0 && (
            <div className="card border-red-200">
              <div className="flex items-center gap-2 text-red-700">
                <span className="text-lg">❌</span>
                <span className="text-sm font-medium">{rejectedAllocations.length} allocation(s) rejected</span>
              </div>
            </div>
          )}

          {/* Resources */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Resources</h2>
            {resources.length === 0 ? (
              <p className="text-sm text-gray-500">No resources available.</p>
            ) : (
              <div className="space-y-2">
                {resources.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50 border border-gray-100"
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        r.status === "available"
                          ? "bg-emerald-500"
                          : r.status === "occupied"
                          ? "bg-red-500"
                          : r.status === "reserved"
                          ? "bg-amber-500"
                          : "bg-gray-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.label}</p>
                      <p className="text-xs text-gray-500">
                        {r.type} · {r.department}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        r.status === "available"
                          ? "text-emerald-600"
                          : r.status === "occupied"
                          ? "text-red-600"
                          : r.status === "reserved"
                          ? "text-amber-600"
                          : "text-gray-500"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live SSE Stream */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Live Event Stream
              <span className={`ml-2 badge ${connected ? "badge-green" : "badge-gray"}`}>
                {connected ? "Connected" : "Waiting..."}
              </span>
            </h2>
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {sseEvents.length === 0 ? (
                <p className="text-sm text-gray-400">Waiting for events...</p>
              ) : (
                sseEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="text-xs px-3 py-2 rounded-lg bg-gray-50 border border-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono">{evt.time}</span>
                      <span
                        className={`font-semibold ${
                          evt.type === "connected"
                            ? "text-brand-600"
                            : evt.type === "bid_submitted"
                            ? "text-purple-600"
                            : evt.type === "round:completed"
                            ? "text-emerald-600"
                            : evt.type === "case_added"
                            ? "text-amber-600"
                            : evt.type === "emergency_resolved"
                            ? "text-red-600"
                            : "text-gray-700"
                        }`}
                      >
                        {evt.type}
                      </span>
                    </div>
                    {evt.type === "bid_submitted" && (
                      <BidPreview data={evt.data as Record<string, unknown>} />
                    )}
                    {evt.type === "round:completed" && (
                      <RoundPreview data={evt.data as Record<string, unknown>} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function AllocationRow({
  allocation,
  onApprove,
  onReject,
  disabled = false,
}: {
  allocation: Allocation;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  const statusColors: Record<AllocationApprovalStatus, string> = {
    pending: "badge-yellow",
    approved: "badge-green",
    rejected: "badge-red",
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white border border-gray-100">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">
          <span className="font-mono text-gray-500">{allocation.resource_id.slice(0, 8)}…</span>
          {" → "}
          <span className="font-mono text-gray-500">{allocation.case_id.slice(0, 8)}…</span>
        </p>
      </div>
      <span className={`badge ${statusColors[allocation.approval_status]}`}>
        {allocation.approval_status}
      </span>
      {allocation.approval_status === "pending" && (
        <div className="flex gap-1.5">
          <button
            onClick={onApprove}
            disabled={disabled}
            className="text-xs px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors font-medium disabled:opacity-50"
          >
            {disabled ? "..." : "✓ Approve"}
          </button>
          <button
            onClick={onReject}
            disabled={disabled}
            className="text-xs px-2.5 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
          >
            {disabled ? "..." : "✕ Reject"}
          </button>
        </div>
      )}
    </div>
  );
}

function BidPreview({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-1 text-gray-600">
      Resource <span className="font-mono">{String(data.resource_id || "").slice(0, 8)}…</span>{" "}
      scored <span className="font-bold">{String(data.bid_score)}</span>{" "}
      for case <span className="font-mono">{String(data.case_id || "").slice(0, 8)}…</span>
    </div>
  );
}

function RoundPreview({ data }: { data: Record<string, unknown> }) {
  const allocs = (data.allocations as unknown[]) || [];
  const explanation = data.explanation ? String(data.explanation) : null;
  return (
    <div className="mt-1 text-gray-600">
      {allocs.length} allocation(s) made
      {explanation && (
        <span className="block mt-1 text-gray-500 italic line-clamp-2">
          &ldquo;{explanation}&rdquo;
        </span>
      )}
    </div>
  );
}
