"use client";

import type { DemoGuideAction, DemoGuideModel } from "@/lib/demo-guide";

const COPY = {
  bg: { label:"ВОДЕНО ДЕМО", expected:"Какво трябва да видите", finished:"Демо престоят е приключен", complete:"Проследихте пътя от заявката на госта до обработката и управленския контрол.", busy:"Приключване…", labels:{room:"Към стая 901",department:"Отворете Хаускипинг в хъба",manager:"Отворете Мениджър",housekeeping:"Отворете панела Хаускипинг",reception:"Отворете Рецепция",survey:"Покажете анкетата",checkout:"Приключете престоя",previous:"Назад",next:"Проверих — продължи",restart:"Започнете отначало",hide:"Скрий насоките",show:"Покажи насоките"}},
  en: {label:"GUIDED DEMO",expected:"What you should see",finished:"Demo stay ended",complete:"You followed a guest request through processing and management oversight.",busy:"Ending…",labels:{room:"Go to room 901",department:"Open Housekeeping in the hub",manager:"Open Manager",housekeeping:"Open Housekeeping panel",reception:"Open Reception",survey:"Show survey",checkout:"End stay",previous:"Back",next:"Checked — continue",restart:"Start again",hide:"Hide guide",show:"Show guide"}},
  de: {label:"GEFÜHRTE DEMO",expected:"Das sollten Sie sehen",finished:"Demo-Aufenthalt beendet",complete:"Sie haben eine Gästeanfrage bis zur Bearbeitung und Managementkontrolle verfolgt.",busy:"Wird beendet…",labels:{room:"Zu Zimmer 901",department:"Housekeeping im Hub öffnen",manager:"Manager öffnen",housekeeping:"Housekeeping-Bereich öffnen",reception:"Rezeption öffnen",survey:"Umfrage anzeigen",checkout:"Aufenthalt beenden",previous:"Zurück",next:"Geprüft — weiter",restart:"Neu starten",hide:"Anleitung ausblenden",show:"Anleitung anzeigen"}},
} as const;

export default function DemoGuideCard({model,lang,onAction}:{model:DemoGuideModel;lang:string;onAction:(action:DemoGuideAction)=>void}) {
  const c = COPY[lang === "bg" || lang === "de" ? lang : "en"];
  const button = "min-h-10 rounded-xl px-4 py-2 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300";
  if (model.hidden) return <button type="button" onClick={()=>onAction("show")} className={`${button} border border-sky-200 bg-white text-sky-800`}>{c.labels.show} · {model.step}/{model.total}</button>;
  return <aside aria-label={c.label} className="overflow-hidden rounded-2xl border border-cyan-200/25 bg-[#102d40] text-white shadow-lg">
    <div className="h-1 bg-gradient-to-r from-cyan-200 via-sky-400 to-emerald-300"/>
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-black tracking-[.18em] text-cyan-200">{c.label} · {model.finished ? "✓" : `${model.step}/${model.total}`}</p><button type="button" className="min-h-8 text-xs text-slate-300" onClick={()=>onAction("hide")}>{c.labels.hide}</button></div>
      <div aria-live="polite" aria-atomic="true" className="mt-2 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div><h2 className="!text-base !font-bold !text-white">{model.finished ? c.finished : `${model.step}. ${model.title}`}</h2>
          {model.finished ? <p className="mt-2 text-sm text-slate-200">{c.complete}</p> : <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-5 text-slate-200">{model.instructions.map(line=><li key={line}>{line}</li>)}</ol>}
        </div>
        {!model.finished ? <div className="rounded-xl border border-cyan-100/15 bg-white/5 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-cyan-200">{c.expected}</p><p className="mt-1.5 text-[13px] leading-5 text-slate-100">{model.expected}</p></div> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(model.finished ? ["restart" as const] : model.actions).map(action=><button key={action} type="button" disabled={model.busy} onClick={()=>onAction(action)} className={`${button} bg-cyan-200 text-slate-950 disabled:opacity-50`}>{model.busy ? c.busy : c.labels[action]}</button>)}
        {!model.finished && model.step > 1 ? <button type="button" onClick={()=>onAction("previous")} className={`${button} border border-white/20 text-white`}>{c.labels.previous}</button> : null}
        {!model.finished && model.step < model.total ? <button type="button" disabled={!model.canContinue} onClick={()=>onAction("next")} className={`${button} border border-white/20 bg-white/10 text-white disabled:cursor-not-allowed disabled:opacity-40`}>{c.labels.next}</button> : null}
      </div>
      <div className="mt-4 flex gap-1" aria-label={`${model.step}/${model.total}`}>{Array.from({length:model.total},(_,i)=><span key={i} className={`h-1 flex-1 rounded-full ${i < model.step ? "bg-cyan-200" : "bg-white/15"}`}/>)}</div>
    </div>
  </aside>;
}
