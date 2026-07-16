import { useEffect, useState } from "react";
import { api } from "../api";

interface KeyStatus {
  groq: { configured: boolean };
  mistral: { configured: boolean };
}

export default function SettingsPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [groqKey, setGroqKey] = useState("");
  const [mistralKey, setMistralKey] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const data = await api.getLLMKeyStatus();
      setStatus(data as unknown as KeyStatus);
    } catch (err) {
      console.error(err);
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your LLM provider keys (BYOK)</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">✕</button>
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="space-y-6">
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
