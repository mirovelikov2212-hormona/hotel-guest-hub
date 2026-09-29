"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  lang: string;
  roomConfirmed: boolean;
  room: string;
  departmentOpen: boolean;
  hasRequest: boolean;
  requestCompleted: boolean;
  onFocusRoom: () => void;
  onOpenDepartment: () => void;
  onForceSurvey: () => void;
  onEndStay: () => Promise<boolean>;
};

type Copy = {
  label: string;
  hide: string;
  show: string;
  next: string;
  done: string;
  roomTitle: string;
  roomText: string;
  roomCta: string;
  deptTitle: string;
  deptText: string;
  deptCta: string;
  requestTitle: string;
  requestText: string;
  requestHint: string;
  requestCta: string;
  staffTitle: string;
  staffText: string;
  staffHint: string;
  directTitle: string;
  directText: string;
  broadcastTitle: string;
  broadcastText: string;
  surveyTitle: string;
  surveyText: string;
  surveyCta: string;
  surveyContinue: string;
  checkoutTitle: string;
  checkoutText: string;
  checkoutCta: string;
  checkoutBusy: string;
  finishedTitle: string;
  finishedText: string;
  restart: string;
  pin: string;
  reception: string;
};

const COPY: Record<string, Copy> = {
  bg: {
    label: "DEMO НАСОКИ",
    hide: "Скрий",
    show: "Насоки",
    next: "Следваща стъпка",
    done: "Готово",
    roomTitle: "1. Потвърди стая 901",
    roomText: "Въведи 901 и потвърди. Това е тестовата стая за демото.",
    roomCta: "Към стая 901",
    deptTitle: "2. Избери отдел",
    deptText: "Отвори Рецепция, Хаускипинг или Технически отдел.",
    deptCta: "Отвори Хаускипинг",
    requestTitle: "3. Изпрати заявка",
    requestText: "Например: Хаускипинг → Хавлии → изпрати заявката.",
    requestHint: "Заявката е TEST и не влиза в реалните хотелски KPI.",
    requestCta: "Покажи Хаускипинг",
    staffTitle: "4. Провери Manager",
    staffText: "Погледни Manager панела вдясно. Заявката трябва да се появи там.",
    staffHint: "Demo PIN: 2026",
    directTitle: "5. Лично съобщение",
    directText: "В Reception → Лични съобщения избери стая 901 и изпрати съобщение.",
    broadcastTitle: "6. Общо съобщение",
    broadcastText: "В Reception → Общи съобщения публикувай demo съобщение към гостите.",
    surveyTitle: "7. Покажи анкетата",
    surveyText: "За demo стая 901 анкетата може да се отвори веднага.",
    surveyCta: "Покажи анкетата",
    surveyContinue: "Анкетата е готова",
    checkoutTitle: "8. Приключи престоя",
    checkoutText: "Симулирай checkout и върни Hub-а в начално състояние.",
    checkoutCta: "Приключи престоя",
    checkoutBusy: "Приключване…",
    finishedTitle: "Демото е завършено",
    finishedText: "Премина през целия demo flow.",
    restart: "Започни отначало",
    pin: "PIN 2026",
    reception: "Отвори Reception",
  },
  en: {
    label: "DEMO GUIDE",
    hide: "Hide",
    show: "Guide",
    next: "Next step",
    done: "Done",
    roomTitle: "1. Confirm room 901",
    roomText: "Enter 901 and confirm. This is the dedicated demo room.",
    roomCta: "Go to room 901",
    deptTitle: "2. Choose a department",
    deptText: "Open Reception, Housekeeping or Maintenance.",
    deptCta: "Open Housekeeping",
    requestTitle: "3. Send a request",
    requestText: "Example: Housekeeping → Towels → send the request.",
    requestHint: "The request is TEST and is excluded from real hotel KPI.",
    requestCta: "Show Housekeeping",
    staffTitle: "4. Check Manager",
    staffText: "Look at Manager on the right. The request should appear there.",
    staffHint: "Demo PIN: 2026",
    directTitle: "5. Personal message",
    directText: "Reception → Personal messages → room 901 → send a message.",
    broadcastTitle: "6. Guest broadcast",
    broadcastText: "Reception → Guest broadcasts → publish a demo message.",
    surveyTitle: "7. Show the survey",
    surveyText: "For demo room 901 the survey can be opened immediately.",
    surveyCta: "Show survey",
    surveyContinue: "Survey done",
    checkoutTitle: "8. End the stay",
    checkoutText: "Simulate checkout and return the Hub to its initial state.",
    checkoutCta: "End stay",
    checkoutBusy: "Ending…",
    finishedTitle: "Demo completed",
    finishedText: "You completed the full demo flow.",
    restart: "Start again",
    pin: "PIN 2026",
    reception: "Open Reception",
  },
  de: {
    label: "DEMO-ANLEITUNG",
    hide: "Ausblenden",
    show: "Anleitung",
    next: "Nächster Schritt",
    done: "Fertig",
    roomTitle: "1. Zimmer 901 bestätigen",
    roomText: "901 eingeben und bestätigen. Das ist das Demo-Zimmer.",
    roomCta: "Zu Zimmer 901",
    deptTitle: "2. Abteilung wählen",
    deptText: "Rezeption, Housekeeping oder Technik öffnen.",
    deptCta: "Housekeeping öffnen",
    requestTitle: "3. Anfrage senden",
    requestText: "Beispiel: Housekeeping → Handtücher → Anfrage senden.",
    requestHint: "Die Anfrage ist TEST und zählt nicht zu echten Hotel-KPI.",
    requestCta: "Housekeeping anzeigen",
    staffTitle: "4. Manager prüfen",
    staffText: "Im Manager rechts muss die Anfrage direkt erscheinen.",
    staffHint: "Demo-PIN: 2026",
    directTitle: "5. Persönliche Nachricht",
    directText: "Rezeption → Persönliche Nachrichten → Zimmer 901 → Nachricht senden.",
    broadcastTitle: "6. Nachricht an Gäste",
    broadcastText: "Rezeption → Gäste-Broadcasts → Demo-Nachricht veröffentlichen.",
    surveyTitle: "7. Umfrage anzeigen",
    surveyText: "Für Demo-Zimmer 901 kann die Umfrage sofort geöffnet werden.",
    surveyCta: "Umfrage anzeigen",
    surveyContinue: "Umfrage fertig",
    checkoutTitle: "8. Aufenthalt beenden",
    checkoutText: "Checkout simulieren und den Hub auf den Anfangszustand zurücksetzen.",
    checkoutCta: "Aufenthalt beenden",
    checkoutBusy: "Wird beendet…",
    finishedTitle: "Demo abgeschlossen",
    finishedText: "Der komplette Demo-Ablauf ist abgeschlossen.",
    restart: "Neu starten",
    pin: "PIN 2026",
    reception: "Rezeption öffnen",
  },
};

