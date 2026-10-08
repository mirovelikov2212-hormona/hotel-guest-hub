"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DemoGuideCard from "@/components/guest/DemoGuideCard";
import { DEMO_GUIDE_CHANNEL, type DemoGuideAction, type DemoGuideModel } from "@/lib/demo-guide";

type DemoView = "guest" | "manager";
type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "GOSTAYA LIVE DEMO",
    title: "Гостът и хотелът в един екран",
    subtitle: "Изпратете заявка като гост и проследете обработката ѝ от екипа и мениджъра.",
    guest: "Гост",
    manager: "Хотел",
    guestTitle: "Guest Hub · стая 901",
    managerTitle: "Manager · оперативен изглед",
    loading: "Подготвяме демо средата…",
    retry: "Опитай отново",
    error: "Демо средата не можа да се подготви автоматично.",
    back: "Към сайта",
    hint: "Изберете изглед. Насоките остават тук, докато работите в него.",
  },
  en: {
    eyebrow: "GOSTAYA LIVE DEMO",
    title: "Guest and hotel in one workspace",
    subtitle: "Create a request in the Guest Hub and watch the same action appear in Manager.",
    guest: "Guest",
    manager: "Hotel",
    guestTitle: "Guest Hub · room 901",
    managerTitle: "Manager · operational view",
    loading: "Preparing the demo workspace…",
    retry: "Try again",
    error: "The demo workspace could not be prepared automatically.",
    back: "Back to website",
    hint: "Choose a view. The guide stays here while you use it.",
  },
  de: {
    eyebrow: "GOSTAYA LIVE DEMO",
    title: "Gast und Hotel in einem Workspace",
    subtitle: "Senden Sie eine Anfrage im Guest Hub und sehen Sie dieselbe Aktion direkt im Manager-Bereich.",
    guest: "Gast",
    manager: "Hotel",
    guestTitle: "Guest Hub · Zimmer 901",
    managerTitle: "Manager · operativer Überblick",
    loading: "Demo-Workspace wird vorbereitet…",
    retry: "Erneut versuchen",
    error: "Der Demo-Workspace konnte nicht automatisch vorbereitet werden.",
    back: "Zur Website",
    hint: "Wählen Sie eine Ansicht. Die Anleitung bleibt dabei sichtbar.",
  },
} as const;

function normalizeLang(value: string | null): Lang {
  return value === "de" || value === "en" ? value : "bg";
}

