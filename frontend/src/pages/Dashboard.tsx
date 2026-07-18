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
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Overview of your hospital resources</p>
      </div>

      {/* Role Info */}
      {userRole && (
        <div className="glass-card-no-hover mb-6 bg-brand-500/5 border-brand-500/10 p-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-300">
                Logged in as: {userRole.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {ROLE_DESCRIPTIONS[userRole] || ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Resources" value={total} icon="%001" color="brand" />
        <StatCard label="Available" value={available} icon="%002" color="emerald" />
        <StatCard label="Occupied" value={occupied} icon="%003" color="amber" />
        <StatCard label="Active Emergencies" value={stats?.emergencyCount || 0} icon="%004" color="red" />
      </div>

      {/* Quick actions */}
      <div className="glass-card-no-hover p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {hasRole("admin", "department_head") && (
            <Link to="/emergencies" className="glass-btn-primary">
              Declare Emergency
            </Link>
          )}
          <Link to="/emergencies" className="glass-btn-secondary">
            View Emergencies
          </Link>
          <Link to="/resources" className="glass-btn-secondary">
            Manage Resources
          </Link>
          {hasRole("admin") && (
            <Link to="/settings" className="glass-btn-secondary">
              Settings
            </Link>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card-no-hover p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        {stats?.auditEntries.length === 0 ? (
          <p className="text-sm text-gray-500">No activity yet. Declare an emergency to get started.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {stats?.auditEntries.map((entry) => {
              const type = entry.event_type;
              const dotColor =
                type === "emergency_declared" ? "bg-red-500 shadow-sm shadow-red-500/50" :
                type === "round_saved" ? "bg-blue-500 shadow-sm shadow-blue-500/50" :
                type === "emergency_resolved" ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" :
                type === "case_added" ? "bg-amber-500 shadow-sm shadow-amber-500/50" :
                type === "allocation_approved" ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" :
                type === "allocation_rejected" ? "bg-red-500 shadow-sm shadow-red-500/50" :
                "bg-gray-500";

              return (
                <div key={entry.id} className="py-3.5 flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200">
                      {entry.description || entry.event_type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {stats && stats.auditTotal > 5 && (
          <Link
            to="/audit"
            className="mt-4 block text-center text-sm text-brand-400 hover:text-brand-300 font-medium transition-colors"
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
  const iconMap: Record<string, React.ReactNode> = {
    "%001": (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    "%002": (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    "%003": (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    "%004": (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    )
  };

  const iconElement = iconMap[icon] || <span>{icon}</span>;
  
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    brand: { bg: "bg-brand-500/10", text: "text-brand-400", ring: "border-brand-500/20" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "border-emerald-500/20" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-400", ring: "border-amber-500/20" },
    red: { bg: "bg-red-500/10", text: "text-red-400", ring: "border-red-500/20" },
  };

  const colors = colorMap[color] || colorMap.brand;

  return (
    <div className="glass-card p-5 flex items-center gap-4 group">
      <div
        className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6 ${colors.bg} ${colors.text} ${colors.ring}`}
      >
        {iconElement}
      </div>
      <div>
        <p className="text-2xl font-bold text-white leading-tight">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
