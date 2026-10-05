import Image from "next/image";
import PilotEvidenceVisual from "./PilotEvidenceVisual";

type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "РЕАЛНИ РЕЗУЛТАТИ ОТ ПИЛОТЕН ХОТЕЛ",
    title: "Пилотен хотел:",
    hotel: "Aquamarine Kranevo",
    text: "Реални данни от пилотния сезон 2026, които показват използването на GOSTAYA в ежедневна хотелска среда. Измерените събития са отделени от изчислените оперативни оценки.",
    season: "Пилотен сезон 2026",
    metrics: [
      ["65/66", "активни стаи"],
      ["5 347", "отваряния на портала"],
      ["2 448", "информационни взаимодействия"],
      ["145", "заявки за услуги"],
      ["56", "резервации за масаж"],
      ["€2 570", "начислена стойност от масажи"],
    ],
    estimate: "24–45 ч. оценено спестено административно време",
    dashboard: "Оперативен преглед",
    hub: "Guest Hub",
  },
  en: {
    eyebrow: "REAL RESULTS FROM A PILOT HOTEL",
    title: "Pilot hotel:",
    hotel: "Aquamarine Kranevo",
    text: "Real 2026 pilot-season data showing how GOSTAYA was used in a live hotel environment. Observed events remain separate from modeled operational estimates.",
    season: "Pilot season 2026",
    metrics: [
      ["65/66", "active rooms"],
      ["5,347", "Guest Hub opens"],
      ["2,448", "information interactions"],
      ["145", "service requests"],
      ["56", "massage bookings"],
      ["€2,570", "charged massage value"],
    ],
    estimate: "24–45 h estimated administrative time avoided",
    dashboard: "Operational overview",
    hub: "Guest Hub",
  },
  de: {
    eyebrow: "REALE ERGEBNISSE AUS EINEM PILOTHOTEL",
    title: "Pilothotel:",
    hotel: "Aquamarine Kranevo",
    text: "Reale Daten aus der Pilotsaison 2026 zeigen die Nutzung von GOSTAYA im Hotelbetrieb. Beobachtete Events bleiben von modellierten operativen Schätzungen getrennt.",
    season: "Pilotsaison 2026",
    metrics: [
      ["65/66", "aktive Zimmer"],
      ["5.347", "Guest-Hub-Aufrufe"],
      ["2.448", "Info-Interaktionen"],
      ["145", "Serviceanfragen"],
      ["56", "Massagebuchungen"],
      ["€2.570", "berechneter Massagewert"],
    ],
    estimate: "24–45 Std. geschätzte vermiedene Admin-Zeit",
    dashboard: "Operativer Überblick",
    hub: "Guest Hub",
  },
} as const;

export default function PilotCaseStudy({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section id="evidence" className="scroll-mt-28 mx-auto mt-5 max-w-7xl overflow-hidden rounded-[34px] border border-[#cfe8fb] bg-gradient-to-br from-white via-[#fbfdff] to-[#eef7ff] shadow-[0_20px_60px_rgba(15,58,91,.07)]">
      <div className="px-5 py-10 sm:px-7 lg:py-11">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.22em] text-[#1479d3]">{c.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#102a43] sm:text-4xl">
              {c.title}{" "}
              <a href="https://aquamarine-kranevo.com/bg" target="_blank" rel="noreferrer" className="font-black text-[#1479d3] underline decoration-[#8fcaf2] underline-offset-4 hover:text-[#0f68b6]">
                {c.hotel}
              </a>
            </h2>
            <p className="mt-3 max-w-4xl text-base leading-7 text-slate-600">{c.text}</p>
          </div>
          <div className="w-fit rounded-full border border-[#b9ddf8] bg-white px-4 py-2 text-xs font-black text-[#1479d3] shadow-sm">{c.season}</div>
        </div>

        <div className="mt-7 grid gap-5 xl:grid-cols-[1.45fr_.55fr]">
          <div className="rounded-[28px] border border-[#cfe8fb] bg-white p-4 shadow-[0_14px_38px_rgba(15,58,91,.06)] sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-[30px] border-[7px] border-[#102a43] bg-white shadow-[0_24px_55px_rgba(15,58,91,.16)]">
                <div className="relative h-36 overflow-hidden">
                  <Image src="/images/aquamarine-test-hero-v6.jpg" alt="Aquamarine Kranevo" fill className="object-cover" sizes="220px" />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/45 to-transparent px-4 py-3 text-white">
                    <span className="text-[10px] font-black tracking-[.12em]">GOSTAYA</span>
                    <span className="rounded-full bg-white/20 px-2 py-1 text-[9px] font-bold backdrop-blur">{c.hub}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-xl font-black text-[#102a43]">{lang === "bg" ? "Добре дошли!" : lang === "de" ? "Willkommen!" : "Welcome!"}</div>
                  <div className="mt-1 text-xs text-slate-500">Aquamarine Kranevo</div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {["Информация","Ресторанти","Услуги","AI асистент"].map((item,index)=><div key={item} className="rounded-xl border border-[#cfe8fb] bg-[#f8fbfe] p-2 text-[10px] font-bold text-[#075985]"><span className="mr-1 text-[#1479d3]">{String(index+1).padStart(2,"0")}</span>{item}</div>)}
                  </div>
                  <div className="mt-3 rounded-xl bg-[#1479d3] px-3 py-2 text-center text-xs font-black text-white">{lang === "bg" ? "Заявете услуга" : lang === "de" ? "Service anfragen" : "Request service"}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-[#d6e9f8] bg-[#f8fbfe]">
                <div className="flex items-center justify-between border-b border-[#d6e9f8] bg-white px-5 py-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[.14em] text-[#1479d3]">GOSTAYA</div>
                    <div className="mt-1 text-sm font-black text-[#102a43]">{c.dashboard}</div>
                  </div>
                  <div className="rounded-full bg-[#eef7ff] px-3 py-1 text-[10px] font-bold text-[#1479d3]">Aquamarine</div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
                  {[["5 347","Отваряния"],["145","Заявки"],["56","Масажи"],["€2 570","Масажи €"]].map(([v,l])=><div key={l} className="rounded-2xl border border-[#d6e9f8] bg-white p-3"><div className="text-xl font-black text-[#102a43]">{v}</div><div className="mt-1 text-[10px] font-semibold text-slate-500">{l}</div></div>)}
                </div>
                <div className="px-4 pb-4">
                  <PilotEvidenceVisual lang={lang} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {c.metrics.map(([v,l])=><div key={l} className="rounded-[22px] border border-[#cfe8fb] bg-white p-4 shadow-sm"><div className="text-2xl font-black text-[#102a43]">{v}</div><div className="mt-1 text-xs leading-5 text-slate-500">{l}</div></div>)}
            <div className="rounded-[22px] border border-[#8fcaf2] bg-[#eef7ff] p-4 text-sm font-black leading-6 text-[#075985]">{c.estimate}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
