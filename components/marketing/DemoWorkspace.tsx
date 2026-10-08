"use client";

import "./demo-workspace.css";
import {browserDemoTimeZone,demoDepartmentWorking} from "@/lib/demo-routing.mjs";
import { DEMO_GUIDE_STEPS, DEMO_SHORT_GUIDE } from "@/lib/demo-guide";
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
  const [staffRole, setStaffRole] = useState<"manager" | "housekeeping" | "reception" | "maintenance">("manager");
  const section = searchParams.get("section");
  const demoSection = section && ["info", "housekeeping"].includes(section) ? section : null;
  const guestLang = ["bg", "en", "de", "ro", "cs", "ru"].includes(searchParams.get("guestLang") || "") ? searchParams.get("guestLang") : lang;
  const guestSrc = `/h/demo?demoCompact=1&lang=${guestLang}${demoSection ? `&demoSection=${demoSection}` : ""}`;
  const roleLabels = {manager: lang === "bg" ? "Мениджър" : "Manager", housekeeping: lang === "bg" ? "Хаускипинг" : "Housekeeping", maintenance: lang === "bg" ? "Поддръжка" : lang === "de" ? "Technik" : "Maintenance", reception: lang === "bg" ? "Рецепция" : lang === "de" ? "Rezeption" : "Reception"};

  const stage = useRef<HTMLDivElement>(null);
  const previousStep = useRef<number | null>(null);
  const [isMobile,setIsMobile]=useState(false);
  const [clock,setClock]=useState(new Date());
  useEffect(()=>{
    const resize=()=>setIsMobile(window.innerWidth<=760);resize();window.addEventListener("resize",resize);
    const timer=setInterval(()=>setClock(new Date()),30_000);
    return()=>{window.removeEventListener("resize",resize);clearInterval(timer);};
  },[]);
  const working=demoDepartmentWorking(browserDemoTimeZone(),clock);
  const [available,setAvailable] = useState({width:1000,height:800});
  useEffect(()=>{
    const element=stage.current;
    if(!element) return;
    const observer=new ResizeObserver(([entry])=>setAvailable({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(element);return()=>observer.disconnect();
  },[status]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== guestFrame.current?.contentWindow || event.data?.channel !== DEMO_GUIDE_CHANNEL || event.data?.type !== "state") return;
      if (Number.isInteger(event.data.model?.step) && Array.isArray(event.data.model?.instructions)) {
        const next=event.data.model as DemoGuideModel;
        setGuide({...next,...DEMO_GUIDE_STEPS[lang][next.step-1]});
        if(previousStep.current!==next.step) {
          previousStep.current=next.step;
          if(next.step===4){setStaffRole("manager");setActiveView("manager");}
          else if(next.step===5){setStaffRole(demoDepartmentWorking(browserDemoTimeZone()) ? "housekeeping" : "reception");setActiveView("manager");}
          else if(next.step===7 || next.step===8){setStaffRole("reception");setActiveView("manager");}
          else setActiveView("guest");
        }
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [lang]);

  useEffect(()=>{
    if(status==="ready" && activeView==="guest") guestFrame.current?.contentWindow?.postMessage({channel:DEMO_GUIDE_CHANNEL,type:"reveal-request"},window.location.origin);
  },[activeView,status,guide?.step]);

  function guideAction(action: DemoGuideAction) {
    if (action === "manager" || action === "housekeeping" || action === "reception") {
      setStaffRole(action === "housekeeping" && !working ? "reception" : action);
      setActiveView("manager");
      return;
    }
    if (["guest", "room", "department", "survey", "restart"].includes(action)) setActiveView("guest");
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
        const staffResponses = await Promise.all((["manager", "housekeeping", "reception", "maintenance"] as const).map(role => fetch("/api/staff/auth/login", {
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

  const frameWidth=isMobile?Math.max(260,available.width-24):activeView==="guest"?390:1000;
  const frameHeight=isMobile?Math.max(240,available.height-54):activeView==="guest"?780:740;
  const scale=isMobile?1:Math.max(.2,Math.min(1,(available.width-40)/(frameWidth+24),(available.height-40)/(frameHeight+54)));
  const responsibleName = lang==="bg" ? (working ? "Хаускипинг" : "Рецепция") : lang==="de" ? (working ? "Housekeeping" : "Rezeption") : (working ? "Housekeeping" : "Reception");
  const routingInstruction = lang==="bg" ? (working ? "Отворете Хаускипинг и намерете заявката за стая 901. До 17:00 тя се вижда и в Рецепция и Мениджър." : "След 17:00 отворете Рецепция. Заявката се вижда само тук и при Мениджъра; неприключените заявки се връщат към отдела в 08:00.") : lang==="de" ? (working ? "Öffnen Sie Housekeeping und suchen Sie Zimmer 901. Bis 17:00 sehen auch Rezeption und Manager die Anfrage." : "Nach 17:00 öffnen Sie Rezeption. Nur Rezeption und Manager sehen die Anfrage; offene Aufgaben gehen um 08:00 zurück an die Abteilung.") : (working ? "Open Housekeeping and find room 901. Until 17:00, Reception and Manager also see the request." : "After 17:00, open Reception. Only Reception and Manager see the request; unfinished tasks return to the department at 08:00.");
  const displayGuide = guide?.step===5 ? {...guide,title:lang==="bg"?`Обработете заявката в ${responsibleName}`:lang==="de"?`In ${responsibleName} bearbeiten`:`Process the request in ${responsibleName}`,instructions:[routingInstruction,...guide.instructions.slice(1)],actions:[working?"housekeeping":"reception"] as DemoGuideAction[]} : guide;
  const timeZone=browserDemoTimeZone();
  const clockLabel=new Intl.DateTimeFormat(lang,{hour:"2-digit",minute:"2-digit",timeZone}).format(clock);
  return <main className="gostaya-demo-workspace">
    <header className="gostaya-demo-top"><div><strong>GOSTAYA</strong><span>{copy.title}</span></div><a href={backHref}>← {copy.back}</a></header>
    {status!=="ready"?<div className="gostaya-demo-preparing" aria-live="polite"><p>{status==="loading"?copy.loading:copy.error}</p>{status==="error"?<button onClick={()=>setAttempt(v=>v+1)}>{copy.retry}</button>:null}</div>:<div className="gostaya-demo-layout">
      <aside className="gostaya-demo-sidebar">
        <nav className="gostaya-demo-roles" aria-label={copy.managerTitle}>
          <button type="button" aria-pressed={activeView==="guest"} onClick={()=>{setActiveView("guest");guestFrame.current?.contentWindow?.postMessage({channel:DEMO_GUIDE_CHANNEL,type:"reveal-request"},window.location.origin);}}>◉ {copy.guest} · 901</button>
          {(["reception","housekeeping","maintenance","manager"] as const).map(role=><button key={role} type="button" aria-pressed={activeView==="manager"&&staffRole===role} onClick={()=>{setStaffRole(role);setActiveView("manager");}}>{roleLabels[role]}</button>)}
        </nav>
        <p className="gostaya-demo-access">{lang==="bg"?"Демо стая":"Demo room"} 901 · PIN 2026</p>
        <details className="gostaya-demo-routing-note"><summary>{clockLabel} · {timeZone} · {lang==="bg"?(working?"Дневна смяна":"Поема Рецепция"):(working?"Day shift":"Reception covers")}</summary><p>{lang==="bg"?"08:00–17:00: заявките се виждат в съответния отдел, Рецепция и Мениджър. След 17:00 — само Рецепция и Мениджър. Неизпълнените заявки и тези за следващия ден се появяват в отдела в 08:00. Това е примерното правило на демо хотела; часовете тук следват браузъра ви.":lang==="de"?"08:00–17:00: zuständige Abteilung, Rezeption und Manager. Außerhalb der Schicht: Rezeption und Manager. Offene Anfragen kehren um 08:00 zur Abteilung zurück. Diese Demo nutzt Ihre Browser-Zeitzone.":"08:00–17:00: responsible department, Reception and Manager. After hours: Reception and Manager. Pending requests return to the department at 08:00. This demo uses your browser time zone."}</p></details>
        {displayGuide?<>{isMobile?<div className="gostaya-demo-mobile-guide"><strong>{displayGuide.step}/{displayGuide.total} · {displayGuide.title}</strong><p>{displayGuide.step===5 ? routingInstruction : DEMO_SHORT_GUIDE[lang][displayGuide.step-1]}</p><div>{displayGuide.step>1?<button onClick={()=>guideAction("previous")}>←</button>:null}{displayGuide.actions[0]?<button onClick={()=>guideAction(displayGuide.actions[0])}>{lang==="bg"?"Отвори":lang==="de"?"Öffnen":"Open"}</button>:null}{displayGuide.step<displayGuide.total?<button disabled={!displayGuide.canContinue} onClick={()=>guideAction("next")}>{lang==="bg"?"Продължи →":lang==="de"?"Weiter →":"Next →"}</button>:null}</div></div>:<DemoGuideCard model={displayGuide} lang={lang} onAction={guideAction} compact vertical/>}
          <ol className="gostaya-demo-step-menu" aria-label={lang==="bg"?"Стъпки на демото":"Demo steps"}>{DEMO_GUIDE_STEPS[lang].map((step,i)=><li key={step.title} aria-current={displayGuide.step===i+1?"step":undefined}><button disabled={i+1>displayGuide.step} type="button" onClick={()=>guestFrame.current?.contentWindow?.postMessage({channel:DEMO_GUIDE_CHANNEL,type:"navigate",step:i+1},window.location.origin)}><span>{i+1<displayGuide.step?"✓":String(i+1).padStart(2,"0")}</span>{step.title}</button></li>)}</ol>
        </>:<p>{copy.loading}</p>}
      </aside>
      <section className="gostaya-demo-preview">
        <div className="gostaya-demo-view-heading"><strong>{activeView==="guest"?copy.guestTitle:roleLabels[staffRole]}</strong><span>{lang==="bg"?"Следвайте стъпките вляво":"Follow the steps on the left"}</span></div>
        <div ref={stage} className="gostaya-demo-stage">
          <div style={{width:(frameWidth+24)*scale,height:(frameHeight+54)*scale}} className="gostaya-demo-device-holder">
            <div className={`gostaya-demo-device ${activeView==="guest"?"gostaya-demo-device-phone":"gostaya-demo-device-panel"}`} style={{width:frameWidth+24,height:frameHeight+54,transform:`scale(${scale})`}}>
              <div className="gostaya-demo-device-top"><span>9:41</span><span>{activeView==="guest"?"GOSTAYA":"GOSTAYA · LIVE"}</span><span>•••</span></div>
              <iframe hidden={activeView!=="guest"} ref={guestFrame} src={guestSrc} onLoad={()=>guestFrame.current?.contentWindow?.postMessage({channel:DEMO_GUIDE_CHANNEL,type:"sync"},window.location.origin)} title={copy.guestTitle} style={{width:isMobile?frameWidth:390,height:isMobile?frameHeight:780}} allow="clipboard-read; clipboard-write"/>
              {activeView==="manager"?<iframe src={`/staff/demo/${staffRole}?demoCompact=1`} title={roleLabels[staffRole]} style={{width:frameWidth,height:frameHeight}} allow="clipboard-read; clipboard-write"/>:null}
              <div className="gostaya-demo-device-home"/>
            </div>
          </div>
        </div>
      </section>
    </div>}
  </main>;
}
