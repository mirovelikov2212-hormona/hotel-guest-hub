"use client";
import {browserDemoTimeZone} from "@/lib/demo-routing.mjs";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import DemoSurveyPanel from "./DemoSurveyPanel";
import { useStaffStore } from "./store/StaffStoreProvider";
import { useStaffUi } from "./StaffUiProvider";
import GuestDirectCommunicationsWorkspace from "./GuestDirectCommunicationsWorkspace";
import GuestCommunicationsWorkspace from "./GuestCommunicationsWorkspace";
import { notifyDemoUpdate } from "@/lib/demo-live";
import { translateDepartment, translateStaffStatus } from "@/lib/staff/ui-copy";
import type { StaffRequestStatus } from "@/lib/staff/types";

type Role = "manager" | "reception" | "housekeeping" | "maintenance";
export default function DemoCompactPanel({role}:{role:Role}) {
  const {requests} = useStaffStore();
  const {lang} = useStaffUi();
  const bg=lang==="bg", de=lang==="de";
  const searchParams = useSearchParams();
  const [tab,setTab]=useState(role === "manager" && searchParams.get("panel") === "surveys" ? "surveys" : "requests");
  const [filter,setFilter]=useState("active");
  const [page,setPage]=useState(0);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const data=requests.filter(r=>r.isTest && r.room==="901");
  const filtered=data.filter(r=>filter==="active" ? r.status!=="completed" : r.status===filter).sort((a,b)=>Date.parse(b.createdAtIso)-Date.parse(a.createdAtIso));
  const pages=Math.max(1,Math.ceil(filtered.length/6));
  const safePage=Math.min(page,pages-1);
  const labels={active:bg?"Активни":de?"Aktiv":"Active",new:bg?"Нови":de?"Neu":"New",in_progress:bg?"В процес":de?"In Bearbeitung":"In progress",completed:bg?"Приключени":de?"Erledigt":"Completed"};
  async function change(id:string,status:StaffRequestStatus) {
    setBusy(id);setError("");
    try {
      const response=await fetch("/api/staff/request-status",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,requestId:id,status,hotelSlug:"demo",role,demoTimeZone:browserDemoTimeZone()})});
      if(!response.ok) throw new Error(String(response.status));
      notifyDemoUpdate("demo");
    } catch {setError(bg?"Промяната не е записана. Проверете отдела и опитайте отново.":de?"Änderung nicht gespeichert. Abteilung prüfen und erneut versuchen.":"Change was not saved. Check the department and try again.");}
    finally {setBusy(null);}
  }
  return <main className="demo-compact-panel">
    <header><div><strong>GOSTAYA</strong><h1>{role==="manager"?(bg?"Мениджърски панел":de?"Manager-Bereich":"Manager panel"):translateDepartment(role,lang)}</h1><p>{bg?"Демо стая 901 · реални тестови заявки":de?"Demo-Zimmer 901 · echte Testanfragen":"Demo room 901 · real test requests"}</p></div><span className="demo-live-badge">LIVE</span></header>
    <nav aria-label={bg?"Функции на панела":"Panel functions"}>{["requests",...(role==="manager"?["surveys"]:[]),...(role==="reception"?["personal"]:[]),...(role==="reception"||role==="manager"?["broadcast"]:[])].map(key=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>setTab(key)}>{key==="requests"?(bg?"Заявки":de?"Anfragen":"Requests"):key==="surveys"?(bg?"Анкети":de?"Umfragen":"Surveys"):key==="personal"?(bg?"Лични съобщения":de?"Persönliche Nachrichten":"Personal messages"):(bg?"Общи съобщения":de?"Mitteilungen":"Broadcasts")}</button>)}</nav>
    {tab==="requests"?<>
      <div className="demo-request-filters">{Object.entries(labels).map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>{setFilter(key);setPage(0);}}>{label}<b>{data.filter(r=>key==="active"?r.status!=="completed":r.status===key).length}</b></button>)}</div>
      {error?<p className="demo-panel-error" role="alert">{error}</p>:null}
      <div className="demo-request-grid">{filtered.slice(safePage*6,safePage*6+6).map(r=><article key={r.id}>
        <div className="demo-ticket-top"><strong>{bg?"Стая":de?"Zimmer":"Room"} {r.room}</strong><span className={`demo-status demo-status-${r.status}`}>{translateStaffStatus(r.status,lang)}</span></div>
        <h2>{(lang==="en"?r.typeLabelEn:lang==="de"?r.typeLabelDe:r.typeLabelBg)||r.typeLabel}</h2><p>{translateDepartment(r.department,lang)} · {new Intl.DateTimeFormat(lang,{hour:"2-digit",minute:"2-digit",timeZone:browserDemoTimeZone()}).format(new Date(r.createdAtIso))}</p>
        <div className="demo-ticket-actions">{r.status!=="completed"?<><button type="button" disabled={busy===r.id || r.status==="in_progress"} onClick={()=>void change(r.id,"in_progress")}>{bg?"СТАРТ":"START"}</button><button type="button" disabled={busy===r.id} onClick={()=>void change(r.id,"completed")}>{bg?"ГОТОВО":de?"ERLEDIGT":"DONE"}</button></>:<span>{bg?"Изпълнението е записано":de?"Erledigung gespeichert":"Completion recorded"}</span>}</div>
      </article>)}</div>
      {!filtered.length?<div className="demo-panel-empty"><span aria-hidden="true">✓</span><h2>{bg?"Няма заявки в този изглед":de?"Keine Anfragen in dieser Ansicht":"No requests in this view"}</h2><p>{bg?"Изпратете заявка от хъба на госта. Тук ще видите стаята, услугата и нейния статус.":de?"Senden Sie eine Anfrage im Guest Hub. Zimmer, Service und Status erscheinen hier.":"Send a request from the Guest Hub to see its room, service and status here."}</p></div>:null}
      <footer><p>{bg?"Статусите се зареждат от сървъра. Виждате действително записаните промени.":de?"Status wird vom Server geladen.":"Statuses are loaded from the server."}</p>{pages>1?<div><button disabled={safePage===0} onClick={()=>setPage(safePage-1)} aria-label="Previous page">←</button><span>{safePage+1}/{pages}</span><button disabled={safePage===pages-1} onClick={()=>setPage(safePage+1)} aria-label="Next page">→</button></div>:null}</footer>
    </>:tab==="surveys" && role === "manager" ? <DemoSurveyPanel surveyId={searchParams.get("surveyId")} lang={lang === "de" ? "de" : lang === "en" ? "en" : "bg"} /> :tab==="personal"?<GuestDirectCommunicationsWorkspace hotelSlug="demo" role="reception"/>:<GuestCommunicationsWorkspace hotelSlug="demo" role={role}/>}
  </main>;
}
