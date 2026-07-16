import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Resource, AuditLogEntry } from "../types";

interface Stats {
  resources: Resource[];
  auditEntries: AuditLogEntry[];
  auditTotal: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [resources, audit] = await Promise.all([
          api.listResources(),
          api.getAuditLog(1, 5),
        ]);
        setStats({ resources, auditEntries: audit.entries, auditTotal: audit.total });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading dashboard...</div>;
  }

  const available = stats?.resources.filter((r) => r.status === "available").length || 0;
  const occupied = stats?.resources.filter((r) => r.status === "occupied").length || 0;
  const offline = stats?.resources.filter((r) => r.status === "offline").length || 0;
  const total = stats?.resources.length || 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your hospital resources</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Resources"
          value={total}
          icon="🩺"
          color="brand"
        />
        <StatCard
          label="Available"
          value={available}
          icon="✅"
          color="emerald"
        />
        <StatCard
          label="Occupied"
          value={occupied}
          icon="🔒"
          color="amber"
        />
        <StatCard
          label="Offline"
          value={offline}
          icon="⛔"
          color="red"
        />
      </div>

      {/* Quick actions */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/emergencies" className="btn-primary">
            🚨 Declare Emergency
          </Link>
          <Link to="/resources" className="btn-secondary">
            🩺 Manage Resources
          </Link>
          <Link to="/settings" className="btn-secondary">
            ⚙️ LLM Keys
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        {stats?.auditEntries.length === 0 ? (
          <p className="text-sm text-gray-500">No activity yet. Declare an emergency to get started.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats?.auditEntries.map((entry) => (
              <div key={entry.id} className="py-3 flex items-start gap-3">
                <span className="mt-0.5 text-sm">
                  {entry.event_type === "emergency_declared"
                    ? "🚨"
                    : entry.event_type === "round_saved"
                    ? "🤖"
                    : entry.event_type === "emergency_resolved"
                    ? "✅"
                    : "📝"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {entry.event_type.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {stats && stats.auditTotal > 5 && (
          <Link
            to="/audit"
            className="mt-4 block text-center text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            View all {stats.auditTotal} entries →
          </Link>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700 ring-brand-600/10",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/10",
    red: "bg-red-50 text-red-700 ring-red-600/10",
  };

  return (
    <div className="card flex items-center gap-4">
      <div
        className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl ring-1 ${colorMap[color] || colorMap.brand}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}
