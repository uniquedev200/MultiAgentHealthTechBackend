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
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your hospital settings</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">x</button>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {success}
          <button onClick={() => setSuccess("")} className="ml-2 font-bold">x</button>
        </div>
      )}

      <div className="space-y-6">
        {/* Hospital Profile */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Hospital Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hospital Name</label>
              <input type="text" className="input" value={hospitalName || ""} disabled />
            </div>
          </div>
        </div>

        {/* Team Management (admin only) */}
        {isAdmin && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Management</h2>

            {/* Add User Form */}
            <form onSubmit={handleCreateUser} className="border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Team Member</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input type="text" className="input" placeholder="Full Name" value={newName} onChange={e => setNewName(e.target.value)} required />
                <input type="email" className="input" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <select className="input" value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}>
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <input type="password" className="input" placeholder="Password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} />
              </div>
              <button type="submit" disabled={creatingUser} className="btn-primary text-sm">
                {creatingUser ? "Creating..." : "Add Member"}
              </button>
            </form>

            {/* User List */}
            {teamLoading ? (
              <p className="text-sm text-gray-400">Loading team...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-500">No team members found.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {users.map(user => (
                  <div key={user.id} className="py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                    <select
                      className="input text-sm w-44"
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
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
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-lg">
              ⚡
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Groq</h2>
              <p className="text-xs text-gray-500">Fast inference for resource agent bidding</p>
            </div>
            <div className="ml-auto">
              {status?.groq.configured ? (
                <span className="badge-green">Configured</span>
              ) : (
                <span className="badge-gray">Not configured</span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="password"
              className="input flex-1"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder={status?.groq.configured ? "••••••••••••••••••••" : "gsk_..."}
            />
            <button
              onClick={() => saveKey("groq")}
              disabled={saving === "groq"}
              className="btn-primary"
            >
              {saving === "groq" ? "Saving..." : "Save"}
            </button>
            {status?.groq.configured && (
              <button
                onClick={() => deleteKey("groq")}
                disabled={saving === "groq"}
                className="btn-danger"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Mistral */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-lg">
              🧠
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Mistral</h2>
              <p className="text-xs text-gray-500">High-quality reasoning for allocation explanations</p>
            </div>
            <div className="ml-auto">
              {status?.mistral.configured ? (
                <span className="badge-green">Configured</span>
              ) : (
                <span className="badge-gray">Not configured</span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="password"
              className="input flex-1"
              value={mistralKey}
              onChange={(e) => setMistralKey(e.target.value)}
              placeholder={status?.mistral.configured ? "••••••••••••••••••••" : "mist-..."}
            />
            <button
              onClick={() => saveKey("mistral")}
              disabled={saving === "mistral"}
              className="btn-primary"
            >
              {saving === "mistral" ? "Saving..." : "Save"}
            </button>
            {status?.mistral.configured && (
              <button
                onClick={() => deleteKey("mistral")}
                disabled={saving === "mistral"}
                className="btn-danger"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="card bg-brand-50/50 border-brand-100">
          <h3 className="text-sm font-semibold text-brand-900 mb-2">About BYOK</h3>
          <p className="text-sm text-brand-800 leading-relaxed">
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
