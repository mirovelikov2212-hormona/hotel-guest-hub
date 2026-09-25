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
  housekeeping: string;
  maintenance: string;
  reception: string;
  manager: string;
};

const COPY: Record<string, Copy> = {
  bg: {
    label: "DEMO GUIDE",
    hide: "Скрий",
    show: "Покажи guide",
    next: "Продължи",
    done: "Готово",
    roomTitle: "Стъпка 1 · Потвърди demo стаята",
    roomText: "Използвай стая 901. Това е специална test room и за нея не са нужни реални дати за престой.",
    roomCta: "Покажи стая 901",
    deptTitle: "Стъпка 2 · Избери хотелски отдел",
    deptText: "Избери една от трите карти на първия ред: Онлайн рецепция, Онлайн хаускипинг или Онлайн технически отдел.",
    deptCta: "Отвори Housekeeping",
    requestTitle: "Стъпка 3 · Изпрати demo заявка",
    requestText: "Например в Housekeeping избери Хавлии и изпрати заявката. Можеш да тестваш и Maintenance или Reception.",
    requestHint: "Заявката се записва реално като TEST и не влиза в реалните хотелски KPI.",
    requestCta: "Покажи Housekeeping",
    staffTitle: "Стъпка 4 · Обработи заявката и провери Manager",
    staffText: "Отвори Staff Hub на отдела, натисни Старт и после Готово. След това отвори Manager — заявката и demo броячите трябва да се виждат и там.",
    staffHint: "Staff / Manager PIN: 2026",
    directTitle: "Стъпка 5 · Изпрати лично съобщение",
    directText: "Отвори Reception → Лични съобщения, избери стая 901 и изпрати съобщение само до този гост. После се върни в Guest Hub и виж съобщението.",
    broadcastTitle: "Стъпка 6 · Изпрати съобщение до всички",
    broadcastText: "В Reception отвори Общи съобщения към гостите и публикувай demo съобщение. То ще се появи в Guest Hub без да се изпраща външен push от demo средата.",
    surveyTitle: "Стъпка 7 · Покажи анкетата",
    surveyText: "В реален хотел анкетата се появява по правилото за Ден 3. В demo room 901 можем да я покажем веднага и да я попълниш с реалния survey flow.",
    surveyCta: "Покажи demo анкетата",
    surveyContinue: "Анкетата е изпратена · продължи",
    checkoutTitle: "Стъпка 8 · Приключи престоя",
    checkoutText: "Последната стъпка симулира напускането на госта: demo stay-ът се приключва authoritative, Guest Hub се заключва отново и може да започне нов demo престой.",
    checkoutCta: "Приключи demo престоя",
    checkoutBusy: "Приключване…",
    finishedTitle: "Demo престоят приключи",
    finishedText: "Премина през целия flow: Guest → Staff → Manager → Reception messages → Survey → End of stay.",
    restart: "Започни нов demo престой",
    pin: "PIN 2026",
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    reception: "Reception",
    manager: "Manager",
  },
  en: {
    label: "DEMO GUIDE",
    hide: "Hide",
    show: "Show guide",
    next: "Continue",
    done: "Done",
    roomTitle: "Step 1 · Confirm the demo room",
    roomText: "Use room 901. It is a dedicated test room and does not require real stay dates.",
    roomCta: "Show room 901",
    deptTitle: "Step 2 · Choose a hotel department",
    deptText: "Choose one of the three cards on the first row: Online Reception, Online Housekeeping or Online Maintenance.",
    deptCta: "Open Housekeeping",
    requestTitle: "Step 3 · Send a demo request",
    requestText: "For example, choose Towels in Housekeeping and send the request. You can also test Maintenance or Reception.",
    requestHint: "The request is really stored as TEST and is excluded from real hotel KPI.",
    requestCta: "Show Housekeeping",
    staffTitle: "Step 4 · Process the request and check Manager",
    staffText: "Open the department Staff Hub, press Start and then Done. Then open Manager — the request and demo counters should be visible there too.",
    staffHint: "Staff / Manager PIN: 2026",
    directTitle: "Step 5 · Send a personal message",
    directText: "Open Reception → Personal messages, choose room 901 and send a message only to this guest. Return to Guest Hub and see the message.",
    broadcastTitle: "Step 6 · Send a message to all guests",
    broadcastText: "In Reception open Guest broadcasts and publish a demo message. It appears in Guest Hub without external push transport from the demo environment.",
    surveyTitle: "Step 7 · Show the survey",
    surveyText: "In a real hotel the survey follows the Day 3 rule. For demo room 901 it can be shown immediately using the real survey flow.",
    surveyCta: "Show demo survey",
    surveyContinue: "Survey submitted · continue",
    checkoutTitle: "Step 8 · End the stay",
    checkoutText: "The final step simulates departure: the demo stay is ended authoritatively, the Guest Hub locks again and a new demo stay can start.",
    checkoutCta: "End demo stay",
    checkoutBusy: "Ending stay…",
    finishedTitle: "Demo stay completed",
    finishedText: "You completed Guest → Staff → Manager → Reception messages → Survey → End of stay.",
    restart: "Start a new demo stay",
    pin: "PIN 2026",
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    reception: "Reception",
    manager: "Manager",
  },
  de: {
    label: "DEMO GUIDE",
    hide: "Ausblenden",
    show: "Guide anzeigen",
    next: "Weiter",
    done: "Fertig",
    roomTitle: "Schritt 1 · Demo-Zimmer bestätigen",
    roomText: "Nutze Zimmer 901. Es ist ein spezielles Testzimmer und benötigt keine realen Aufenthaltsdaten.",
    roomCta: "Zimmer 901 anzeigen",
    deptTitle: "Schritt 2 · Hotelabteilung wählen",
    deptText: "Wähle eine der drei Karten in der ersten Reihe: Online-Rezeption, Online-Housekeeping oder Online-Technik.",
    deptCta: "Housekeeping öffnen",
    requestTitle: "Schritt 3 · Demo-Anfrage senden",
    requestText: "Wähle z. B. Handtücher im Housekeeping und sende die Anfrage. Technik oder Rezeption können ebenfalls getestet werden.",
    requestHint: "Die Anfrage wird real als TEST gespeichert und nicht in echten Hotel-KPI gezählt.",
    requestCta: "Housekeeping anzeigen",
    staffTitle: "Schritt 4 · Anfrage bearbeiten und Manager prüfen",
    staffText: "Öffne den Staff Hub der Abteilung, drücke Start und danach Fertig. Öffne anschließend Manager — Anfrage und Demo-Zähler müssen dort sichtbar sein.",
    staffHint: "Staff / Manager PIN: 2026",
    directTitle: "Schritt 5 · Persönliche Nachricht senden",
    directText: "Öffne Rezeption → Persönliche Nachrichten, wähle Zimmer 901 und sende nur diesem Gast eine Nachricht. Kehre danach zum Guest Hub zurück.",
    broadcastTitle: "Schritt 6 · Nachricht an alle Gäste senden",
    broadcastText: "Öffne in der Rezeption Gäste-Broadcasts und veröffentliche eine Demo-Mitteilung. Sie erscheint im Guest Hub ohne externen Push-Transport.",
    surveyTitle: "Schritt 7 · Umfrage anzeigen",
    surveyText: "Im echten Hotel folgt die Umfrage der Tag-3-Regel. Für Demo-Zimmer 901 kann der echte Survey Flow sofort angezeigt werden.",
    surveyCta: "Demo-Umfrage anzeigen",
    surveyContinue: "Umfrage gesendet · weiter",
    checkoutTitle: "Schritt 8 · Aufenthalt beenden",
    checkoutText: "Zum Schluss wird die Abreise simuliert: Der Demo-Aufenthalt wird authoritative beendet und der Guest Hub wieder gesperrt.",
    checkoutCta: "Demo-Aufenthalt beenden",
    checkoutBusy: "Wird beendet…",
    finishedTitle: "Demo-Aufenthalt beendet",
    finishedText: "Du hast Guest → Staff → Manager → Reception Messages → Survey → End of stay durchlaufen.",
    restart: "Neuen Demo-Aufenthalt starten",
    pin: "PIN 2026",
    housekeeping: "Housekeeping",
    maintenance: "Technik",
    reception: "Rezeption",
    manager: "Manager",
  },
};