export default function DemoWorkspace() {
  const searchParams = useSearchParams();
  const lang = useMemo(() => normalizeLang(searchParams.get("lang")), [searchParams]);
  const copy = COPY[lang];
  const [activeView, setActiveView] = useState<DemoView>("guest");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const guestFrame = useRef<HTMLIFrameElement>(null);
  const [guide, setGuide] = useState<DemoGuideModel | null>(null);
  const [staffRole, setStaffRole] = useState<"manager" | "housekeeping" | "reception">("manager");
  const section = searchParams.get("section");
  const demoSection = section && ["info", "housekeeping"].includes(section) ? section : null;
  const guestLang = ["bg", "en", "de", "ro", "cs", "ru"].includes(searchParams.get("guestLang") || "") ? searchParams.get("guestLang") : lang;
  const guestSrc = `/h/demo?lang=${guestLang}${demoSection ? `&demoSection=${demoSection}` : ""}`;
  const roleLabels = {manager: lang === "bg" ? "Мениджър" : "Manager", housekeeping: lang === "bg" ? "Хаускипинг" : "Housekeeping", reception: lang === "bg" ? "Рецепция" : lang === "de" ? "Rezeption" : "Reception"};

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== guestFrame.current?.contentWindow || event.data?.channel !== DEMO_GUIDE_CHANNEL || event.data?.type !== "state") return;
      if (Number.isInteger(event.data.model?.step) && Array.isArray(event.data.model?.instructions)) setGuide(event.data.model);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  function guideAction(action: DemoGuideAction) {
    if (action === "manager" || action === "housekeeping" || action === "reception") {
      setStaffRole(action);
      setActiveView("manager");
      return;
    }
    if (["room", "department", "survey", "restart"].includes(action)) setActiveView("guest");
    guestFrame.current?.contentWindow?.postMessage({channel: DEMO_GUIDE_CHANNEL, type: "action", action}, window.location.origin);
  }

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      setStatus("loading");

      try {
        const demoAccess = new FormData();
        demoAccess.set("pin", "2026");
        demoAccess.set("next", "/h/demo");
        const guestResponse = await fetch("/api/demo-access", {
          method: "POST",
          body: demoAccess,
          credentials: "same-origin",
          redirect: "follow",
          cache: "no-store",
        });

        if (!guestResponse.ok) {
          throw new Error(`guest demo access ${guestResponse.status}`);
        }

        // Each demo role keeps its own existing authenticated session cookie.
        const staffResponses = await Promise.all((["manager", "housekeeping", "reception"] as const).map(role => fetch("/api/staff/auth/login", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({hotelSlug: "demo", role, pin: "2026"}),
        })));
        if (staffResponses.some(response => !response.ok)) {
          throw new Error("staff demo access could not be prepared");
        }

        if (!cancelled) setStatus("ready");
      } catch (error) {
        console.error("Demo workspace preparation failed", error);
        if (!cancelled) setStatus("error");
      }
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const backHref = lang === "bg" ? "/bg" : lang === "de" ? "/de" : "/en";

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f5f3ff] text-[#24183b]">
      <header className="shrink-0 border-b border-violet-100 bg-white px-3 py-2 sm:px-5 sm:py-3">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-700">{copy.eyebrow}</p>
            <h1 className="text-base font-bold tracking-tight sm:text-xl">{copy.title}</h1>
            <p className="hidden text-xs text-slate-600 sm:block">{copy.subtitle}</p>
          </div>
          <a href={backHref} className="shrink-0 rounded-xl border border-violet-200 px-3 py-2 text-xs font-bold text-violet-800">← {copy.back}</a>
        </div>
      </header>
      {status !== "ready" ? (
        <section className="flex min-h-0 flex-1 items-center justify-center px-4" aria-live="polite">
          <div className="w-full max-w-xl rounded-3xl border border-violet-100 bg-white p-7 text-center shadow-xl shadow-violet-100/60">
            {status === "loading" ? <><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600 motion-reduce:animate-none"/><p className="mt-5 font-semibold">{copy.loading}</p></> : <><p className="font-semibold">{copy.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">{copy.retry}</button></>}
          </div>
        </section>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-2 p-2 sm:p-3">
          {guide ? <div className="shrink-0"><DemoGuideCard model={guide} lang={lang} onAction={guideAction} compact/></div> : null}
          <nav className="flex shrink-0 flex-wrap items-center gap-1 rounded-xl border border-violet-100 bg-white p-1" aria-label={copy.managerTitle}>
            <button type="button" aria-pressed={activeView === "guest"} onClick={() => setActiveView("guest")} className={`min-h-10 rounded-lg px-3 py-2 text-xs font-bold transition sm:px-5 ${activeView === "guest" ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50"}`}>{copy.guest} · 901</button>
            {(["housekeeping", "reception", "manager"] as const).map(role => <button key={role} type="button" aria-pressed={activeView === "manager" && staffRole === role} onClick={() => {setStaffRole(role);setActiveView("manager");}} className={`min-h-10 rounded-lg px-3 py-2 text-xs font-bold transition sm:px-5 ${activeView === "manager" && staffRole === role ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-violet-50"}`}>{roleLabels[role]}</button>)}
            <p className="ml-auto hidden px-3 text-xs text-slate-500 xl:block">{copy.hint}</p>
          </nav>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-violet-100 bg-[#ede9f5] shadow-sm">
            <section hidden={activeView !== "guest"} className="mx-auto h-full max-w-[600px] bg-white">
              <iframe ref={guestFrame} src={guestSrc} onLoad={() => guestFrame.current?.contentWindow?.postMessage({channel:DEMO_GUIDE_CHANNEL,type:"sync"},window.location.origin)} title={copy.guestTitle} className="block h-full w-full border-0 bg-white" allow="clipboard-read; clipboard-write"/>
            </section>
            <section hidden={activeView !== "manager"} className="h-full bg-white">
              <iframe src={`/staff/demo/${staffRole}`} title={roleLabels[staffRole]} className="block h-full w-full border-0 bg-white" allow="clipboard-read; clipboard-write"/>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
