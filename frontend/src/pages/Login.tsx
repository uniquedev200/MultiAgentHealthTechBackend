import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login, register, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-brand-50/30 to-gray-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <span className="text-4xl">🏥</span>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Siege</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Multi-Agent Emergency Resource Negotiation Platform
          </p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            {mode === "login" ? "Sign in to your hospital" : "Register your hospital"}
          </h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Hospital Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="General Hospital"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hospital.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Register"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              {mode === "login"
                ? "New hospital? Register here"
                : "Already registered? Sign in"}
            </button>
          </div>
        </div>

        {/* Demo hint */}
        <div className="mt-6 text-center text-xs text-gray-400">
          Demo: <code className="bg-gray-200/50 px-1.5 py-0.5 rounded">admin@generalhospital.demo</code>{" "}
          / <code className="bg-gray-200/50 px-1.5 py-0.5 rounded">demo1234</code>{" "}
          / API key <code className="bg-gray-200/50 px-1.5 py-0.5 rounded">gh-live-key-001</code>
        </div>
      </div>
    </div>
  );
}
