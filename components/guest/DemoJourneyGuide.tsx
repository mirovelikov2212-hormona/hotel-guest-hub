"use client";

import { useEffect, useMemo, useState } from "react";

type Lang = string;

type Props = {
  lang: Lang;
  roomConfirmed: boolean;
  room: string;
  contactOpen: boolean;
  hasRequest: boolean;
  onFocusRoom: () => void;
  onOpenContact: () => void;
};

type Copy = {
  label: string;
  close: string;
  back: string;
  roomTitle: string;
  roomText: string;
  roomCta: string;
  servicesTitle: string;
  servicesText: string;
  servicesCta: string;
  requestTitle: string;
  requestText: string;
  requestHint: string;
  requestCta: string;
  staffTitle: string;
  staffText: string;
  pin: string;
  housekeeping: string;
  maintenance: string;
  reception: string;
  manager: string;
};

const COPY: Record<string, Copy> = {
  bg: {
    label: "DEMO GUIDE",
    close: "Скрий",
    back: "Покажи отново",
    roomTitle: "Стъпка 1 · Потвърди demo стаята",
    roomText: "Използвай стая 901. Тя е специална test room и не изисква реални дати за престой.",
    roomCta: "Покажи стая 901",
    servicesTitle: "Стъпка 2 · Отвори услугите",
    servicesText: "След потвърждение на стаята отвори „Свържи се с нас онлайн“, за да видиш Reception, Housekeeping и Maintenance.",
    servicesCta: "Отвори услугите",
    requestTitle: "Стъпка 3 · Изпрати реална demo заявка",
    requestText: "Избери Housekeeping → Хавлии или Maintenance → технически проблем и изпрати заявката.",
    requestHint: "Заявката се записва реално, но е маркирана като demo/test и не влиза в хотелски KPI.",
    requestCta: "Покажи услугите",
    staffTitle: "Стъпка 4 · Виж същата заявка от другата страна",
    staffText: "Отвори Staff Hub на отдела, към който изпрати заявката. После отвори Manager, за да видиш същото operational събитие.",
    pin: "Staff / Manager PIN: 2026",
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    reception: "Reception",
    manager: "Manager",
  },
  en: {
    label: "DEMO GUIDE",
    close: "Hide",
    back: "Show guide",
    roomTitle: "Step 1 · Confirm the demo room",
    roomText: "Use room 901. It is a dedicated test room and does not require real stay dates.",
    roomCta: "Show room 901",
    servicesTitle: "Step 2 · Open hotel services",
    servicesText: "After confirming the room, open “Contact us online” to see Reception, Housekeeping and Maintenance.",
    servicesCta: "Open services",
    requestTitle: "Step 3 · Send a real demo request",
    requestText: "Choose Housekeeping → Towels or Maintenance → a technical issue and send the request.",
    requestHint: "The request is really written, but it is marked demo/test and excluded from hotel KPI.",
    requestCta: "Show services",
    staffTitle: "Step 4 · See the same request from the other side",
    staffText: "Open the Staff Hub for the department you contacted. Then open Manager to see the same operational event.",
    pin: "Staff / Manager PIN: 2026",
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    reception: "Reception",
    manager: "Manager",
  },
  de: {
    label: "DEMO GUIDE",
    close: "Ausblenden",
    back: "Guide anzeigen",
    roomTitle: "Schritt 1 · Demo-Zimmer bestätigen",
    roomText: "Nutze Zimmer 901. Es ist ein spezielles Testzimmer und benötigt keine echten Aufenthaltsdaten.",
    roomCta: "Zimmer 901 anzeigen",
    servicesTitle: "Schritt 2 · Hotelservices öffnen",
    servicesText: "Nach der Zimmerbestätigung öffne „Kontakt online“, um Rezeption, Housekeeping und Technik zu sehen.",
    servicesCta: "Services öffnen",
    requestTitle: "Schritt 3 · Echte Demo-Anfrage senden",
    requestText: "Wähle Housekeeping → Handtücher oder Technik → technisches Problem und sende die Anfrage.",
    requestHint: "Die Anfrage wird real gespeichert, aber als Demo/Test markiert und nicht in Hotel-KPI gezählt.",
    requestCta: "Services anzeigen",
    staffTitle: "Schritt 4 · Dieselbe Anfrage auf der anderen Seite sehen",
    staffText: "Öffne den Staff Hub der Abteilung, an die du die Anfrage gesendet hast. Öffne danach Manager für dasselbe operative Ereignis.",
    pin: "Staff / Manager PIN: 2026",
    housekeeping: "Housekeeping",
    maintenance: "Technik",
    reception: "Rezeption",
    manager: "Manager",
  },
};

