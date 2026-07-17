import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { UserRole } from "../types";

const ALL_NAV = [
  { to: "/", label: "Dashboard", icon: "📊", minRole: null as UserRole[] | null },
  { to: "/emergencies", label: "Emergencies", icon: "🚨", minRole: null },
  { to: "/resources", label: "Resources", icon: "🩺", minRole: null },
  { to: "/audit", label: "Audit Log", icon: "📋", minRole: ["admin", "department_head", "doctor", "nurse", "triage_officer"] as UserRole[] },
  { to: "/settings", label: "Settings", icon: "⚙️", minRole: ["admin"] as UserRole[] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  department_head: "Department Head",
  doctor: "Doctor",
  nurse: "Nurse",
  triage_officer: "Triage Officer",
  paramedic: "Paramedic",
  charge_nurse: "Charge Nurse",
};

export default function Layout() {
  const { hospitalName, userRole, userId, logout, hasRole } = useAuth();

  // Filter nav based on role
  const nav = ALL_NAV.filter(item => {
    if (!item.minRole) return true;
    if (!userRole) return true; // API key access sees everything
    return item.minRole.some(r => userRole === r) || userRole === "admin";
  });

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-gray-900 text-white flex flex-col">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🏥</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Siege</h1>
              <p className="text-[11px] text-gray-400 leading-tight">Emergency Resource Negotiation</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-600/20 text-brand-300"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-800 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {hospitalName || "Hospital"}
              </p>
              {userId && userRole && (
                <p className="text-[11px] text-brand-400 truncate">
                  {ROLE_LABELS[userRole] || userRole}
                </p>
              )}
              {!userId && (
                <p className="text-[11px] text-gray-500">API Key Access</p>
              )}
            </div>
            <button
              onClick={logout}
              className="text-gray-500 hover:text-white transition-colors text-sm"
              title="Sign out"
            >
              ↗
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
