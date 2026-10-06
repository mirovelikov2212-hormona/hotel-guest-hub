import MarketingIcon from "./MarketingIcon";
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

export default function PilotCaseStudy({lang}:{lang:Lang}) {
  const c=COPY[lang];
  return <section id="evidence" className="gostaya-shell gostaya-section gostaya-pilot">
    <div className="gostaya-pilot-heading"><div><p className="gostaya-eyebrow">{c.eyebrow}</p><h2>{c.title} <a href="https://aquamarine-kranevo.com/bg" target="_blank" rel="noreferrer">{c.hotel}</a></h2><p className="gostaya-body">{c.text}</p></div><span className="gostaya-season">{c.season}</span></div>
    <div className="gostaya-pilot-grid"><div className="gostaya-pilot-dashboard"><div className="gostaya-dashboard-heading"><span className="gostaya-mobile-brand">GOSTAYA</span><span>{c.dashboard}</span></div><PilotEvidenceVisual lang={lang}/></div>
      <div className="gostaya-pilot-metrics">{c.metrics.map(([value,label],i)=><div key={label}><span className="gostaya-metric-icon" aria-hidden="true"><MarketingIcon name={["bed","phone","info","reception","massage","euro"][i]}/></span><div><strong>{value}</strong><p>{label}</p></div></div>)}</div>
    </div>
    <div className="gostaya-pilot-note"><strong>{c.estimate}</strong><p>{lang==="bg"?"Оперативна оценка, а не измерено време. 65 активни стаи от общо 66; една стая е блокирана за тестове. Отварянията не означават уникални гости. Пилотът работи без PMS интеграция.":lang==="de"?"Operative Schätzung, keine Zeitmessung. 65 von 66 Zimmern aktiv; ein Zimmer für Tests reserviert. Aufrufe sind keine einzelnen Gäste. Pilot ohne PMS-Integration.":"Operational estimate, not measured time. 65 of 66 rooms active; one room reserved for testing. Opens are not unique guests. Pilot without PMS integration."}</p></div>
  </section>;
}
