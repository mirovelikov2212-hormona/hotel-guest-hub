"use client";

import { useEffect, useMemo, useState } from "react";

type Lang = "bg" | "en" | "de";

type Step = {
  label: string;
  short: string;
  description: string;
  kind: "guest" | "hub" | "logic" | "team" | "manager";
};

const COPY = {
  bg: {
    eyebrow: "КАК РАБОТИ",
    title: "Как работи GOSTAYA",
    subtitle: "От госта до мениджъра — ясен, проследим процес.",
    next: "Следваща",
    step: "Стъпка",
    steps: [
      { label: "Гост", short: "QR достъп", description: "Гостът сканира QR кода и отваря мобилния хъб.", kind: "guest" },
      { label: "Мобилен хъб", short: "Информация и услуги", description: "Информация, услуги и директни заявки са на едно място.", kind: "hub" },
      { label: "Оперативна логика", short: "Автоматично насочване", description: "Правилата и работното време определят къде да стигне заявката.", kind: "logic" },
      { label: "Хотелски екип", short: "Правилният отдел", description: "Рецепция, Хаускипинг, Поддръжка или SPA получават задачата директно.", kind: "team" },
      { label: "Мениджър", short: "Видимост и оптимизация", description: "Мениджърът вижда изпълнението, натоварването и резултата.", kind: "manager" },
    ] satisfies Step[],
  },
  en: {
    eyebrow: "HOW IT WORKS",
    title: "How GOSTAYA works",
    subtitle: "From guest to manager — one clear, traceable process.",
    next: "Next",
    step: "Step",
    steps: [
      { label: "Guest", short: "QR access", description: "The guest scans the QR code and opens the mobile Guest Hub.", kind: "guest" },
      { label: "Mobile Hub", short: "Information and services", description: "Information, services and direct requests live in one place.", kind: "hub" },
      { label: "Operational logic", short: "Automatic routing", description: "Hotel rules and working hours determine where each request goes.", kind: "logic" },
      { label: "Hotel team", short: "Right department", description: "Reception, Housekeeping, Maintenance or SPA receives the task directly.", kind: "team" },
      { label: "Manager", short: "Visibility and optimization", description: "The manager sees execution, workload and operational outcomes.", kind: "manager" },
    ] satisfies Step[],
  },
  de: {
    eyebrow: "SO FUNKTIONIERT ES",
    title: "So funktioniert GOSTAYA",
    subtitle: "Vom Gast bis zum Manager — ein klarer, nachvollziehbarer Prozess.",
    next: "Weiter",
    step: "Schritt",
    steps: [
      { label: "Gast", short: "QR-Zugriff", description: "Der Gast scannt den QR-Code und öffnet den mobilen Guest Hub.", kind: "guest" },
      { label: "Mobiler Hub", short: "Information und Services", description: "Informationen, Services und direkte Anfragen befinden sich an einem Ort.", kind: "hub" },
      { label: "Operative Logik", short: "Automatisches Routing", description: "Hotelregeln und Arbeitszeiten bestimmen den richtigen Empfänger.", kind: "logic" },
      { label: "Hotelteam", short: "Richtige Abteilung", description: "Rezeption, Housekeeping, Technik oder SPA erhält die Aufgabe direkt.", kind: "team" },
      { label: "Manager", short: "Sichtbarkeit und Optimierung", description: "Der Manager sieht Ausführung, Auslastung und operative Ergebnisse.", kind: "manager" },
    ] satisfies Step[],
  },
} as const;

function StepVisual({ kind }: { kind: Step["kind"] }) {
  if (kind === "guest") {
    return (
      <div className="gostaya-flow-visual gostaya-flow-guest">
        <div className="gostaya-flow-person"><span /></div>
        <div className="gostaya-flow-phone"><div className="gostaya-flow-qr" /></div>
        <div className="gostaya-flow-qr-card"><strong>GOSTAYA</strong><div className="gostaya-flow-qr gostaya-flow-qr-large" /></div>
      </div>
    );
  }

  if (kind === "hub") {
    return (
      <div className="gostaya-flow-visual">
        <div className="gostaya-flow-hub-phone">
          <div className="gostaya-flow-hub-brand">GOSTAYA</div>
          <div className="gostaya-flow-hub-grid">
            <span>Услуги</span><span>Инфо</span><span>SPA</span><span>Заявки</span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "logic") {
    return (
      <div className="gostaya-flow-visual">
        <div className="gostaya-flow-logic">
          <div className="gostaya-flow-gear">⚙</div>
          <div className="gostaya-flow-routes">
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "team") {
    return (
      <div className="gostaya-flow-visual">
        <div className="gostaya-flow-team-grid">
          <span>Рецепция</span><span>Хаускипинг</span><span>Поддръжка</span><span>SPA</span>
        </div>
      </div>
    );
  }

  return (
    <div className="gostaya-flow-visual">
      <div className="gostaya-flow-dashboard">
        <div className="gostaya-flow-bars"><i /><i /><i /><i /></div>
        <div className="gostaya-flow-line"><i /><i /><i /></div>
        <div className="gostaya-flow-donut" />
      </div>
    </div>
  );
}

export default function ProcessFlowCarousel({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const steps = useMemo(() => c.steps as readonly Step[], [c.steps]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % steps.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, steps.length]);

  const next = () => setActive((current) => (current + 1) % steps.length);
  const step = steps[active];

  return (
    <section
      className="gostaya-flow-section mx-auto mt-5 max-w-7xl overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,58,91,.07)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-label={c.title}
    >
      <div className="gostaya-flow-bg" />
      <div className="relative px-5 py-10 sm:px-7 lg:px-10 lg:py-12">
        <p className="text-xs font-black uppercase tracking-[.24em] text-[#1479d3]">{c.eyebrow}</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold leading-tight text-[#102a43] sm:text-5xl">
          {c.title.split("GOSTAYA").map((part, index, all) => (
            <span key={index}>{part}{index < all.length - 1 ? <span className="gostaya-mobile-brand">GOSTAYA</span> : null}</span>
          ))}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">{c.subtitle}</p>

        <div className="gostaya-flow-steps mt-7" aria-hidden="true">
          {steps.map((item, index) => (
            <div key={item.label} className={index === active ? "is-active" : index < active ? "is-complete" : ""}>
              <span>{index + 1}</span>
              <strong>{item.label}</strong>
            </div>
          ))}
        </div>

        <div className="gostaya-flow-stage mt-6">
          <div key={active} className="gostaya-flow-card" aria-live="polite">
            <div className="gostaya-flow-card-copy">
              <div className="gostaya-flow-number">{String(active + 1).padStart(2, "0")}</div>
              <p className="gostaya-flow-short">{step.short}</p>
              <h3>{step.label}</h3>
              <p className="gostaya-flow-description">{step.description}</p>
            </div>
            <StepVisual kind={step.kind} />
          </div>
        </div>

        <div className="gostaya-flow-controls">
          <div className="gostaya-flow-progress" aria-hidden="true">
            <span style={{ width: `${((active + 1) / steps.length) * 100}%` }} />
          </div>
          <span className="gostaya-flow-count">{c.step} {active + 1} / {steps.length}</span>
          <button type="button" onClick={next} className="gostaya-flow-next" aria-label={c.next}>
            {c.next}<span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