function resolveCopy(lang: string) {
  return COPY[String(lang || "").toLowerCase()] || COPY.en;
}

export default function DemoJourneyGuide({
  lang,
  roomConfirmed,
  room,
  contactOpen,
  hasRequest,
  onFocusRoom,
  onOpenContact,
}: Props) {
  const c = resolveCopy(lang);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem("gostaya-demo-guide-hidden") === "1");
    } catch {}
  }, []);

  const step = useMemo(() => {
    if (!roomConfirmed || room !== "901") return 1;
    if (hasRequest) return 4;
    if (contactOpen) return 3;
    return 2;
  }, [contactOpen, hasRequest, room, roomConfirmed]);

  const setGuideHidden = (next: boolean) => {
    setHidden(next);
    try {
      if (next) sessionStorage.setItem("gostaya-demo-guide-hidden", "1");
      else sessionStorage.removeItem("gostaya-demo-guide-hidden");
    } catch {}
  };

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setGuideHidden(false)}
        className="fixed bottom-4 right-4 z-[88] rounded-full border border-cyan-300/30 bg-[#071821]/95 px-4 py-2 text-xs font-bold text-cyan-100 shadow-2xl backdrop-blur"
      >
        {c.back}
      </button>
    );
  }

  const title =
    step === 1 ? c.roomTitle :
    step === 2 ? c.servicesTitle :
    step === 3 ? c.requestTitle :
    c.staffTitle;
  const body =
    step === 1 ? c.roomText :
    step === 2 ? c.servicesText :
    step === 3 ? c.requestText :
    c.staffText;

  return (
    <aside className="fixed bottom-4 left-1/2 z-[88] w-[min(92vw,430px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0">
      <div className="overflow-hidden rounded-[24px] border border-cyan-200/25 bg-[#071821]/95 shadow-[0_18px_70px_rgba(0,0,0,.5),0_0_36px_rgba(34,211,238,.09)] backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-cyan-200 via-violet-300 to-emerald-300" />
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-black tracking-[0.22em] text-cyan-200">{c.label} · {step}/4</div>
            <button type="button" onClick={() => setGuideHidden(true)} className="text-xs text-white/45 hover:text-white">
              {c.close}
            </button>
          </div>

          <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>

          {step === 3 ? (
            <p className="mt-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-2 text-xs leading-5 text-emerald-100/80">
              {c.requestHint}
            </p>
          ) : null}

          {step === 1 ? (
            <button type="button" onClick={onFocusRoom} className="mt-4 w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-black text-slate-950">
              {c.roomCta}
            </button>
          ) : step === 2 || step === 3 ? (
            <button type="button" onClick={onOpenContact} className="mt-4 w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-black text-slate-950">
              {step === 2 ? c.servicesCta : c.requestCta}
            </button>
          ) : (
            <>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/75">
                {c.pin}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a target="_blank" rel="noreferrer" href="/staff/demo/housekeeping" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-xs font-semibold text-white">{c.housekeeping}</a>
                <a target="_blank" rel="noreferrer" href="/staff/demo/maintenance" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-xs font-semibold text-white">{c.maintenance}</a>
                <a target="_blank" rel="noreferrer" href="/staff/demo/reception" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-xs font-semibold text-white">{c.reception}</a>
                <a target="_blank" rel="noreferrer" href="/staff/demo/manager" className="rounded-xl border border-violet-200/20 bg-violet-200/[0.08] px-3 py-2 text-center text-xs font-semibold text-violet-100">{c.manager}</a>
              </div>
            </>
          )}

          <div className="mt-4 flex gap-1.5">
            {[1,2,3,4].map((n) => (
              <span key={n} className={"h-1.5 flex-1 rounded-full " + (n <= step ? "bg-cyan-200" : "bg-white/10")} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
