"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(MOTION_QUERY).matches, () => true);
}

/** Decorative Canvas 2D: no network requests, WebGL or animation dependencies. */
export function GostayaVortex({ className = "" }: { className?: string; lang?: "bg" | "en" | "de" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let width = 1, height = 1, visible = false, frame = 0, last = 0, phase = 0;
    // Deterministic seeds; no React updates per frame.
    const particles = Array.from({ length: 280 }, (_, i) => ({
      t: i / 280, size: .8 + ((i * 17) % 11) / 12, arm: i % 3,
    }));
    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, width, height);
      const radius = Math.min(width * .43, height * 1.08);
      const count = width < 350 ? 160 : particles.length;
      for (let i = 0; i < count; i++) {
        const p = particles[Math.floor(i * particles.length / count)];
        const distance = .13 + p.t * .87;
        const angle = p.t * Math.PI * 5 + p.arm * (Math.PI * 2 / 3) + phase;
        const px = Math.cos(angle) * radius * distance;
        const py = Math.sin(angle) * radius * distance;
        const pz = Math.sin(p.t * Math.PI * 4 + phase) * radius * .22;
        const tilt = .98, yaw = Math.sin(phase * .7) * .24;
        const ty = py * Math.cos(tilt) - pz * Math.sin(tilt);
        const tz = py * Math.sin(tilt) + pz * Math.cos(tilt);
        const tx = px * Math.cos(yaw) + tz * Math.sin(yaw);
        const depth = -px * Math.sin(yaw) + tz * Math.cos(yaw);
        const perspective = 520 / (520 + depth);
        const x = width / 2 + tx * perspective;
        const y = height / 2 + ty * perspective;
        ctx.globalAlpha = Math.max(.2, Math.min(1, .6 - depth / (radius * 2)));
        ctx.fillStyle = i % 4 === 0 ? "#ffffff" : i % 2 ? "#d8b4fe" : "#a855f7";
        ctx.beginPath();
        ctx.arc(x, y, p.size * perspective, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function stop() { cancelAnimationFrame(frame); frame = 0; last = 0; }
    function tick(now: number) {
      if (!last) last = now;
      const elapsed = now - last;
      // Draw at approximately 30 fps even on high refresh-rate displays.
      if (elapsed >= 1000 / 30) {
        phase += Math.min(elapsed, 100) * .00013;
        last = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      stop();
      if (visible && !document.hidden && !reducedMotion) frame = requestAnimationFrame(tick);
      else draw();
    }
    function resize() {
      if (!canvas || !ctx) return;
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    }
    const resizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    resizeObserver.observe(canvas); visibilityObserver.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    resize();
    return () => { stop(); resizeObserver.disconnect(); visibilityObserver.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [reducedMotion]);

  return <div className={`gostaya-vortex ${className}`}>
    <canvas ref={canvasRef} aria-hidden="true" />

  </div>;
}

export type GostayaTab = { id: string; label: string; content: ReactNode };

/** Keep tab IDs stable. Manual interaction stops rotation until explicitly resumed. */
export function GostayaRotatingTabs({ tabs, label = "Модули на GOSTAYA", intervalMs = 8000, lang = "bg" }: {
  tabs: readonly GostayaTab[]; label?: string; intervalMs?: number; lang?: "bg" | "en" | "de";
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const reduced = useReducedMotion();
  const active = tabs.length ? Math.min(index, tabs.length - 1) : 0;
  const rotating = playing && !hovered && visible && pageVisible && !reduced && tabs.length > 1;

  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .2 });
    observer.observe(root.current);
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    update();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % tabs.length), Math.max(5000, intervalMs));
    return () => window.clearTimeout(timer);
  }, [rotating, active, intervalMs, tabs.length]);

  function select(next: number, focus = false) {
    setPlaying(false); setIndex(next);
    if (focus) buttons.current[next]?.focus();
  }
  if (!tabs.length) return null;
  return <div ref={root} className="gostaya-tabs"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={event => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-rotation-control]")) setPlaying(false);
    }}>
    {!reduced && tabs.length > 1 ? <button type="button" className="gostaya-tabs-toggle" data-rotation-control
      onClick={() => setPlaying(value => !value)}>{lang === "bg" ? (playing ? "Пауза" : "Автоматичен преглед") : lang === "de" ? (playing ? "Pause" : "Automatisch anzeigen") : (playing ? "Pause" : "Auto preview")}</button> : null}
    <div className="gostaya-tabs-nav" role="tablist" aria-label={label}
      style={{ "--tab-count": tabs.length, "--tab-index": active } as CSSProperties}>
      {tabs.map((tab, i) => <button key={tab.id} ref={element => { buttons.current[i] = element; }}
        id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`} type="button" role="tab"
        aria-selected={active === i} tabIndex={active === i ? 0 : -1} onClick={() => select(i)}
        onKeyDown={event => {
          let next: number;
          if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
          else if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault(); select(next, true);
        }}>{tab.label}</button>)}
      <span className="gostaya-tabs-line" aria-hidden="true" />
    </div>
    {tabs.map((tab, i) => <div key={tab.id} id={`${id}-panel-${tab.id}`} role="tabpanel"
      aria-labelledby={`${id}-tab-${tab.id}`} tabIndex={0} hidden={active !== i} className="gostaya-tab-panel">{tab.content}</div>)}
  </div>;
}

/** Content stays visible without JS. Animations are enhancement only. */
export function GostayaReveal({ children, delayMs = 0, className = "" }: {
  children: ReactNode; delayMs?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !element.animate) return;
    const query = window.matchMedia(MOTION_QUERY);
    let animation: Animation | undefined;
    const show = () => { animation?.cancel(); observer.disconnect(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      if (!query.matches) animation = element.animate([
        { opacity: 0, transform: "translateY(14px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 480, delay: Math.min(240, Math.max(0, delayMs)), easing: "cubic-bezier(.2,.65,.3,1)", fill: "backwards" });
    }, { threshold: 0 });
    observer.observe(element);
    element.addEventListener("focusin", show);
    query.addEventListener("change", show);
    return () => { observer.disconnect(); animation?.cancel(); element.removeEventListener("focusin", show); query.removeEventListener("change", show); };
  }, [delayMs]);
  return <div ref={ref} className={`gostaya-reveal ${className}`}>{children}</div>;
}
