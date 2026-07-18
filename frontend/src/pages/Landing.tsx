import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Prism from "../components/Prism";

export default function LandingPage() {
  const { token } = useAuth();

  // Prism Settings for the Interactive Sandbox
  const [glow, setGlow] = useState(1.4);
  const [noise, setNoise] = useState(0.2);
  const [hueShift, setHueShift] = useState(0.5);
  const [colorFreq, setColorFreq] = useState(1.2);
  const [timeScale, setTimeScale] = useState(0.4);
  const [scale, setScale] = useState(3.6);
  const [animationType, setAnimationType] = useState<"rotate" | "hover" | "3drotate">("3drotate");

  return (
    <div className="min-h-screen bg-[#07090e] text-gray-100 overflow-x-hidden selection:bg-brand-500 selection:text-white font-sans">
      {/* Background radial effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[160px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#07090e]/75 border-b border-white/5 transition-all">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl animate-pulse">🏥</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                Siege <span className="text-xs bg-brand-500/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded-full">v1.0</span>
              </h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none">Emergency Negotiation</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#sandbox" className="hover:text-white transition-colors">Shader Sandbox</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#stats" className="hover:text-white transition-colors">Performance</a>
          </nav>

          <div className="flex items-center gap-4">
            {token ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 hover:shadow-lg hover:shadow-brand-500/25 transition-all duration-200"
              >
                Go to Console ↗
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-gray-900 px-4 py-2 text-sm font-medium hover:bg-gray-100 hover:shadow-lg hover:shadow-white/10 transition-all duration-200"
                >
                  Launch App
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative max-w-7xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold mb-6 w-fit animate-fade-in">
            <span>✨</span> Next-Gen AI Critical Care Coordination
          </div>
          
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
            Real-Time AI <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-400 via-blue-400 to-indigo-400">
              Resource Negotiation
            </span> <br />
            for Emergencies
          </h1>

          <p className="text-lg text-gray-400 mb-8 max-w-xl leading-relaxed">
            An autonomous hospital resource allocation framework. Per-resource Groq LLM agents evaluation, competing to assign ICU beds, ventilators, and surgeons in real time based on acuity.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            {token ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-brand-500 hover:shadow-xl hover:shadow-brand-500/30 transition-all duration-200"
              >
                Open Hospital Console
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-brand-500 hover:shadow-xl hover:shadow-brand-500/30 transition-all duration-200"
              >
                Register Hospital & Deploy
              </Link>
            )}
            <a
              href="#sandbox"
              className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-white/5 border border-white/10 px-6 py-3.5 text-base font-semibold text-gray-200 hover:bg-white/10 hover:text-white transition-all duration-200"
            >
              Test Hologram Shaders
            </a>
          </div>

          {/* Micro stats banner */}
          <div className="grid grid-cols-3 gap-6 border-t border-white/5 pt-8 max-w-lg">
            <div>
              <p className="text-2xl font-bold text-white">3.0s</p>
              <p className="text-xs text-gray-400">Negotiation Time</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">100%</p>
              <p className="text-xs text-gray-400">Clinician Control</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-400">AES-256</p>
              <p className="text-xs text-gray-400">Credential Encryption</p>
            </div>
          </div>
        </div>

        {/* Hero Interactive WebGL Visualizer */}
        <div className="lg:col-span-5 relative w-full aspect-square max-w-[450px] mx-auto lg:max-w-none">
          <div className="absolute inset-0 bg-gradient-to-t from-brand-500/20 to-transparent rounded-3xl blur-2xl opacity-60 pointer-events-none" />
          <div className="relative w-full h-full rounded-2xl border border-white/10 bg-[#0c0f17]/90 shadow-2xl shadow-brand-950/20 overflow-hidden flex flex-col justify-between">
            {/* Hologram Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#0c0f17]/70 backdrop-blur-sm z-10">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider">Holographic Neural Prism</span>
              </div>
              <span className="text-[10px] font-mono text-gray-500">RENDER_OK</span>
            </div>

            {/* WebGL Prism */}
            <div className="flex-1 w-full relative">
              <Prism
                animationType={animationType}
                timeScale={timeScale}
                height={3.8}
                baseWidth={5.5}
                scale={scale}
                hueShift={hueShift}
                colorFrequency={colorFreq}
                noise={noise}
                glow={glow}
                bloom={1.5}
                suspendWhenOffscreen={true}
              />
            </div>

            {/* Hologram Info Footer */}
            <div className="px-4 py-3 border-t border-white/5 bg-[#080a0f]/90 z-10 flex items-center justify-between text-[11px] font-mono text-gray-400">
              <div>
                <span>FREQ: {colorFreq.toFixed(1)}Hz</span>
                <span className="mx-2">•</span>
                <span>GLOW: {glow.toFixed(1)}</span>
              </div>
              <button 
                onClick={() => setHueShift(prev => (prev + 0.2) % 2.0)}
                className="text-brand-400 hover:text-brand-300 font-semibold transition-colors"
              >
                [SHIFT HUE]
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Shader Sandbox Section */}
      <section id="sandbox" className="py-20 border-t border-white/5 bg-[#080a0f]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Hologram Configuration Sandbox
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Test the properties of the high-performance WebGL shader, optimized to run at 60 FPS without tearing down the rendering context.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-[#0c0f17] border border-white/10 rounded-3xl p-6 lg:p-8 shadow-2xl">
            {/* Shader render window */}
            <div className="lg:col-span-6 relative aspect-[4/3] rounded-2xl bg-[#07090e] border border-white/5 overflow-hidden shadow-inner flex items-center justify-center">
              <Prism
                animationType={animationType}
                timeScale={timeScale}
                height={3.8}
                baseWidth={5.5}
                scale={scale}
                hueShift={hueShift}
                colorFrequency={colorFreq}
                noise={noise}
                glow={glow}
                bloom={1.5}
                suspendWhenOffscreen={true}
              />
              {/* Overlay HUD indicators */}
              <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 pointer-events-none">
                <p className="text-[10px] font-mono text-gray-400">SHADER MATRIX STATUS</p>
                <p className="text-xs font-mono text-brand-400 font-bold">ACTIVE - RENDERING CONTEXT FIXED</p>
              </div>
            </div>

            {/* Slider Controls */}
            <div className="lg:col-span-6 space-y-6">
              <h3 className="text-lg font-bold text-white border-b border-white/5 pb-3">Shader Parameters</h3>

              {/* Animation Type selector */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-400 mb-2">Animation Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["rotate", "3drotate", "hover"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setAnimationType(type)}
                      className={`py-2 px-3 text-xs font-mono rounded-lg border transition-all ${
                        animationType === type
                          ? "bg-brand-600/20 border-brand-500 text-brand-300 font-bold"
                          : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slider list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-gray-400">
                    <span>GLOW</span>
                    <span className="text-brand-400">{glow.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="3.0"
                    step="0.1"
                    value={glow}
                    onChange={(e) => setGlow(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-gray-400">
                    <span>HUE SHIFT</span>
                    <span className="text-brand-400">{hueShift.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="6.28"
                    step="0.05"
                    value={hueShift}
                    onChange={(e) => setHueShift(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-gray-400">
                    <span>NOISE LEVEL</span>
                    <span className="text-brand-400">{noise.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.5"
                    step="0.05"
                    value={noise}
                    onChange={(e) => setNoise(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-gray-400">
                    <span>COLOR FREQUENCY</span>
                    <span className="text-brand-400">{colorFreq.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="3.0"
                    step="0.1"
                    value={colorFreq}
                    onChange={(e) => setColorFreq(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-gray-400">
                    <span>TIME SCALE / SPEED</span>
                    <span className="text-brand-400">{timeScale.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="2.0"
                    step="0.05"
                    value={timeScale}
                    onChange={(e) => setTimeScale(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono text-gray-400">
                    <span>ZOOM SCALE</span>
                    <span className="text-brand-400">{scale.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="6.0"
                    step="0.1"
                    value={scale}
                    onChange={(e) => setScale(parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-brand-500/5 border border-brand-500/10 p-4 text-xs text-gray-400 space-y-2 leading-relaxed">
                <span className="font-bold text-brand-300">💡 Context-Safe Rendering:</span>
                <p>
                  Extracting variables like <code className="text-brand-400">offsetX</code> and <code className="text-brand-400">offsetY</code> into local primitive variables prevents the React <code className="text-brand-400">useEffect</code> from triggering on object reference changes. This guarantees zero frame drops and continuous WebGL updates.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Pillars / Features Grid */}
      <section id="features" className="py-20 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Core Technology Pillars</h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            Engineered to handle resource scarcity during high-acuity crisis events.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon="🤖"
            title="Autonomous Bidders"
            description="Per-resource LLM agents dynamically analyze triage data and compete to allocate resources based on strict medical criteria."
          />
          <FeatureCard
            icon="⚡"
            title="High-Fidelity Streams"
            description="Server-Sent Events (SSE) broadcast live case admissions, active bids, and emergency status changes in real-time."
          />
          <FeatureCard
            icon="🤝"
            title="Clinician HITL Check"
            description="Final approval remains with human operators. Rejecting allocations immediately returns resources back to the pool."
          />
          <FeatureCard
            icon="🔒"
            title="Audit Chain Security"
            description="All allocation bids and manual interventions are linked together with cryptographic hash chains to ensure complete tamper resistance."
          />
        </div>
      </section>

      {/* Statistics section */}
      <section id="stats" className="py-16 bg-[#0c0f17] border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
          <div className="space-y-2">
            <h4 className="text-4xl font-extrabold text-white">&lt; 3.0s</h4>
            <p className="text-sm text-gray-400 font-mono">NEGOTIATION COMPLETED</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-4xl font-extrabold text-brand-400">60 FPS</h4>
            <p className="text-sm text-gray-400 font-mono">WEBGL SHADER RENDER</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-4xl font-extrabold text-emerald-400">0 ms</h4>
            <p className="text-sm text-gray-400 font-mono">ROUND DEBOUNCE DRIFT</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-4xl font-extrabold text-indigo-400">100%</h4>
            <p className="text-sm text-gray-400 font-mono">HITL TAMPER AUDITING</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 bg-[#07090e] text-center text-sm text-gray-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏥</span>
            <span className="font-semibold text-white">Siege Platform</span>
          </div>
          <p>© 2026 Siege Emergency Network. Built for secure clinical operations.</p>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-emerald-500">● LIVE CONNECTION</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-400">BYOK SECURE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="group relative rounded-2xl bg-[#0c0f17] border border-white/5 p-6 hover:border-white/10 hover:bg-[#0f131d] transition-all duration-200 flex flex-col gap-4">
      {/* Glow border hover effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/0 to-brand-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
