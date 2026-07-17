import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../contexts/AuthContext";
import type { Resource, AuditLogEntry } from "../types";

interface Stats {
  resources: Resource[];
  auditEntries: AuditLogEntry[];
  auditTotal: number;
  emergencyCount: number;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full access to all features including team management and settings.",
  department_head: "Can declare emergencies and approve allocations.",
  doctor: "Can add patient cases and view audit logs.",
  nurse: "Can add patient cases and view audit logs.",
  triage_officer: "Can add patient cases and view audit logs.",
  paramedic: "Can add patient cases.",
  charge_nurse: "Can add patient cases and view audit logs.",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const { userRole, hasRole } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const [resources, audit, emergencies] = await Promise.all([
          api.listResources(),
          api.getAuditLog(1, 5),
          api.getEmergencies(),
        ]);
        setStats({
          resources,
          auditEntries: audit.entries,
          auditTotal: audit.total,
          emergencyCount: emergencies.length,
        });
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

      {/* Role Info */}
      {userRole && (
        <div className="card mb-6 bg-brand-50/50 border-brand-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center text-lg">
              👤
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Logged in as: {userRole.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </p>
              <p className="text-xs text-brand-700">
                {ROLE_DESCRIPTIONS[userRole] || ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Resources" value={total} icon="🩺" color="brand" />
        <StatCard label="Available" value={available} icon="✅" color="emerald" />
        <StatCard label="Occupied" value={occupied} icon="🔒" color="amber" />
        <StatCard label="Active Emergencies" value={stats?.emergencyCount || 0} icon="🚨" color="red" />
      </div>

      {/* Quick actions */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {hasRole("admin", "department_head") && (
            <Link to="/emergencies" className="btn-primary">
              Declare Emergency
            </Link>
          )}
          <Link to="/emergencies" className="btn-secondary">
            View Emergencies
          </Link>
          <Link to="/resources" className="btn-secondary">
            Manage Resources
          </Link>
          {hasRole("admin") && (
            <Link to="/settings" className="btn-secondary">
              Settings
            </Link>
          )}
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
                    : entry.event_type === "case_added"
                    ? "📋"
                    : entry.event_type === "allocation_approved"
                    ? "👍"
                    : entry.event_type === "allocation_rejected"
                    ? "👎"
                    : "📝"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {entry.description || entry.event_type.replace(/_/g, " ")}
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
