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

const FLOW_STYLES = "\n.gostaya-flow-v2-section{position:relative;isolation:isolate;border-color:#d7eaff!important;background:#f8fbff!important;box-shadow:0 18px 55px rgba(20,121,211,.08)!important}\n.gostaya-flow-v2-bg{position:absolute;inset:0;z-index:-1;overflow:hidden;background:radial-gradient(ellipse at -8% 34%,rgba(186,224,255,.46) 0 20%,transparent 21%),radial-gradient(ellipse at 108% 6%,rgba(192,226,255,.46) 0 25%,transparent 26%),radial-gradient(ellipse at 84% 105%,rgba(200,231,255,.42) 0 24%,transparent 25%),linear-gradient(180deg,#fbfdff 0%,#eef7ff 51%,#fff 100%)}\n.gostaya-flow-v2-title{color:#102a43;font-size:clamp(2rem,4.4vw,4.25rem);font-weight:900;letter-spacing:-.045em;line-height:.98}\n.gostaya-flow-v2-title>span>span{color:#1479d3;font-weight:900}\n.gostaya-flow-v2-subtitle{margin:.55rem auto 0;max-width:54rem;color:#53657c;font-size:clamp(1rem,1.65vw,1.42rem);line-height:1.45}\n.gostaya-flow-v2-stage{position:relative;height:500px;margin-top:1.65rem;overflow:hidden}\n.gostaya-flow-v2-track{position:absolute;inset:0;perspective:1400px}\n.gostaya-flow-v2-card{--card-w:280px;position:absolute;left:50%;top:50%;width:var(--card-w);min-height:430px;display:flex;flex-direction:column;overflow:hidden;border:1px solid #d6e9f8;border-radius:26px;background:rgba(255,255,255,.96);box-shadow:0 16px 38px rgba(26,78,122,.08);transform:translate(-50%,-50%) translateX(calc(var(--offset)*310px)) scale(calc(1 - (var(--distance)*.07))) rotateY(calc(var(--offset)*-3deg));transform-origin:center;filter:saturate(calc(1 - (var(--distance)*.04)));transition:transform .72s cubic-bezier(.22,.75,.18,1),opacity .55s ease,border-color .45s ease,box-shadow .45s ease}\n.gostaya-flow-v2-track.is-resetting .gostaya-flow-v2-card{transition:none!important}\n.gostaya-flow-v2-card.is-active{z-index:5;border-color:#78c9ff;box-shadow:0 24px 55px rgba(20,121,211,.18);transform:translate(-50%,-50%) translateX(0) scale(1.08) rotateY(0)}\n.gostaya-flow-v2-card:not(.is-active){z-index:calc(4 - var(--distance))}\n.gostaya-flow-v2-number{position:absolute;top:18px;left:18px;z-index:4;display:grid;width:42px;height:42px;place-items:center;border-radius:999px;background:#e6f3ff;color:#1479d3;font-weight:900;font-size:1.15rem}\n.gostaya-flow-v2-visual{position:relative;min-height:280px;display:grid;place-items:center;padding:1.15rem;background:radial-gradient(circle at 50% 45%,rgba(20,121,211,.09),transparent 43%),linear-gradient(180deg,#fff 0%,#f8fbff 100%)}\n.gostaya-flow-v2-copy{padding:1.1rem 1.1rem 1.35rem;text-align:center}\n.gostaya-flow-v2-copy h3{color:#102a43;font-size:1.48rem;font-weight:900;line-height:1.08}\n.gostaya-flow-v2-copy p{margin-top:.45rem;color:#61728a;font-size:1rem;line-height:1.38}\n.gostaya-flow-v2-next{position:absolute;right:12px;top:50%;z-index:10;display:grid;width:58px;height:58px;place-items:center;transform:translateY(-50%);border:1px solid #d5e9f9!important;border-radius:999px!important;background:#fff!important;color:#1479d3!important;box-shadow:0 14px 35px rgba(16,42,67,.12)!important}\n.gostaya-flow-v2-next span{display:block;margin-top:-5px;font-size:3rem;font-weight:400;line-height:1}\n.gostaya-flow-v2-dots{display:flex;justify-content:center;gap:.8rem;margin-top:.15rem}\n.gostaya-flow-v2-dots span{width:12px;height:12px;border-radius:999px;background:#cfe3f4;transition:transform .3s ease,background .3s ease,box-shadow .3s ease}\n.gostaya-flow-v2-dots span.is-active{background:#1479d3;transform:scale(1.18);box-shadow:0 0 0 5px rgba(20,121,211,.08)}\n.gostaya-flow-v2-guest{overflow:hidden}\n.gostaya-flow-v2-person{position:absolute;left:10%;bottom:3%;width:42%;height:61%;border-radius:48% 48% 18% 18%;background:linear-gradient(145deg,#d7e2eb,#f9fbfc);box-shadow:0 18px 34px rgba(16,42,67,.08)}\n.gostaya-flow-v2-person:before{content:\"\";position:absolute;top:-27%;left:28%;width:44%;aspect-ratio:1;border-radius:999px;background:linear-gradient(145deg,#efd4c3,#f7e7dc)}\n.gostaya-flow-v2-person span{position:absolute;top:-35%;left:34%;width:34%;height:41%;border-radius:48% 52% 38% 42%;background:#4d352f}\n.gostaya-flow-v2-phone{position:absolute;left:43%;bottom:15%;width:17%;aspect-ratio:.58;border:4px solid #102a43;border-radius:15px;background:#fff;transform:rotate(-7deg)}\n.gostaya-flow-v2-qr-sign{position:absolute;right:9%;top:24%;width:34%;min-height:49%;display:grid;place-items:center;padding:.65rem;border:1px solid #d6e9f8;border-radius:17px;background:#fff;box-shadow:0 12px 28px rgba(16,42,67,.08);color:#1479d3}\n.gostaya-flow-v2-qr-sign b{align-self:end;font-size:.72rem;letter-spacing:.03em}\n.gostaya-flow-v2-qr{position:absolute;inset:20%;background:linear-gradient(90deg,#102a43 12%,transparent 12% 24%,#102a43 24% 37%,transparent 37% 51%,#102a43 51% 65%,transparent 65% 78%,#102a43 78%),linear-gradient(#102a43 12%,transparent 12% 24%,#102a43 24% 37%,transparent 37% 51%,#102a43 51% 65%,transparent 65% 78%,#102a43 78%);background-size:10px 10px}\n.gostaya-flow-v2-qr-big{position:relative;inset:auto;width:63%;aspect-ratio:1}\n.gostaya-flow-v2-device{width:74%;min-height:225px;padding:.85rem;border:7px solid #102a43;border-radius:28px;background:#fff;transform:rotate(-4deg);box-shadow:0 19px 38px rgba(16,42,67,.14)}\n.gostaya-flow-v2-device-brand{color:#1479d3;text-align:center;font-weight:900;font-size:.78rem;letter-spacing:.06em}\n.gostaya-flow-v2-device-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem;margin-top:.7rem}\n.gostaya-flow-v2-device-grid span{display:grid;min-height:64px;place-items:center;border:1px solid #d7eaff;border-radius:13px;background:#f7fbff;color:#102a43;font-size:.68rem;font-weight:800}\n.gostaya-flow-v2-device-nav{display:flex;justify-content:space-around;margin-top:.7rem}\n.gostaya-flow-v2-device-nav i{width:11px;height:11px;border-radius:4px;background:#b7d9f3}\n.gostaya-flow-v2-logic{display:flex;align-items:center;gap:1rem}\n.gostaya-flow-v2-cog{display:grid;width:98px;height:98px;place-items:center;border-radius:27px;background:linear-gradient(145deg,#1479d3,#2f9af5);color:#fff;font-size:3.6rem;box-shadow:0 18px 36px rgba(20,121,211,.22)}\n.gostaya-flow-v2-logic-lines{display:grid;gap:.62rem}\n.gostaya-flow-v2-logic-lines span{position:relative;display:flex;align-items:center;gap:.38rem}\n.gostaya-flow-v2-logic-lines i{color:#19c7da;font-style:normal;font-size:.92rem}\n.gostaya-flow-v2-logic-lines b{display:block;width:92px;height:37px;border:1px solid #d6e9f8;border-radius:10px;background:linear-gradient(#bbd6ef,#bbd6ef) 18px 10px/50px 6px no-repeat,linear-gradient(#d7e7f5,#d7e7f5) 18px 22px/36px 5px no-repeat,#fff;box-shadow:0 8px 20px rgba(16,42,67,.06)}\n.gostaya-flow-v2-team{width:88%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}\n.gostaya-flow-v2-team span{display:grid;min-height:88px;place-items:center;gap:.25rem;border:1px solid #d7eaff;border-radius:16px;background:#fff;color:#102a43;font-size:.74rem;font-weight:800;text-align:center;box-shadow:0 9px 20px rgba(16,42,67,.05)}\n.gostaya-flow-v2-team i{color:#1479d3;font-size:1.7rem;font-style:normal}\n.gostaya-flow-v2-dashboard{position:relative;width:88%;height:220px;border:1px solid #d7eaff;border-radius:18px;background:#fff;box-shadow:0 16px 32px rgba(16,42,67,.08)}\n.gostaya-flow-v2-mini-list{position:absolute;left:9%;top:15%;display:grid;gap:8px}\n.gostaya-flow-v2-mini-list i{width:70px;height:7px;border-radius:999px;background:#cbe1f3}\n.gostaya-flow-v2-mini-list i:nth-child(2){width:52px}.gostaya-flow-v2-mini-list i:nth-child(3){width:36px}\n.gostaya-flow-v2-chart{position:absolute;right:9%;top:12%;display:flex;align-items:flex-end;gap:6px;height:36%}\n.gostaya-flow-v2-chart i{width:14px;border-radius:4px 4px 0 0;background:linear-gradient(#48a9ff,#1479d3)}\n.gostaya-flow-v2-chart i:nth-child(1){height:18%}.gostaya-flow-v2-chart i:nth-child(2){height:36%}.gostaya-flow-v2-chart i:nth-child(3){height:54%}.gostaya-flow-v2-chart i:nth-child(4){height:76%}.gostaya-flow-v2-chart i:nth-child(5){height:100%}\n.gostaya-flow-v2-donut{position:absolute;left:12%;bottom:13%;width:58px;aspect-ratio:1;border-radius:999px;background:conic-gradient(#1479d3 0 42%,#17c6cf 42% 68%,#dfeef9 68%)}\n.gostaya-flow-v2-donut:after{content:\"\";position:absolute;inset:13px;border-radius:999px;background:#fff}\n.gostaya-flow-v2-trend{position:absolute;right:10%;bottom:15%;display:flex;align-items:flex-end;gap:17px;width:48%;height:23%;border-bottom:2px solid #e3eef6}\n.gostaya-flow-v2-trend i{width:9px;height:9px;border-radius:999px;background:#20c7ce;box-shadow:0 0 0 4px rgba(32,199,206,.1)}\n.gostaya-flow-v2-trend i:nth-child(2){transform:translateY(-8px)}.gostaya-flow-v2-trend i:nth-child(3){transform:translateY(-21px)}.gostaya-flow-v2-trend i:nth-child(4){transform:translateY(-35px)}\n@media(max-width:1100px){.gostaya-flow-v2-stage{height:470px}.gostaya-flow-v2-card{--card-w:250px;min-height:405px;transform:translate(-50%,-50%) translateX(calc(var(--offset)*268px)) scale(calc(1 - (var(--distance)*.065)))}.gostaya-flow-v2-card.is-active{transform:translate(-50%,-50%) scale(1.06)}}\n@media(max-width:767px){.gostaya-flow-v2-title{font-size:2.25rem;text-align:left}.gostaya-flow-v2-subtitle{text-align:left;font-size:1rem}.gostaya-flow-v2-stage{height:470px;margin-top:1.1rem}.gostaya-flow-v2-card{--card-w:min(76vw,290px);min-height:410px;transform:translate(-50%,-50%) translateX(calc(var(--offset)*82vw)) scale(calc(1 - (var(--distance)*.08)))}.gostaya-flow-v2-card.is-active{transform:translate(-50%,-50%) scale(1)}.gostaya-flow-v2-next{right:4px;width:50px;height:50px}.gostaya-flow-v2-visual{min-height:270px}.gostaya-flow-v2-copy h3{font-size:1.35rem}.gostaya-flow-v2-copy p{font-size:.9rem}.gostaya-flow-v2-dots{gap:.65rem}.gostaya-flow-v2-dots span{width:10px;height:10px}}\n@media(prefers-reduced-motion:reduce){.gostaya-flow-v2-card{transition:none!important}}\n";

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
    <>
      <style>{FLOW_STYLES}</style>
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
    </>
  );
}
