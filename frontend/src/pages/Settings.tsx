import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../contexts/AuthContext";
import type { User, UserRole } from "../types";

interface KeyStatus {
  groq: { configured: boolean };
  mistral: { configured: boolean };
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrator" },
  { value: "department_head", label: "Department Head" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "triage_officer", label: "Triage Officer" },
  { value: "paramedic", label: "Paramedic" },
  { value: "charge_nurse", label: "Charge Nurse" },
];

export default function SettingsPage() {
  const { hasRole, hospitalName } = useAuth();
  const isAdmin = hasRole("admin");

  // LLM Keys state
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [groqKey, setGroqKey] = useState("");
  const [mistralKey, setMistralKey] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Team state
  const [users, setUsers] = useState<User[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("doctor");
  const [newPassword, setNewPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    loadStatus();
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  async function loadStatus() {
    try {
      const data = await api.getLLMKeyStatus();
      setStatus(data as unknown as KeyStatus);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadUsers() {
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setTeamLoading(false);
    }
  }

  async function saveKey(provider: "groq" | "mistral") {
    const key = provider === "groq" ? groqKey : mistralKey;
    if (!key.trim()) {
      setError("Enter an API key first");
      return;
    }
    setSaving(provider);
    setError("");
    setSuccess("");
    try {
      await api.upsertLLMKey(provider, key.trim());
      setSuccess(`${provider.charAt(0).toUpperCase() + provider.slice(1)} key saved successfully`);
      if (provider === "groq") setGroqKey("");
      else setMistralKey("");
      await loadStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function deleteKey(provider: "groq" | "mistral") {
    setSaving(provider);
    setError("");
    setSuccess("");
    try {
      await api.deleteLLMKey(provider);
      setSuccess(`${provider.charAt(0).toUpperCase() + provider.slice(1)} key removed`);
      await loadStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreatingUser(true);
    try {
      await api.createUser(newEmail, newName, newRole, newPassword);
      setSuccess("User created successfully");
      setNewEmail("");
      setNewName("");
      setNewPassword("");
      setNewRole("doctor");
      await loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    try {
      await api.updateUserRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      setSuccess("Role updated");
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await api.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setSuccess("User deleted");
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Manage your hospital settings</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-950/20 border border-red-500/30 px-4 py-3 text-sm text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-2 font-bold hover:text-white transition-colors">x</button>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-emerald-950/20 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-300 flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess("")} className="ml-2 font-bold hover:text-white transition-colors">x</button>
        </div>
      )}

      <div className="space-y-6">
        {/* Hospital Profile */}
        <div className="glass-card-no-hover p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Hospital Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Hospital Name</label>
              <input type="text" className="glass-input w-full opacity-60" value={hospitalName || ""} disabled />
            </div>
          </div>
        </div>

        {/* Team Management (admin only) */}
        {isAdmin && (
          <div className="glass-card-no-hover p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Team Management</h2>

            {/* Add User Form */}
            <form onSubmit={handleCreateUser} className="border border-white/5 bg-white/[0.01] rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-200 mb-3">Add Team Member</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input type="text" className="glass-input w-full" placeholder="Full Name" value={newName} onChange={e => setNewName(e.target.value)} required />
                <input type="email" className="glass-input w-full" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <select className="glass-input w-full" value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}>
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value} className="bg-[#0c0f17] text-white">{r.label}</option>
                  ))}
                </select>
                <input type="password" className="glass-input w-full" placeholder="Password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} />
              </div>
              <button type="submit" disabled={creatingUser} className="glass-btn-primary text-sm">
                {creatingUser ? "Creating..." : "Add Member"}
              </button>
            </form>

            {/* User List */}
            {teamLoading ? (
              <p className="text-sm text-gray-400">Loading team...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-500">No team members found.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {users.map(user => (
                  <div key={user.id} className="py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{user.full_name}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                    <select
                      className="glass-input text-sm w-44"
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value} className="bg-[#0c0f17] text-white">{r.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Groq */}
        <div className="glass-card-no-hover p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Groq</h2>
              <p className="text-xs text-gray-400">Fast inference for resource agent bidding</p>
            </div>
            <div className="ml-auto">
              {status?.groq.configured ? (
                <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Configured</span>
              ) : (
                <span className="badge bg-gray-500/20 text-gray-400 border border-gray-500/30">Not configured</span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="password"
              className="glass-input flex-1"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder={status?.groq.configured ? "••••••••••••••••••••" : "gsk_..."}
            />
            <button
              onClick={() => saveKey("groq")}
              disabled={saving === "groq"}
              className="glass-btn-primary"
            >
              {saving === "groq" ? "Saving..." : "Save"}
            </button>
            {status?.groq.configured && (
              <button
                onClick={() => deleteKey("groq")}
                disabled={saving === "groq"}
                className="glass-btn-danger"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Mistral */}
        <div className="glass-card-no-hover p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Mistral</h2>
              <p className="text-xs text-gray-400">High-quality reasoning for allocation explanations</p>
            </div>
            <div className="ml-auto">
              {status?.mistral.configured ? (
                <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Configured</span>
              ) : (
                <span className="badge bg-gray-500/20 text-gray-400 border border-gray-500/30">Not configured</span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="password"
              className="glass-input flex-1"
              value={mistralKey}
              onChange={(e) => setMistralKey(e.target.value)}
              placeholder={status?.mistral.configured ? "••••••••••••••••••••" : "mist-..."}
            />
            <button
              onClick={() => saveKey("mistral")}
              disabled={saving === "mistral"}
              className="glass-btn-primary"
            >
              {saving === "mistral" ? "Saving..." : "Save"}
            </button>
            {status?.mistral.configured && (
              <button
                onClick={() => deleteKey("mistral")}
                disabled={saving === "mistral"}
                className="glass-btn-danger"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="glass-card-no-hover bg-brand-500/5 border-brand-500/20 p-5">
          <h3 className="text-sm font-semibold text-brand-300 mb-2">About BYOK</h3>
          <p className="text-sm text-gray-300 leading-relaxed">
            Bring Your Own Key lets you use your hospital's LLM credentials instead of
            the platform's default keys. Your keys are encrypted at rest using AES-256-GCM
            and are never exposed in API responses. If no key is configured, the platform's
            default key is used automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
