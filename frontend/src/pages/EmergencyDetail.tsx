import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
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
  const { addToast } = useToast();
  const { hasRole } = useAuth();

  const [cases, setCases] = useState<Case[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [sseEvents, setSseEvents] = useState<SSEEvent[]>([]);
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const [emergencyName, setEmergencyName] = useState("");

  // Clinical form state
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("unknown");
  const [medicalHistory, setMedicalHistory] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [triageNote, setTriageNote] = useState("");
  const [vitalHR, setVitalHR] = useState("");
  const [vitalBP, setVitalBP] = useState("");
  const [vitalSpO2, setVitalSpO2] = useState("");
  const [vitalTemp, setVitalTemp] = useState("");
  const [requiredResources, setRequiredResources] = useState("icu_bed,staff");
  const [addingCase, setAddingCase] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [showClinicalForm, setShowClinicalForm] = useState(true);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);

  // Batch mode
  const [batchMode, setBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState<Array<{
    patient_name: string; age: string; symptoms: string; triage_note: string;
    vital_signs: Record<string, unknown>; required_resource_types: string[];
    medical_history: string;
  }>>([]);
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Case detail expand
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);

  const evtId = useRef(0);
  const closeSSE = useRef<(() => void) | null>(null);

  // Load initial state
  const loadState = useCallback(async () => {
    try {
      const state = await api.getEmergencyState(emergencyId);
      setCases(state.cases);
      setResources(state.resources);
      if ((state as any).emergency?.name) {
        setEmergencyName((state as any).emergency.name);
      }
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
        const c = data as Case;
        const label = c.patient_name || (c.triage_note ? c.triage_note.split(",")[0] : c.id.slice(0, 8));
        addToast(`New case: ${label}`, "info");
        setCases((prev) => {
          if (prev.some((x) => x.id === c.id)) return prev;
          return [c, ...prev];
        });
      } else if (eventType === "bid_submitted") {
        addToast("Bid received from agent", "success");
      } else if (eventType === "round:completed") {
        const round = data as {
          roundId: string;
          allocations: Allocation[];
          explanation: string;
        };
        const count = round.allocations?.length || 0;
        addToast(
          count > 0
            ? `Round complete — ${count} allocation${count > 1 ? "s" : ""} ready for review`
            : "Round complete — no allocations",
          count > 0 ? "success" : "info"
        );
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
        addToast("Emergency resolved!", "success");
        setResolved(true);
        loadState();
      }
    });

    return () => {
      closeSSE.current?.();
    };
  }, [emergencyId, loadState]);

  // Add case with clinical data — acuity is auto-computed from vitals/symptoms/history
  async function handleAddCase(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setAddingCase(true);
    try {
      const types = requiredResources
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const vitalSigns: Record<string, unknown> = {};
      if (vitalHR) vitalSigns.heart_rate = Number(vitalHR);
      if (vitalBP) vitalSigns.blood_pressure = vitalBP;
      if (vitalSpO2) vitalSigns.sp_o2 = Number(vitalSpO2);
      if (vitalTemp) vitalSigns.temperature = Number(vitalTemp);

      await api.addCase(emergencyId, types, {
        patient_name: patientName || undefined,
        symptoms,
        vital_signs: Object.keys(vitalSigns).length > 0 ? vitalSigns : undefined,
        triage_note: triageNote,
        suggested_resource_types: types,
        age: patientAge ? Number(patientAge) : undefined,
        medical_history: medicalHistory || undefined,
      });

      // Reset form
      setPatientName("");
      setPatientAge("");
      setMedicalHistory("");
      setAllergies("");
      setMedications("");
      setSymptoms("");
      setTriageNote("");
      setVitalHR("");
      setVitalBP("");
      setVitalSpO2("");
      setVitalTemp("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingCase(false);
    }
  }

  // Quick add presets — acuity auto-computed from clinical data
  async function quickAdd(types: string[], symptomsText: string, vitals?: Record<string, unknown>, age?: number, history?: string) {
    setAddingCase(true);
    try {
      await api.addCase(emergencyId, types, {
        symptoms: symptomsText,
        vital_signs: vitals,
        triage_note: `Quick add: ${symptomsText}`,
        age,
        medical_history: history,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingCase(false);
    }
  }

  // Resolve
  async function handleResolve() {
    setShowResolveConfirm(true);
  }

  async function confirmResolve() {
    setShowResolveConfirm(false);
    setResolving(true);
    try {
      await api.resolveEmergency(emergencyId);
      setResolved(true);
      closeSSE.current?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResolving(false);
    }
  }

  // Batch: add current form to queue
  function handleBatchAdd() {
    const types = requiredResources.split(",").map(s => s.trim()).filter(Boolean);
    const vitalSigns: Record<string, unknown> = {};
    if (vitalHR) vitalSigns.heart_rate = Number(vitalHR);
    if (vitalBP) vitalSigns.blood_pressure = vitalBP;
    if (vitalSpO2) vitalSigns.sp_o2 = Number(vitalSpO2);
    if (vitalTemp) vitalSigns.temperature = Number(vitalTemp);

    setBatchQueue(prev => [...prev, {
      patient_name: patientName,
      age: patientAge,
      symptoms,
      triage_note: triageNote,
      vital_signs: vitalSigns,
      required_resource_types: types,
      medical_history: medicalHistory,
    }]);
    setPatientName("");
    setPatientAge("");
    setMedicalHistory("");
    setAllergies("");
    setMedications("");
    setSymptoms("");
    setTriageNote("");
    setVitalHR("");
    setVitalBP("");
    setVitalSpO2("");
    setVitalTemp("");
  }

  // Batch: submit all queued cases
  async function handleBatchSubmit() {
    if (batchQueue.length === 0) return;
    setSubmittingBatch(true);
    try {
      for (const item of batchQueue) {
        await api.addCase(emergencyId, item.required_resource_types, {
          patient_name: item.patient_name || undefined,
          symptoms: item.symptoms,
          vital_signs: Object.keys(item.vital_signs).length > 0 ? item.vital_signs : undefined,
          triage_note: item.triage_note,
          suggested_resource_types: item.required_resource_types,
          age: item.age ? Number(item.age) : undefined,
          medical_history: item.medical_history || undefined,
        });
      }
      addToast(`${batchQueue.length} cases submitted`, "success");
      setBatchQueue([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingBatch(false);
    }
  }

  // HITL: Approve / Reject Allocation
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

  // Case-level approve / reject
  const [approvingCaseId, setApprovingCaseId] = useState<string | null>(null);
  async function handleCaseApproval(caseId: string, action: "approve" | "reject") {
    setApprovingCaseId(caseId);
    try {
      const updated = action === "approve"
        ? await api.approveCase(caseId)
        : await api.rejectCase(caseId);
      setCases(prev => prev.map(c => c.id === updated.id ? updated : c));
      addToast(`${action === "approve" ? "Approved" : "Rejected"} case`, action === "approve" ? "success" : "info");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApprovingCaseId(null);
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
          <h1 className="text-2xl font-bold text-white">{emergencyName || "Emergency Operations"}</h1>
          <p className="text-sm text-gray-400 mt-1 font-mono">{emergencyId}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`badge ${connected ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-gray-500/20 text-gray-400 border border-gray-500/30"}`}
          >
            {connected ? "● Connected" : "○ Disconnected"}
          </span>
          {resolved && (
            <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Resolved</span>
          )}
          <button
            onClick={handleResolve}
            disabled={resolving || resolved}
            className="glass-btn-secondary disabled:opacity-50"
          >
            {resolving ? "Resolving..." : resolved ? "Resolved" : "Resolve"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-950/20 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-2 font-bold hover:text-white transition-colors">x</button>
        </div>
      )}

      {/* Resolve Confirmation Modal */}
      {showResolveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card-no-hover bg-[#0c0f17]/95 border border-white/10 p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">Resolve Emergency?</h3>
            <p className="text-sm text-gray-400 mb-6">This will mark the emergency as resolved and stop all negotiation rounds. Are you sure?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowResolveConfirm(false)} className="flex-1 glass-btn-secondary">Cancel</button>
              <button onClick={confirmResolve} disabled={resolving} className="flex-1 glass-btn-danger">{resolving ? "Resolving..." : "Yes, Resolve"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Add Case + Cases */}
        <div className="lg:col-span-2 space-y-6">
          {/* Add Case Form — Clinical */}
          {hasRole("admin", "department_head", "doctor", "nurse", "triage_officer", "paramedic", "charge_nurse") && (
            <div className="glass-card-no-hover p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {batchMode ? `Batch Submit Cases (${batchQueue.length} queued)` : "Add Patient Case"}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBatchMode(!batchMode)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${batchMode ? "bg-brand-500/20 text-brand-300 border border-brand-500/30" : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"}`}
                  >
                    {batchMode ? "Batch Mode ON" : "Batch Mode"}
                  </button>
                  <button
                    onClick={() => setShowClinicalForm(!showClinicalForm)}
                    className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
                  >
                    {showClinicalForm ? "Quick Mode" : "Clinical Mode"}
                  </button>
                </div>
              </div>

              {/* Batch Queue Preview */}
              {batchMode && batchQueue.length > 0 && (
                <div className="mb-4 border border-brand-500/20 rounded-lg bg-brand-500/5 p-3">
                  <p className="text-xs font-medium text-brand-300 mb-2">Queued Cases:</p>
                  <div className="space-y-1.5">
                    {batchQueue.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-gray-300">
                        <span>{item.patient_name || item.triage_note.split(",")[0] || `Patient ${i + 1}`}</span>
                        <button onClick={() => setBatchQueue(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 font-bold ml-2">x</button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleBatchSubmit}
                    disabled={submittingBatch}
                    className="mt-3 w-full glass-btn-primary text-sm"
                  >
                    {submittingBatch ? "Submitting..." : `Submit All ${batchQueue.length} Cases`}
                  </button>
                </div>
              )}

              {showClinicalForm ? (
                <form onSubmit={(e) => { e.preventDefault(); if (batchMode) { handleBatchAdd(); } else { handleAddCase(e); } }} className="space-y-4">
                  {/* Patient Info */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Patient Name</label>
                      <input type="text" className="glass-input w-full" value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="John Doe" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Age</label>
                      <input type="number" className="glass-input w-full" value={patientAge} onChange={e => setPatientAge(e.target.value)} placeholder="67" min="0" max="150" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Gender</label>
                      <select className="glass-input w-full" value={patientGender} onChange={e => setPatientGender(e.target.value)}>
                        <option value="male" className="bg-[#0c0f17] text-white">Male</option>
                        <option value="female" className="bg-[#0c0f17] text-white">Female</option>
                        <option value="non-binary" className="bg-[#0c0f17] text-white">Non-binary</option>
                        <option value="unknown" className="bg-[#0c0f17] text-white">Unknown</option>
                      </select>
                    </div>
                  </div>

                  {/* Medical History */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Medical History</label>
                    <textarea className="glass-input w-full" rows={2} value={medicalHistory} onChange={e => setMedicalHistory(e.target.value)} placeholder="Diabetes Type 2, Hypertension, COPD, Previous MI (2019)" />
                  </div>

                  {/* Allergies + Medications */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Allergies</label>
                      <input type="text" className="glass-input w-full" value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="Penicillin, Sulfa drugs" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Current Medications</label>
                      <input type="text" className="glass-input w-full" value={medications} onChange={e => setMedications(e.target.value)} placeholder="Metformin 1000mg, Lisinopril 20mg" />
                    </div>
                  </div>

                  {/* Symptoms */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Current Symptoms</label>
                    <textarea className="glass-input w-full" rows={2} value={symptoms} onChange={e => setSymptoms(e.target.value)} placeholder="Chest pain (sharp, left side), Shortness of breath, Diaphoresis, Nausea" />
                  </div>

                  {/* Vital Signs */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Vital Signs</label>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <input type="number" className="glass-input w-full text-sm" value={vitalHR} onChange={e => setVitalHR(e.target.value)} placeholder="HR: 120" />
                      </div>
                      <div>
                        <input type="text" className="glass-input w-full text-sm" value={vitalBP} onChange={e => setVitalBP(e.target.value)} placeholder="BP: 90/60" />
                      </div>
                      <div>
                        <input type="number" className="glass-input w-full text-sm" value={vitalSpO2} onChange={e => setVitalSpO2(e.target.value)} placeholder="SpO2: 92" min="0" max="100" />
                      </div>
                      <div>
                        <input type="number" className="glass-input w-full text-sm" value={vitalTemp} onChange={e => setVitalTemp(e.target.value)} placeholder="Temp: 38.5" step="0.1" />
                      </div>
                    </div>
                  </div>

                  {/* Triage Note + Required Resources */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-400 mb-1">Triage Note</label>
                      <input type="text" className="glass-input w-full" value={triageNote} onChange={e => setTriageNote(e.target.value)} placeholder="67yo male, acute onset chest pain, arrived via ambulance" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Required Resources</label>
                      <input type="text" className="glass-input w-full" value={requiredResources} onChange={e => setRequiredResources(e.target.value)} placeholder="icu_bed,staff" />
                    </div>
                  </div>

                  <button type="submit" disabled={addingCase} className="glass-btn-primary w-full">
                    {addingCase ? "Adding..." : batchMode ? "Add to Batch Queue" : "Create Case with Clinical Data"}
                  </button>
                </form>
              ) : (
                /* Quick mode — simple resources */
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-400 mb-1">Required Resources</label>
                      <input type="text" className="glass-input w-full" value={requiredResources} onChange={e => setRequiredResources(e.target.value)} placeholder="icu_bed,staff" />
                    </div>
                    <div className="flex items-end">
                      <button onClick={() => { const types = requiredResources.split(",").map(s=>s.trim()).filter(Boolean); api.addCase(emergencyId, types).then(()=>addToast("Case added","success")).catch((e:any)=>setError(e.message)); }} disabled={addingCase} className="glass-btn-primary">+ Add</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick presets — realistic clinical scenarios */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => quickAdd(
                    ["icu_bed", "staff"],
                    "Chest pain, respiratory distress, diaphoresis",
                    { heart_rate: 135, blood_pressure: "85/55", sp_o2: 88, temperature: 37.2 },
                    68, "History of MI, Diabetes Type 2"
                  )}
                  disabled={addingCase}
                  className="text-xs px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  Chest Pain (68yo, cardiac hx)
                </button>
                <button
                  onClick={() => quickAdd(
                    ["or_slot", "equipment"],
                    "Abdominal pain, suspected appendicitis, fever",
                    { heart_rate: 105, blood_pressure: "118/76", sp_o2: 97, temperature: 38.8 },
                    34, ""
                  )}
                  disabled={addingCase}
                  className="text-xs px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  Abdominal Pain (34yo, fever)
                </button>
                <button
                  onClick={() => quickAdd(
                    ["er_bay"],
                    "Laceration on forearm, bleeding controlled",
                    { heart_rate: 88, blood_pressure: "128/82", sp_o2: 98, temperature: 36.8 },
                    22, ""
                  )}
                  disabled={addingCase}
                  className="text-xs px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 hover:bg-yellow-500/20 transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  Laceration (22yo, stable)
                </button>
                <button
                  onClick={() => quickAdd(
                    ["er_bay"],
                    "Sprained ankle, minor swelling",
                    { heart_rate: 72, blood_pressure: "120/78", sp_o2: 99, temperature: 36.6 },
                    19, ""
                  )}
                  disabled={addingCase}
                  className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  Sprained Ankle (19yo, normal vitals)
                </button>
              </div>
            </div>
          )}

          {/* Cases List */}
          <div className="glass-card-no-hover p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Cases ({cases.length})
            </h2>
            {cases.length === 0 ? (
              <p className="text-sm text-gray-500">No cases yet. Add one above.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {cases.map((c) => (
                  <div key={c.id} className="py-3">
                    <div
                      className="flex items-start gap-3 cursor-pointer hover:bg-white/[0.03] hover:translate-x-1 rounded-lg px-2 py-1.5 -mx-2 transition-all duration-200"
                      onClick={() => setExpandedCaseId(expandedCaseId === c.id ? null : c.id)}
                    >
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 border ${
                          c.symptom_severity === "critical"
                            ? "bg-red-500/20 text-red-300 border-red-500/30"
                            : c.symptom_severity === "severe"
                            ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                            : c.symptom_severity === "moderate"
                            ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                            : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                        }`}
                      >
                        {c.symptom_severity === "critical" ? "5" : c.symptom_severity === "severe" ? "4" : c.symptom_severity === "moderate" ? "3" : "1"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">
                          {c.patient_name || (c.triage_note ? c.triage_note.split(",")[0] : (c.symptoms || c.required_resource_types.join(", ")))}
                        </p>
                        {c.symptoms && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{c.symptoms}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            c.symptom_severity === "critical" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                            c.symptom_severity === "severe" ? "bg-orange-500/20 text-orange-300 border-orange-500/30" :
                            c.symptom_severity === "moderate" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" :
                            "bg-green-500/20 text-green-300 border-green-500/30"
                          }`}>{c.symptom_severity}</span>
                          {c.vital_signs && typeof c.vital_signs === "object" && "sp_o2" in (c.vital_signs as any) && (
                            <span className="text-[10px] text-gray-500">SpO2: {(c.vital_signs as any).sp_o2}%</span>
                          )}
                          <span className="text-[10px] text-gray-500 font-mono">{c.id.slice(0, 8)}...</span>
                          <span className="text-[10px] text-gray-400">{expandedCaseId === c.id ? "▲" : "▼"}</span>
                        </div>
                      </div>
                      <span
                        className={`badge flex-shrink-0 ${
                          c.status === "approved"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : c.status === "allocated"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : c.status === "rejected"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : c.status === "pending"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>

                    {/* Expanded case details */}
                    {expandedCaseId === c.id && (
                      <div className="mt-2 ml-[52px] border-l-2 border-white/10 pl-4 space-y-2 text-xs text-gray-300">
                        {c.patient_name && <p><span className="font-medium text-gray-400">Patient:</span> {c.patient_name}</p>}
                        {c.triage_note && <p><span className="font-medium text-gray-400">Triage:</span> {c.triage_note}</p>}
                        {c.symptoms && <p><span className="font-medium text-gray-400">Symptoms:</span> {c.symptoms}</p>}
                        {c.vital_signs && typeof c.vital_signs === "object" && Object.keys(c.vital_signs).length > 0 && (
                          <p>
                            <span className="font-medium text-gray-400">Vitals:</span>{" "}
                            {Object.entries(c.vital_signs as Record<string, unknown>).map(([k, v]) => `${k}=${v}`).join(", ")}
                          </p>
                        )}
                        {c.required_resource_types.length > 0 && (
                          <p><span className="font-medium text-gray-400">Resources:</span> {c.required_resource_types.join(", ")}</p>
                        )}
                        {c.status === "pending" && hasRole("admin", "department_head", "doctor", "triage_officer") && (
                          <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCaseApproval(c.id, "approve"); }}
                              disabled={approvingCaseId === c.id}
                              className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors font-medium disabled:opacity-50"
                            >
                              {approvingCaseId === c.id ? "..." : "Approve"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCaseApproval(c.id, "reject"); }}
                              disabled={approvingCaseId === c.id}
                              className="text-xs px-3 py-1.5 rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors font-medium disabled:opacity-50"
                            >
                              {approvingCaseId === c.id ? "..." : "Reject"}
                            </button>
                          </div>
                        )}
                        {c.status === "approved" && (
                          <p className="text-emerald-400 font-medium mt-1 pt-2 border-t border-white/5">Approved</p>
                        )}
                        {c.status === "rejected" && (
                          <p className="text-red-400 font-medium mt-1 pt-2 border-t border-white/5">Rejected</p>
                        )}
                        {(() => {
                          const caseAlloc = allocations.find(a => a.case_id === c.id && a.approval_status === "pending");
                          if (caseAlloc && hasRole("admin", "department_head")) {
                            return (
                              <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleApproval(caseAlloc.id, "approve"); }}
                                  disabled={approvingId === caseAlloc.id}
                                  className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors font-medium disabled:opacity-50"
                                >
                                  {approvingId === caseAlloc.id ? "..." : "Approve Allocation"}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleApproval(caseAlloc.id, "reject"); }}
                                  disabled={approvingId === caseAlloc.id}
                                  className="text-xs px-3 py-1.5 rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors font-medium disabled:opacity-50"
                                >
                                  {approvingId === caseAlloc.id ? "..." : "Reject Allocation"}
                                </button>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rounds History */}
          {rounds.length > 0 && (
            <div className="glass-card-no-hover p-6">
              <h2 className="text-lg font-semibold text-white mb-4">
                Negotiation Rounds ({rounds.length})
              </h2>
              <div className="space-y-4">
                {rounds.map((round) => (
                  <div
                    key={round.roundId}
                    className="border border-white/5 bg-white/[0.01] rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">
                        Round <span className="font-mono text-gray-400">{round.roundId.slice(0, 8)}...</span>
                      </h3>
                      <span className="text-xs text-gray-500">
                        {round.bids.length} bids · {round.allocations.length} allocations
                      </span>
                    </div>

                    {round.bids.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-gray-400 mb-2">AI Resource Agent Bids</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {round.bids
                            .sort((a, b) => Number(b.bid_score) - Number(a.bid_score))
                            .map((bid) => (
                              <div
                                key={bid.id}
                                className="text-xs bg-white/[0.02] rounded-lg px-3 py-2 border border-white/5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-gray-400">
                                    {bid.resource_id.slice(0, 8)}...
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      Number(bid.bid_score) >= 0.7
                                        ? "text-emerald-400"
                                        : Number(bid.bid_score) >= 0.4
                                        ? "text-amber-400"
                                        : "text-red-400"
                                    }`}
                                  >
                                    {(Number(bid.bid_score) * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <p className="text-gray-400 mt-1 line-clamp-2 leading-relaxed">{bid.reasoning}</p>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {round.allocations.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-gray-400 mb-2">Allocations</p>
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

                    {round.explanation && (
                      <div className="mt-3 bg-[#1d6ef1]/5 border border-brand-500/20 rounded-lg px-4 py-3">
                        <p className="text-xs font-medium text-brand-300 mb-1">AI Explanation</p>
                        <p className="text-sm text-gray-300 leading-relaxed">{round.explanation}</p>
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
          {pendingAllocations.length > 0 && (
            <div className="glass-card-no-hover border-amber-500/20 bg-amber-500/5 p-6">
              <h2 className="text-lg font-semibold text-amber-300 mb-3">
                Pending Review ({pendingAllocations.length})
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

          {approvedAllocations.length > 0 && (
            <div className="glass-card-no-hover border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="text-lg">✅</span>
                <span className="text-sm font-medium">{approvedAllocations.length} allocation(s) approved</span>
              </div>
            </div>
          )}

          {rejectedAllocations.length > 0 && (
            <div className="glass-card-no-hover border-red-500/20 bg-red-500/5 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-red-400">
                <span className="text-lg">❌</span>
                <span className="text-sm font-medium">{rejectedAllocations.length} allocation(s) rejected</span>
              </div>
            </div>
          )}

          <div className="glass-card-no-hover p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Resources</h2>
            {resources.length === 0 ? (
              <p className="text-sm text-gray-500">No resources available.</p>
            ) : (
              <div className="space-y-2">
                {resources.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-white/[0.01] border border-white/5"
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        r.status === "available"
                          ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                          : r.status === "occupied"
                          ? "bg-red-500 shadow-sm shadow-red-500/50"
                          : r.status === "reserved"
                          ? "bg-amber-500 shadow-sm shadow-amber-500/50"
                          : "bg-gray-600"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{r.label}</p>
                      <p className="text-xs text-gray-500">
                        {r.type} · {r.department}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        r.status === "available"
                          ? "text-emerald-400"
                          : r.status === "occupied"
                          ? "text-red-400"
                          : r.status === "reserved"
                          ? "text-amber-400"
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

          <div className="glass-card-no-hover p-6">
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center justify-between">
              <span>Live Event Stream</span>
              <span className={`badge ${connected ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-gray-500/20 text-gray-400 border border-gray-500/30"}`}>
                {connected ? "Connected" : "Waiting..."}
              </span>
            </h2>
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {sseEvents.length === 0 ? (
                <p className="text-sm text-gray-500">Waiting for events...</p>
              ) : (
                sseEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="text-xs px-3 py-2.5 rounded-lg bg-white/[0.01] border border-white/5"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`font-semibold uppercase tracking-wider text-[10px] ${
                          evt.type === "connected"
                            ? "text-brand-400"
                            : evt.type === "bid_submitted"
                            ? "text-purple-400"
                            : evt.type === "round:completed"
                            ? "text-emerald-400"
                            : evt.type === "case_added"
                            ? "text-amber-400"
                            : evt.type === "emergency_resolved"
                            ? "text-red-400"
                            : "text-gray-400"
                        }`}
                      >
                        {evt.type}
                      </span>
                      <span className="text-[9px] text-gray-500 font-mono">{evt.time}</span>
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
    pending: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    approved: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/[0.02] border border-white/5 mb-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300">
          <span className="font-mono text-gray-500">{allocation.resource_id.slice(0, 8)}...</span>
          {" -> "}
          <span className="font-mono text-gray-500">{allocation.case_id.slice(0, 8)}...</span>
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
            className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors font-medium disabled:opacity-50"
          >
            {disabled ? "..." : "Approve"}
          </button>
          <button
            onClick={onReject}
            disabled={disabled}
            className="text-xs px-2.5 py-1 rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors font-medium disabled:opacity-50"
          >
            {disabled ? "..." : "Reject"}
          </button>
        </div>
      )}
    </div>
  );
}

function BidPreview({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-1 text-gray-400">
      Resource <span className="font-mono text-gray-300">{String(data.resource_id || "").slice(0, 8)}...</span>{" "}
      scored <span className="font-bold text-emerald-400">{String(data.bid_score)}</span>{" "}
      for case <span className="font-mono text-gray-300">{String(data.case_id || "").slice(0, 8)}...</span>
    </div>
  );
}

function RoundPreview({ data }: { data: Record<string, unknown> }) {
  const allocs = (data.allocations as unknown[]) || [];
  const explanation = data.explanation ? String(data.explanation) : null;
  return (
    <div className="mt-1 text-gray-400">
      {allocs.length} allocation(s) made
      {explanation && (
        <span className="block mt-1 text-gray-500 italic line-clamp-2">
          &ldquo;{explanation}&rdquo;
        </span>
      )}
    </div>
  );
}