const STEP_KEY = "gostaya-demo-guide-step-v3";
const HIDDEN_KEY = "gostaya-demo-guide-hidden-v3";

function resolveCopy(lang: string) {
  return COPY[String(lang || "").toLowerCase()] || COPY.en;
}

function readStep() {
  if (typeof window === "undefined") return 1;
  const value = Number(window.sessionStorage.getItem(STEP_KEY) || 1);
  return Number.isInteger(value) && value >= 1 && value <= 8 ? value : 1;
}

export default function DemoJourneyGuide({
  lang,
  roomConfirmed,
  room,
  departmentOpen,
  hasRequest,
  requestCompleted,
  onFocusRoom,
  onOpenDepartment,
  onForceSurvey,
  onEndStay,
}: Props) {
  const c = resolveCopy(lang);
  const [hidden, setHidden] = useState(false);
  const [manualStep, setManualStep] = useState(1);
  const [ending, setEnding] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(HIDDEN_KEY) === "1");
      setManualStep(readStep());
    } catch {}
  }, []);

  const automaticStep = useMemo(() => {
    if (!roomConfirmed || room !== "901") return 1;
    if (!hasRequest && !departmentOpen) return 2;
    if (!hasRequest) return 3;
    return 4;
  }, [departmentOpen, hasRequest, room, roomConfirmed]);

  const step = Math.max(automaticStep, manualStep);

  useEffect(() => {
    if (automaticStep < 4) return;
    setManualStep((current) => {
      const next = Math.max(current, 4);
      try { sessionStorage.setItem(STEP_KEY, String(next)); } catch {}
      return next;
    });
  }, [automaticStep]);

  const setStep = (next: number) => {
    const safe = Math.max(1, Math.min(8, next));
    setManualStep(safe);
    try { sessionStorage.setItem(STEP_KEY, String(safe)); } catch {}
  };

  const setGuideHidden = (next: boolean) => {
    setHidden(next);
    try {
      if (next) sessionStorage.setItem(HIDDEN_KEY, "1");
      else sessionStorage.removeItem(HIDDEN_KEY);
    } catch {}
  };

  async function endStay() {
    if (ending) return;
    setEnding(true);
    const ok = await onEndStay().catch(() => false);
    setEnding(false);
    if (!ok) return;
    setFinished(true);
    try {
      sessionStorage.removeItem(STEP_KEY);
      sessionStorage.removeItem(HIDDEN_KEY);
    } catch {}
  }

  if (hidden) {
    return (
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={() => setGuideHidden(false)}
          className="rounded-full border border-cyan-200/40 bg-[#071821]/96 px-3 py-1.5 text-[10px] font-bold text-cyan-100 shadow-sm"
        >
          ? {c.show}
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <aside className="px-4 pb-3">
        <div className="rounded-2xl border border-emerald-300/30 bg-[#071821]/96 p-3 shadow-lg">
          <div className="text-[9px] font-black tracking-[0.16em] text-emerald-200">{c.label} · ✓</div>
          <h3 className="mt-2 text-sm font-semibold text-white">{c.finishedTitle}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-300">{c.finishedText}</p>
          <button
            type="button"
            onClick={() => {
              setFinished(false);
              setStep(1);
              onFocusRoom();
            }}
            className="mt-3 w-full rounded-lg bg-emerald-200 px-3 py-2 text-xs font-black text-slate-950"
          >
            {c.restart}
          </button>
        </div>
      </aside>
    );
  }

  const title =
    step === 1 ? c.roomTitle :
    step === 2 ? c.deptTitle :
    step === 3 ? c.requestTitle :
    step === 4 ? c.staffTitle :
    step === 5 ? c.directTitle :
    step === 6 ? c.broadcastTitle :
    step === 7 ? c.surveyTitle :
    c.checkoutTitle;

  const body =
    step === 1 ? c.roomText :
    step === 2 ? c.deptText :
    step === 3 ? c.requestText :
    step === 4 ? c.staffText :
    step === 5 ? c.directText :
    step === 6 ? c.broadcastText :
    step === 7 ? c.surveyText :
    c.checkoutText;

  return (
    <aside className="px-4 pb-3">
      <div className="overflow-hidden rounded-2xl border border-cyan-200/25 bg-[#071821]/96 shadow-lg">
        <div className="h-0.5 bg-gradient-to-r from-cyan-200 via-violet-300 to-emerald-300" />
        <div className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[9px] font-black tracking-[0.16em] text-cyan-200">{c.label} · {step}/8</div>
            <button
              type="button"
              onClick={() => setGuideHidden(true)}
              className="rounded-md px-1.5 py-1 text-[10px] text-white/60 hover:bg-white/5 hover:text-white"
            >
              {c.hide}
            </button>
          </div>

          <h3 className="mt-1.5 text-[13px] font-semibold leading-5 text-white">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-300">{body}</p>

          {step === 3 ? (
            <p className="mt-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.07] px-2.5 py-1.5 text-[10px] leading-4 text-emerald-100/85">
              {c.requestHint}
            </p>
          ) : null}

          {step === 4 ? (
            <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-bold text-white/75">
              {c.staffHint}{requestCompleted ? " · ✓" : ""}
            </div>
          ) : null}

          {step === 5 || step === 6 ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-white/60">{c.pin}</span>
              <a
                href="/staff/demo/reception"
                className="rounded-lg border border-cyan-200/25 bg-cyan-200/10 px-2.5 py-1.5 text-[10px] font-bold text-cyan-100"
              >
                {c.reception}
              </a>
            </div>
          ) : null}

          <div className="mt-2.5">
            {step === 1 ? (
              <button type="button" onClick={onFocusRoom} className="w-full rounded-lg bg-cyan-200 px-3 py-2 text-xs font-black text-slate-950">
                {c.roomCta}
              </button>
            ) : null}

            {step === 2 || step === 3 ? (
              <button type="button" onClick={onOpenDepartment} className="w-full rounded-lg bg-cyan-200 px-3 py-2 text-xs font-black text-slate-950">
                {step === 2 ? c.deptCta : c.requestCta}
              </button>
            ) : null}

            {step === 4 || step === 5 || step === 6 ? (
              <button type="button" onClick={() => setStep(step + 1)} className="w-full rounded-lg bg-cyan-200 px-3 py-2 text-xs font-black text-slate-950">
                {step === 4 ? c.next : `${c.done} · ${c.next}`}
              </button>
            ) : null}

            {step === 7 ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onForceSurvey} className="rounded-lg bg-violet-200 px-2 py-2 text-[11px] font-black text-slate-950">
                  {c.surveyCta}
                </button>
                <button type="button" onClick={() => setStep(8)} className="rounded-lg border border-white/15 bg-white/[0.06] px-2 py-2 text-[11px] font-bold text-white">
                  {c.surveyContinue}
                </button>
              </div>
            ) : null}

            {step === 8 ? (
              <button
                type="button"
                disabled={ending}
                onClick={() => void endStay()}
                className="w-full rounded-lg bg-emerald-200 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50"
              >
                {ending ? c.checkoutBusy : c.checkoutCta}
              </button>
            ) : null}
          </div>

          <div className="mt-2.5 flex gap-1">
            {Array.from({ length: 8 }, (_, index) => index + 1).map((n) => (
              <span
                key={n}
                className={"h-1 flex-1 rounded-full " + (n <= step ? "bg-cyan-200" : "bg-white/10")}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
