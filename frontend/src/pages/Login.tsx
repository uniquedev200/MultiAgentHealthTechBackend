import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";

const HospitalIcon = () => (
  <svg className="w-10 h-10 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

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
    <div className="min-h-screen flex items-center justify-center bg-[#07090e] px-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-brand-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[250px] h-[250px] bg-emerald-500/3 rounded-full blur-[80px] pointer-events-none" />
      <InteractiveBackground />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <HospitalIcon />
            <h1 className="text-3xl font-bold text-white tracking-tight">Siege</h1>
          </div>
          <p className="text-gray-400 text-sm">
            Multi-Agent Emergency Resource Negotiation Platform
          </p>
        </div>

        {/* Card */}
        <div className="glass-card-no-hover p-8 border border-white/5">
          <h2 className="text-xl font-semibold text-white mb-6">
            {mode === "login" ? "Sign in to your hospital" : "Register your hospital"}
          </h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-950/20 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Hospital Name
                </label>
                <input
                  type="text"
                  className="glass-input w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="General Hospital"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="glass-input w-full"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hospital.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="glass-input w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-btn-primary w-full py-2.5 text-sm"
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
              className="text-sm text-brand-300 hover:text-brand-200 font-medium transition-colors"
            >
              {mode === "login"
                ? "New hospital? Register here"
                : "Already registered? Sign in"}
            </button>
          </div>
        </div>

        {/* Demo hint */}
        <div className="mt-6 text-center text-xs text-gray-500 leading-relaxed">
          Demo: <code className="bg-white/5 border border-white/5 text-gray-300 px-1.5 py-0.5 rounded font-mono">admin@generalhospital.demo</code>{" "}
          / <code className="bg-white/5 border border-white/5 text-gray-300 px-1.5 py-0.5 rounded font-mono">demo1234</code>{" "}
          <div className="mt-1">
            or API key <code className="bg-white/5 border border-white/5 text-gray-300 px-1.5 py-0.5 rounded font-mono">gh-live-key-001</code>
          </div>
        </div>
      </div>
    </div>
  );
}
