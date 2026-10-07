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
    subtitle: "Направете заявка в Guest Hub и проследете същото действие веднага в Manager панела.",
    guest: "Гост",
    manager: "Хотел",
    guestTitle: "Guest Hub · стая 901",
    managerTitle: "Manager · оперативен изглед",
    loading: "Подготвяме демо средата…",
    retry: "Опитай отново",
    error: "Демо средата не можа да се подготви автоматично.",
    back: "Към сайта",
    hint: "Desktop: двата изгледа работят едновременно. На телефон превключвайте между тях от бутоните горе.",
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
    hint: "Desktop: both views stay live at the same time. On mobile, switch between them using the buttons above.",
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
    hint: "Desktop: beide Ansichten bleiben gleichzeitig aktiv. Auf dem Smartphone wechseln Sie oben zwischen den Ansichten.",
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
    <main className="min-h-screen bg-[#eef6fc] text-[#102a43]">
      <header className="sticky top-0 z-30 border-b border-sky-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#1479d3]">
              {copy.eyebrow}
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{copy.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">{copy.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-2xl border border-sky-200 bg-[#f7fbff] p-1 lg:hidden">
              <button
                type="button"
                onClick={() => setActiveView("guest")}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${activeView === "guest" ? "bg-[#1479d3] text-white shadow-sm" : "text-slate-600"}`}
              >
                {copy.guest}
              </button>
              <button
                type="button"
                onClick={() => setActiveView("manager")}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${activeView === "manager" ? "bg-[#1479d3] text-white shadow-sm" : "text-slate-600"}`}
              >
                {copy.manager}
              </button>
            </div>
            <a
              href={backHref}
              className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-bold text-[#0e5f91] shadow-sm"
            >
              ← {copy.back}
            </a>
          </div>
        </div>
      </header>

      {status !== "ready" ? (
        <section className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4">
          <div className="w-full rounded-3xl border border-sky-200 bg-white p-7 text-center shadow-xl shadow-sky-100/60">
            {status === "loading" ? (
              <>
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sky-100 border-t-[#1479d3]" />
                <p className="mt-5 text-base font-semibold">{copy.loading}</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold">{copy.error}</p>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="mt-5 rounded-xl bg-[#1479d3] px-5 py-3 text-sm font-bold text-white"
                >
                  {copy.retry}
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="mx-auto max-w-[1800px] px-3 pb-3 pt-3 sm:px-4">
            <p className="mb-3 text-center text-xs font-medium text-slate-500">{copy.hint}</p>
            {demoSection ? <p className="mb-3 rounded-xl border border-sky-200 bg-white p-3 text-sm text-sky-900">{lang === "bg" ? "Избраната секция от ИИ примера ще се отвори след потвърждаване на стая 901. Бутонът само отваря услугата — заявката или резервацията изисква ваше потвърждение." : lang === "de" ? "Der im KI-Beispiel gewählte Bereich öffnet sich nach Bestätigung von Zimmer 901. Eine Anfrage oder Buchung erfordert Ihre Bestätigung." : "The section selected in the AI example opens after confirming room 901. A request or booking still requires your confirmation."}</p> : null}
            {guide ? <div className="mb-4"><DemoGuideCard model={guide} lang={lang} onAction={guideAction}/></div> : null}

            <div className="grid min-h-[calc(100vh-150px)] gap-3 lg:grid-cols-[440px_minmax(0,1fr)]">
              <section
                className={`overflow-hidden rounded-[28px] border border-sky-200 bg-white shadow-[0_18px_50px_rgba(15,58,91,.10)] ${activeView === "guest" ? "block" : "hidden"} lg:block`}
              >
                <div className="flex h-11 items-center justify-between border-b border-sky-100 bg-[#f8fbfe] px-4">
                  <span className="text-sm font-bold">{copy.guestTitle}</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    LIVE
                  </span>
                </div>
                <iframe
                  ref={guestFrame}
                  src={guestSrc}
                  onLoad={() => guestFrame.current?.contentWindow?.postMessage({channel: DEMO_GUIDE_CHANNEL, type: "sync"}, window.location.origin)}
                  title={copy.guestTitle}
                  className="h-[calc(100vh-205px)] min-h-[720px] w-full border-0 bg-white"
                  allow="clipboard-read; clipboard-write"
                />
              </section>

              <section
                className={`overflow-hidden rounded-[28px] border border-sky-200 bg-white shadow-[0_18px_50px_rgba(15,58,91,.10)] ${activeView === "manager" ? "block" : "hidden"} lg:block`}
              >
                <div className="flex h-11 items-center justify-between border-b border-sky-100 bg-[#f8fbfe] px-4">
                  <span className="text-sm font-bold">{roleLabels[staffRole]}</span>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                    LIVE
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 border-b border-sky-100 p-3" role="group" aria-label={copy.managerTitle}>
                  {(["manager", "housekeeping", "reception"] as const).map(role => <button key={role} type="button" aria-pressed={staffRole === role} onClick={() => setStaffRole(role)} className={`min-h-10 rounded-xl px-3 py-2 text-xs font-bold ${staffRole === role ? "bg-[#1479d3] text-white" : "bg-sky-50 text-sky-900"}`}>{roleLabels[role]}</button>)}
                </div>
                <iframe
                  src={`/staff/demo/${staffRole}`}
                  title={roleLabels[staffRole]}
                  className="h-[calc(100vh-205px)] min-h-[720px] w-full border-0 bg-white"
                  allow="clipboard-read; clipboard-write"
                />
              </section>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
