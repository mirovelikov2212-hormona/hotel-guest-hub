"use client";

import { useEffect, useState } from "react";
import { subscribeDemoUpdates } from "@/lib/demo-live";
import type { Day3Survey, Day3SurveyApiResponse } from "@/lib/staff/survey-types";
import { getSurveyCategoryLabel, getSurveyResolutionLabel, type StaffSurveyLang } from "@/lib/staff/survey-display";

export default function DemoSurveyPanel({surveyId,lang}:{surveyId:string|null;lang:StaffSurveyLang}) {
  const [surveys,setSurveys]=useState<Day3Survey[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const bg=lang==="bg",de=lang==="de";
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    async function refresh(){
      try{
        const response=await fetch("/api/staff/surveys?hotelSlug=demo&role=manager",{credentials:"include",cache:"no-store",signal:controller.signal});
        const data=await response.json() as Day3SurveyApiResponse;
        if(!response.ok || !data.ok)throw new Error("Survey fetch failed");
        if(active){
          const all=[...(data.activeSurveys||[]),...(data.reportSurveys||[])];
          setSurveys(all.filter(s=>s.isTest && s.room==="901").sort((a,b)=>a.id===surveyId?-1:b.id===surveyId?1:Date.parse(b.guestSubmittedAt)-Date.parse(a.guestSubmittedAt)));
          setError(false);
        }
      }catch{if(active)setError(true);}finally{if(active)setLoading(false);}
    }
    void refresh();const timer=setInterval(()=>void refresh(),10_000);const stop=subscribeDemoUpdates("demo",()=>void refresh());
    return()=>{active=false;controller.abort();clearInterval(timer);stop();};
  },[surveyId]);
  return <section className="demo-survey-panel" aria-live="polite">
    <h2>{bg?"Обратна връзка от госта":de?"Gästefeedback":"Guest feedback"}</h2>
    <p className="demo-survey-intro">{bg?"Същата анкета, изпратена от хъба за стая 901. Това е тестов запис.":de?"Dieselbe Umfrage aus dem Hub für Zimmer 901. Dies ist ein Testeintrag.":"The same survey submitted from the hub for room 901. This is a test record."}</p>
    {error?<p role="alert">{bg?"Анкетите не се заредиха. Опитваме отново.":de?"Umfragen konnten nicht geladen werden. Neuer Versuch läuft.":"Surveys could not load. Retrying."}</p>:null}
    {loading?<p>{bg?"Зареждане…":de?"Wird geladen…":"Loading…"}</p>:null}
    {!loading && !error && !surveys.length?<p>{bg?"Още няма изпратена тестова анкета.":de?"Noch keine Testumfrage gesendet.":"No test survey has been submitted yet."}</p>:null}
    <div className="demo-survey-grid">{surveys.map(s=><article key={s.id} className={s.id===surveyId?"demo-survey-selected":""}>
      <header><strong>{bg?"Стая":de?"Zimmer":"Room"} {s.room}</strong><span>{bg?"ТЕСТ":"TEST"}</span><b>{s.rating}/5</b></header>
      <p className="demo-survey-time">{new Intl.DateTimeFormat(lang,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(s.guestSubmittedAt))}</p>
      <dl>
        {s.selectedCategories.length?<><dt>{bg?"Категории":de?"Kategorien":"Categories"}</dt><dd>{s.selectedCategories.map(c=>getSurveyCategoryLabel(c,lang)).join(", ")}</dd></>:null}
        <dt>{bg?"Съвет за подобрение":de?"Verbesserungsvorschlag":"Improvement advice"}</dt><dd>{(lang==="bg"?s.improvementTextBg:lang==="de"?s.improvementTextDe:s.improvementTextEn)||s.improvementText||"—"}</dd>
        <dt>{bg?"Проблем":de?"Problem":"Problem"}</dt><dd>{(lang==="bg"?s.problemTextBg:lang==="de"?s.problemTextDe:s.problemTextEn)||s.problemText||"—"}</dd>
        {s.resolutionStatus?<><dt>{bg?"Решен ли е проблемът":de?"Problem gelöst":"Problem resolved"}</dt><dd>{getSurveyResolutionLabel(s.resolutionStatus,lang)}</dd></>:null}
        {s.resolutionNote?<><dt>{bg?"Допълнение":de?"Hinweis":"Note"}</dt><dd>{(lang==="bg"?s.resolutionNoteBg:lang==="de"?s.resolutionNoteDe:s.resolutionNoteEn)||s.resolutionNote}</dd></>:null}
      </dl>
    </article>)}</div>
  </section>;
}
