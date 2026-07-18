import { useState, useEffect, useRef } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { UserRole } from "../types";

const DashboardIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

const EmergenciesIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const ResourcesIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const AuditLogIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const HospitalIcon = () => (
  <svg className="w-5 h-5 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const ALL_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: <DashboardIcon />, minRole: null as UserRole[] | null },
  { to: "/emergencies", label: "Emergencies", icon: <EmergenciesIcon />, minRole: null },
  { to: "/resources", label: "Resources", icon: <ResourcesIcon />, minRole: null },
  { to: "/audit", label: "Audit Log", icon: <AuditLogIcon />, minRole: ["admin", "department_head", "doctor", "nurse", "triage_officer"] as UserRole[] },
  { to: "/settings", label: "Settings", icon: <SettingsIcon />, minRole: ["admin"] as UserRole[] },
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

function InteractiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const mouse = { x: -1000, y: -1000 };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;

      // Spotlight sheen delegation for glass cards
      const target = e.target as HTMLElement;
      const card = target.closest(".glass-card, .glass-card-no-hover") as HTMLElement;
      if (card) {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty("--mouse-x", `${x}px`);
        card.style.setProperty("--mouse-y", `${y}px`);
      }
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);

    const drawRibbon = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      time: number,
      offset: number,
      colorPrefix: string,
      heightRatio: number
    ) => {
      const strandCount = 8;
      for (let i = 0; i < strandCount; i++) {
        ctx.beginPath();
        const opacity = (1 - i / (strandCount - 1 || 1)) * 0.10 + 0.02; // highly visible glowing ribbons
        ctx.strokeStyle = `${colorPrefix}, ${opacity})`;
        ctx.lineWidth = i === 0 ? 1.75 : 0.75;

        const phaseOffset = offset + i * 0.04;

        for (let x = 0; x <= width; x += 15) {
          // Double sine wave combination
          let y = height * heightRatio + 
                  Math.sin(x * 0.0018 + time * 0.5 + phaseOffset) * 110 + 
                  Math.cos(x * 0.0008 - time * 0.25 + phaseOffset * 1.3) * 50;

          // Mouse attraction: smooth gravity pull towards cursor
          if (mouse.x > 0) {
            const dx = mouse.x - x;
            const dist = Math.abs(dx);
            if (dist < 260) {
              const factor = (1 - dist / 260) * 0.35;
              y += (mouse.y - y) * factor;
            }
          }

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const time = Date.now() * 0.0012;

      // 1. Draw Spotlight Glow Overlay
      if (mouse.x > 0) {
        const gradient = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          320
        );
        gradient.addColorStop(0, "rgba(59, 130, 246, 0.05)");
        gradient.addColorStop(0.5, "rgba(16, 185, 129, 0.015)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Draw Ribbon 1: Brand Blue (top-center)
      drawRibbon(ctx, width, height, time, 0, "rgba(59, 130, 246", 0.42);

      // 3. Draw Ribbon 2: Emerald Green (bottom-center)
      drawRibbon(ctx, width, height, time + 4.2, 2.5, "rgba(16, 185, 129", 0.58);

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />;
}

export default function Layout() {
  const { hospitalName, userRole, userId, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  const nav = ALL_NAV.filter(item => {
    if (!item.minRole) return true;
    if (!userRole) return true;
    return item.minRole.some(r => userRole === r) || userRole === "admin";
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090e] text-gray-100 relative">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className={`absolute bottom-0 w-[300px] h-[300px] bg-emerald-500/3 rounded-full blur-[80px] pointer-events-none transition-all duration-300 ${isCollapsed ? "left-16" : "left-64"}`} />
      <InteractiveBackground />

      {/* Sidebar */}
      <aside className={`flex-shrink-0 bg-[#0a0d14] border-r border-white/5 text-white flex flex-col z-10 relative transition-all duration-300 ${isCollapsed ? "w-16" : "w-64"}`}>
        {/* Toggle Button */}
        <button
          onClick={toggleCollapsed}
          className="absolute top-6 -right-3 w-6 h-6 rounded-full bg-[#111622] border border-white/10 hover:border-white/20 text-gray-400 hover:text-white flex items-center justify-center text-[10px] transition-all shadow-md z-20 hover:scale-110 active:scale-90"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? "▶" : "◀"}
        </button>

        <div className="px-4 py-5 border-b border-white/5">
          <div className={`flex items-center gap-2.5 ${isCollapsed ? "justify-center" : ""}`}>
            <HospitalIcon />
            {!isCollapsed && (
              <div className="transition-opacity duration-300 opacity-100">
                <h1 className="text-lg font-bold tracking-tight text-white">Siege</h1>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider leading-tight">Negotiation Console</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1.5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              className={({ isActive }) =>
                `flex items-center rounded-lg py-2.5 text-sm font-medium transition-all duration-200 border ${
                  isCollapsed ? "justify-center px-0 w-10 h-10 mx-auto" : "px-3 gap-3 w-full"
                } ${
                  isActive
                    ? "bg-brand-500/10 text-brand-300 border-brand-500/20 shadow-md shadow-brand-500/5 hover:scale-[1.01]"
                    : "text-gray-400 border-transparent hover:bg-white/[0.02] hover:text-white hover:border-white/5" + (isCollapsed ? "" : " hover:translate-x-1")
                }`
              }
            >
              <span className="text-base flex-shrink-0 flex items-center justify-center">{item.icon}</span>
              {!isCollapsed && (
                <span className="transition-opacity duration-300 opacity-100 truncate">{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/5 bg-[#080a0f]/90 px-4 py-4">
          <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">
                  {hospitalName || "Hospital"}
                </p>
                {userId && userRole && (
                  <p className="text-[10px] text-brand-400 font-mono truncate uppercase tracking-wider mt-0.5">
                    {ROLE_LABELS[userRole] || userRole}
                  </p>
                )}
                {!userId && (
                  <p className="text-[10px] text-gray-500 font-mono truncate uppercase tracking-wider mt-0.5">API Key Access</p>
                )}
              </div>
            )}
            <button
              onClick={logout}
              className="text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg border border-white/5 transition-all duration-200 hover:scale-105 active:scale-95 text-sm flex-shrink-0 flex items-center justify-center"
              title="Sign out"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
