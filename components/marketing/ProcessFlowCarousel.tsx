"use client";

import { useEffect, useMemo, useState } from "react";

type Lang = "bg" | "en" | "de";
type Kind = "guest" | "hub" | "logic" | "team" | "manager";

type Step = {
  label: string;
  description: string;
  kind: Kind;
};

const COPY = {
  bg: {
    title: "Как работи GOSTAYA",
    subtitle: "От госта до мениджъра — ясен, проследим процес",
    next: "Следваща стъпка",
    steps: [
      { label: "Гост", description: "Сканира QR", kind: "guest" },
      { label: "Мобилен хъб", description: "Информация, услуги, заявки", kind: "hub" },
      { label: "Оперативна логика", description: "Правила и автоматично насочване", kind: "logic" },
      { label: "Екип", description: "Рецепция, хаускипинг, поддръжка, SPA", kind: "team" },
      { label: "Мениджър", description: "Видимост, анализ, оптимизация", kind: "manager" },
    ] satisfies Step[],
  },
  en: {
    title: "How GOSTAYA works",
    subtitle: "From guest to manager — one clear, traceable process",
    next: "Next step",
    steps: [
      { label: "Guest", description: "Scans QR", kind: "guest" },
      { label: "Mobile Hub", description: "Information, services, requests", kind: "hub" },
      { label: "Operational logic", description: "Rules and automatic routing", kind: "logic" },
      { label: "Team", description: "Reception, housekeeping, maintenance, SPA", kind: "team" },
      { label: "Manager", description: "Visibility, analysis, optimization", kind: "manager" },
    ] satisfies Step[],
  },
  de: {
    title: "So funktioniert GOSTAYA",
    subtitle: "Vom Gast bis zum Manager — ein klarer, nachvollziehbarer Prozess",
    next: "Nächster Schritt",
    steps: [
      { label: "Gast", description: "Scannt QR", kind: "guest" },
      { label: "Mobiler Hub", description: "Informationen, Services, Anfragen", kind: "hub" },
      { label: "Operative Logik", description: "Regeln und automatisches Routing", kind: "logic" },
      { label: "Team", description: "Rezeption, Housekeeping, Technik, SPA", kind: "team" },
      { label: "Manager", description: "Sichtbarkeit, Analyse, Optimierung", kind: "manager" },
    ] satisfies Step[],
  },
} as const;

function Visual({ kind }: { kind: Kind }) {
  if (kind === "guest") {
    return (
      <div className="gostaya-flow-v2-visual gostaya-flow-v2-guest">
        <div className="gostaya-flow-v2-person"><span /></div>
        <div className="gostaya-flow-v2-phone"><div className="gostaya-flow-v2-qr" /></div>
        <div className="gostaya-flow-v2-qr-sign"><b>GOSTAYA</b><div className="gostaya-flow-v2-qr gostaya-flow-v2-qr-big" /></div>
      </div>
    );
  }

  if (kind === "hub") {
    return (
      <div className="gostaya-flow-v2-visual">
        <div className="gostaya-flow-v2-device">
          <div className="gostaya-flow-v2-device-brand">GOSTAYA</div>
          <div className="gostaya-flow-v2-device-grid">
            <span>Услуги</span><span>Ресторант</span><span>SPA</span><span>Заявки</span>
          </div>
          <div className="gostaya-flow-v2-device-nav"><i/><i/><i/><i/></div>
        </div>
      </div>
    );
  }

  if (kind === "logic") {
    return (
      <div className="gostaya-flow-v2-visual">
        <div className="gostaya-flow-v2-logic">
          <div className="gostaya-flow-v2-cog">⚙</div>
          <div className="gostaya-flow-v2-logic-lines">
            <span><i>●</i><b /></span>
            <span><i>●</i><b /></span>
            <span><i>●</i><b /></span>
            <span><i>●</i><b /></span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "team") {
    return (
      <div className="gostaya-flow-v2-visual">
        <div className="gostaya-flow-v2-team">
          <span><i>◉</i>Рецепция</span>
          <span><i>⌁</i>Хаускипинг</span>
          <span><i>⌕</i>Поддръжка</span>
          <span><i>✦</i>SPA</span>
        </div>
      </div>
    );
  }

  return (
    <div className="gostaya-flow-v2-visual">
      <div className="gostaya-flow-v2-dashboard">
        <div className="gostaya-flow-v2-mini-list"><i/><i/><i/></div>
        <div className="gostaya-flow-v2-chart"><i/><i/><i/><i/><i/></div>
        <div className="gostaya-flow-v2-donut" />
        <div className="gostaya-flow-v2-trend"><i/><i/><i/><i/></div>
      </div>
    </div>
  );
}

export default function ProcessFlowCarousel({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const steps = useMemo(() => c.steps as readonly Step[], [c.steps]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const advance = () => {
    if (active < steps.length - 1) {
      setActive((value) => value + 1);
      return;
    }
    setResetting(true);
    window.setTimeout(() => {
      setActive(0);
      window.requestAnimationFrame(() => setResetting(false));
    }, 180);
  };

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setTimeout(advance, active === steps.length - 1 ? 3200 : 2400);
    return () => window.clearTimeout(timer);
  }, [active, paused, reducedMotion, steps.length]);

  return (
    <section
      className="gostaya-flow-v2-section mx-auto mt-5 max-w-7xl overflow-hidden rounded-[34px] border border-slate-200"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-label={c.title}
    >
      <div className="gostaya-flow-v2-bg" />
      <div className="relative px-4 py-9 sm:px-7 lg:px-8 lg:py-11">
        <div className="text-center">
          <h2 className="gostaya-flow-v2-title">
            {c.title.split("GOSTAYA").map((part, index, all) => (
              <span key={index}>{part}{index < all.length - 1 ? <span>GOSTAYA</span> : null}</span>
            ))}
          </h2>
          <p className="gostaya-flow-v2-subtitle">{c.subtitle}</p>
        </div>

        <div className="gostaya-flow-v2-stage" aria-live="polite">
          <div className={`gostaya-flow-v2-track ${resetting ? "is-resetting" : ""}`}>
            {steps.map((step, index) => {
              const offset = index - active;
              const distance = Math.abs(offset);
              const visible = distance <= 2;
              return (
                <article
                  key={step.label}
                  className={`gostaya-flow-v2-card ${index === active ? "is-active" : ""}`}
                  style={{
                    ["--offset" as string]: offset,
                    ["--distance" as string]: distance,
                    opacity: visible ? 1 : 0,
                    pointerEvents: index === active ? "auto" : "none",
                  }}
                  aria-hidden={!visible}
                >
                  <div className="gostaya-flow-v2-number">{index + 1}</div>
                  <Visual kind={step.kind} />
                  <div className="gostaya-flow-v2-copy">
                    <h3>{step.label}</h3>
                    <p>{step.description}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <button
            type="button"
            onClick={advance}
            className="gostaya-flow-v2-next"
            aria-label={c.next}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <div className="gostaya-flow-v2-dots" aria-label="Process progress">
          {steps.map((step, index) => (
            <span key={step.label} className={index === active ? "is-active" : ""} />
          ))}
        </div>
      </div>
    </section>
  );
}