const STEP_KEY = "gostaya-demo-guide-step-v2";
const HIDDEN_KEY = "gostaya-demo-guide-hidden-v2";

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
      <button
        type="button"
        onClick={() => setGuideHidden(false)}
        className="fixed bottom-4 right-4 z-[45] rounded-full border border-cyan-300/30 bg-[#071821]/95 px-4 py-2 text-xs font-bold text-cyan-100 shadow-2xl backdrop-blur"
      >
        {c.show}
      </button>
    );
  }

  if (finished) {
    return (
      <aside className="fixed bottom-4 left-1/2 z-[45] w-[min(92vw,430px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0">
        <div className="rounded-[24px] border border-emerald-300/30 bg-[#071821]/95 p-5 shadow-2xl backdrop-blur-xl">
          <div className="text-[10px] font-black tracking-[0.22em] text-emerald-200">{c.label} · ✓</div>
          <h3 className="mt-3 text-lg font-semibold text-white">{c.finishedTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{c.finishedText}</p>
          <button
            type="button"
            onClick={() => {
              setFinished(false);
              setStep(1);
              onFocusRoom();
            }}
            className="mt-4 w-full rounded-xl bg-emerald-200 px-4 py-2.5 text-sm font-black text-slate-950"
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
    <aside className="fixed bottom-4 left-1/2 z-[45] w-[min(94vw,460px)] -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0">
      <div className="overflow-hidden rounded-[24px] border border-cyan-200/25 bg-[#071821]/96 shadow-[0_18px_70px_rgba(0,0,0,.5),0_0_36px_rgba(34,211,238,.09)] backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-cyan-200 via-violet-300 to-emerald-300" />
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-black tracking-[0.22em] text-cyan-200">{c.label} · {step}/8</div>
            <button type="button" onClick={() => setGuideHidden(true)} className="text-xs text-white/55 hover:text-white">
              {c.hide}
            </button>
          </div>

          <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>

          {step === 3 ? (
            <p className="mt-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-2 text-xs leading-5 text-emerald-100/80">
              {c.requestHint}
            </p>
          ) : null}

          {step === 4 ? (
            <>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/80">
                {c.staffHint}{requestCompleted ? " · ✓ Request completed" : ""}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a target="_blank" rel="noreferrer" href="/staff/demo/housekeeping" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-xs font-semibold text-white">{c.housekeeping}</a>
                <a target="_blank" rel="noreferrer" href="/staff/demo/maintenance" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-xs font-semibold text-white">{c.maintenance}</a>
                <a target="_blank" rel="noreferrer" href="/staff/demo/reception" className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center text-xs font-semibold text-white">{c.reception}</a>
                <a target="_blank" rel="noreferrer" href="/staff/demo/manager" className="rounded-xl border border-violet-200/20 bg-violet-200/[0.08] px-3 py-2 text-center text-xs font-semibold text-violet-100">{c.manager}</a>
              </div>
              <button type="button" onClick={() => setStep(5)} className="mt-3 w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-black text-slate-950">
                {c.next}
              </button>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/75">
                <span>{c.pin}</span><span>Room 901</span>
              </div>
              <a target="_blank" rel="noreferrer" href="/staff/demo/reception" className="mt-3 block w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-center text-sm font-black text-slate-950">
                {c.reception}
              </a>
              <button type="button" onClick={() => setStep(6)} className="mt-2 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white">
                {c.done} · {c.next}
              </button>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <a target="_blank" rel="noreferrer" href="/staff/demo/reception" className="mt-3 block w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-center text-sm font-black text-slate-950">
                {c.reception}
              </a>
              <button type="button" onClick={() => setStep(7)} className="mt-2 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white">
                {c.done} · {c.next}
              </button>
            </>
          ) : null}

          {step === 7 ? (
            <div className="mt-3 grid gap-2">
              <button type="button" onClick={onForceSurvey} className="w-full rounded-xl bg-violet-200 px-4 py-2.5 text-sm font-black text-slate-950">
                {c.surveyCta}
              </button>
              <button type="button" onClick={() => setStep(8)} className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white">
                {c.surveyContinue}
              </button>
            </div>
          ) : null}

          {step === 8 ? (
            <button
              type="button"
              disabled={ending}
              onClick={() => void endStay()}
              className="mt-4 w-full rounded-xl bg-emerald-200 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {ending ? c.checkoutBusy : c.checkoutCta}
            </button>
          ) : null}

          {step === 1 ? (
            <button type="button" onClick={onFocusRoom} className="mt-4 w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-black text-slate-950">
              {c.roomCta}
            </button>
          ) : null}

          {step === 2 || step === 3 ? (
            <button type="button" onClick={onOpenDepartment} className="mt-4 w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-black text-slate-950">
              {step === 2 ? c.deptCta : c.requestCta}
            </button>
          ) : null}

          <div className="mt-4 flex gap-1.5">
            {Array.from({ length: 8 }, (_, index) => index + 1).map((n) => (
              <span key={n} className={"h-1.5 flex-1 rounded-full " + (n <= step ? "bg-cyan-200" : "bg-white/10")} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
