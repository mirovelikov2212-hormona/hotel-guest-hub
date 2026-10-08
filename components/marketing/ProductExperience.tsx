"use client";

import { useState } from "react";
import MarketingIcon from "./MarketingIcon";
import ProductModuleExplorer from "./ProductModuleExplorer";

type Lang = "bg" | "en" | "de";
const COPY = {
  bg: {
    roles: ["Гостът изпраща", "Екипът изпълнява", "Мениджърът проследява"],
    details: ["От своя телефон", "В правилния отдел", "С ясна история"],
    example: "ИНТЕРАКТИВЕН ПРИМЕР", room: "Стая 901", request: "Нуждая се от ютия", title: "Проследете една заявка.",
    actions: ["Виж следващата стъпка", "СТАРТ", "ГОТОВО", "Опитай отново"],
    stages: ["Готова за изпращане", "Нова заявка", "В процес", "Изпълнена"],
    notes: ["Гостът избира услуга от хъба на хотела.", "Заявката е насочена към Хаускипинг според примерния работен график.", "Екипът е поел задачата. Гостът и мениджърът виждат нейния статус.", "Изпълнението е отразено. Историята остава в мениджърския панел."],
    waiting: "Очаква заявка", history: "История на заявката", pending: "Няма изпратена заявка", sent: "Получена в Хаускипинг", accepted: "Поета от екипа", completed: "Изпълнението е отчетено",
    departments: ["Рецепция", "Хаускипинг", "Поддръжка", "Мениджър"],
    departmentTitle: "Всеки отдел. Една платформа.", demoNote: "Примерен сценарий — не изпраща заявка до хотел.",
    tickets: ["Въпрос за престоя", "Заявка за ютия", "Проблем с климатика", "Всички отдели на едно място"],
    description: ["Информация и съдействие за гостите, както и заявки извън работното време на другите отдели.", "Заявките достигат до екипа с номер на стая и проследим статус.", "Техническите проблеми се проследяват от получаването до приключването.", "Заявки, качество, платени услуги и история на предприетите действия."],
    managerTitle: "От наблюдение до измерим резултат", cycle: ["Наблюдение", "Анализ", "Препоръка", "Одобрение", "Действие", "Измерване"],
    managerNote: "Мениджърът одобрява предложените действия. Резултатът се проследява.",
    training: ["Стандарти на хотела", "Материали за екипа", "Тестове и резултати"],
    revenue: ["Резервация за услуга", "Начислена стойност", "Отчет за мениджмънта"],
    integration: ["GOSTAYA", "Свързване според хотела", "PMS / външна услуга"],
    moduleNotes: ["Съдържанието и правилата се задават от хотела.", "Измерените приходи и оценените спестявания се показват отделно.", "Конкретните интеграции се уточняват за всеки обект."],
  },
  en: {
    roles: ["The guest sends", "The team delivers", "The manager tracks"], details: ["From their phone", "In the right department", "With a clear history"],
    example: "INTERACTIVE EXAMPLE", room: "Room 901", request: "I need an iron", title: "Follow one request.",
    actions: ["Send the request", "START", "DONE", "Try again"], stages: ["Ready to send", "New request", "In progress", "Completed"],
    notes: ["The guest chooses a service in the hotel hub.", "The request is routed to Housekeeping using the example working schedule.", "The team has accepted the task. The guest and manager can see its status.", "Completion is recorded. The history remains in the manager panel."],
    waiting: "Waiting for a request", history: "Request history", pending: "No request sent", sent: "Received by Housekeeping", accepted: "Accepted by the team", completed: "Completion recorded",
    departments: ["Reception", "Housekeeping", "Maintenance", "Manager"], departmentTitle: "Every team. One platform.", demoNote: "Illustrative scenario — no request is sent to a hotel.",
    tickets: ["A question about the stay", "Request for an iron", "Air conditioning issue", "All departments in one place"],
    description: ["Guest information and assistance, plus requests outside other departments’ working hours.", "Requests reach the team with a room number and a traceable status.", "Technical issues are tracked from receipt through completion.", "Requests, quality, paid services and a history of actions."],
    managerTitle: "From observation to measurable results", cycle: ["Observe", "Analyze", "Recommend", "Approve", "Execute", "Measure"], managerNote: "The manager approves proposed actions. Their impact is tracked.",
    training: ["Hotel standards", "Team learning materials", "Tests and results"], revenue: ["Service booking", "Charged value", "Management report"], integration: ["GOSTAYA", "Property-specific connection", "PMS / external service"],
    moduleNotes: ["Content and rules are defined by the hotel.", "Measured revenue and estimated savings are shown separately.", "Specific integrations are agreed for each property."],
  },
  de: {
    roles: ["Der Gast sendet", "Das Team erledigt", "Das Management verfolgt"], details: ["Vom eigenen Handy", "In der richtigen Abteilung", "Mit klarer Historie"],
    example: "INTERAKTIVES BEISPIEL", room: "Zimmer 901", request: "Ich brauche ein Bügeleisen", title: "Eine Anfrage verfolgen.",
    actions: ["Anfrage senden", "START", "ERLEDIGT", "Erneut ausprobieren"], stages: ["Bereit zum Senden", "Neue Anfrage", "In Bearbeitung", "Erledigt"],
    notes: ["Der Gast wählt einen Service im Hotel-Hub.", "Die Anfrage geht gemäß dem beispielhaften Dienstplan an Housekeeping.", "Das Team hat die Aufgabe übernommen. Gast und Management sehen den Status.", "Die Erledigung wird dokumentiert. Die Historie bleibt im Manager-Panel."],
    waiting: "Wartet auf eine Anfrage", history: "Anfrageverlauf", pending: "Keine Anfrage gesendet", sent: "Im Housekeeping eingegangen", accepted: "Vom Team übernommen", completed: "Erledigung dokumentiert",
    departments: ["Rezeption", "Housekeeping", "Technik", "Management"], departmentTitle: "Jede Abteilung. Eine Plattform.", demoNote: "Beispielszenario — keine Anfrage wird an ein Hotel gesendet.",
    tickets: ["Frage zum Aufenthalt", "Anfrage für ein Bügeleisen", "Problem mit der Klimaanlage", "Alle Abteilungen im Überblick"],
    description: ["Gästeinformationen und Unterstützung, auch außerhalb der Arbeitszeiten anderer Abteilungen.", "Anfragen erreichen das Team mit Zimmernummer und nachvollziehbarem Status.", "Technische Probleme werden bis zur Erledigung verfolgt.", "Anfragen, Qualität, bezahlte Services und durchgeführte Aktionen."],
    managerTitle: "Von Beobachtungen zu messbaren Ergebnissen", cycle: ["Beobachten", "Analysieren", "Empfehlen", "Freigeben", "Ausführen", "Messen"], managerNote: "Das Management gibt vorgeschlagene Aktionen frei. Ihre Wirkung wird verfolgt.",
    training: ["Hotelstandards", "Lernmaterialien", "Tests und Ergebnisse"], revenue: ["Servicebuchung", "Berechneter Wert", "Managementbericht"], integration: ["GOSTAYA", "Hotelspezifische Anbindung", "PMS / externer Service"],
    moduleNotes: ["Inhalte und Regeln werden vom Hotel definiert.", "Gemessener Umsatz und geschätzte Einsparungen bleiben getrennt.", "Konkrete Integrationen werden für jedes Hotel abgestimmt."],
  },
} as const;

export function HeroJourney({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return <div className="gostaya-hero-journey"><span className="gostaya-journey-label">{lang === "bg" ? "ЕДНА ЗАЯВКА. ЯСНА ОТГОВОРНОСТ." : lang === "de" ? "EINE ANFRAGE. KLARE ZUSTÄNDIGKEIT." : "ONE REQUEST. CLEAR OWNERSHIP."}</span>
    <ol>{c.roles.map((role, i) => <li key={role}><span className="gostaya-journey-icon"><MarketingIcon name={["phone", "reception", "chart"][i]} /></span><div><strong>{role}</strong><small>{c.details[i]}</small></div></li>)}</ol>
    <a href="#platform">{lang === "bg" ? "Вижте как работи" : lang === "de" ? "So funktioniert es" : "See how it works"}<span aria-hidden="true">↗</span></a>
  </div>;
}

function RequestJourney({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const [step, setStep] = useState(0);
  return <div className="gostaya-request-example" data-step={step}>
    <div className="gostaya-example-heading"><span>{c.example}</span><span>{c.room}</span></div>
    <h4>{c.title}</h4>
    <ol className="gostaya-request-stages">{["phone", "housekeeping", "chart"].map((icon, i) => <li key={icon} data-active={step >= i}>
      <MarketingIcon name={icon}/><span>{c.roles[i]}</span><span className="gostaya-stage-number">0{i + 1}</span>
    </li>)}</ol>
    <div className="gostaya-request-ticket"><div><span className="gostaya-request-room">{c.room}</span><strong>{c.request}</strong></div><span className="gostaya-status" data-complete={step === 3}>{c.stages[step]}</span></div>
    <div className="gostaya-request-history" aria-live="polite" aria-atomic="true"><p>{c.notes[step]}</p><ol>{[c.sent, c.accepted, c.completed].map((label, i) => <li key={label} data-complete={step > i}><span aria-hidden="true">{step > i ? "✓" : "·"}</span>{label}</li>)}</ol></div>
    <button type="button" className="gostaya-primary-action" onClick={() => setStep((step + 1) % 4)}>{c.actions[step]}</button><small className="gostaya-example-note">{c.demoNote}</small>
  </div>;
}

function Departments({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState(1);
  const action = lang === "bg" ? "Покажи следващия статус" : lang === "de" ? "Nächsten Status anzeigen" : "Show next status";
  return <div className="gostaya-department-example"><div className="gostaya-example-heading"><span>{c.example}</span></div><h4>{c.departmentTitle}</h4>
    <div className="gostaya-department-picker" role="group" aria-label={c.departmentTitle}>{c.departments.map((department, i) => <button key={department} type="button" aria-pressed={selected === i} onClick={() => { setSelected(i); setStatus(1); }}><MarketingIcon name={["reception", "housekeeping", "maintenance", "chart"][i]}/><span>{department}</span></button>)}</div>
    <div className="gostaya-department-content" key={selected} aria-live="polite"><div className="gostaya-example-heading"><strong>{c.departments[selected]}</strong><span>{c.example}</span></div><p>{c.description[selected]}</p>
      {selected < 3 ? <><div className="gostaya-request-ticket"><div><span className="gostaya-request-room">{c.room}</span><strong>{c.tickets[selected]}</strong></div><span className="gostaya-status" data-complete={status === 3}>{c.stages[status]}</span></div><button type="button" className="gostaya-secondary-action" onClick={() => setStatus(status === 3 ? 1 : status + 1)}>{action}</button></> : <div className="gostaya-manager-rows">{c.departments.slice(0,3).map((name,i)=><div key={name}><MarketingIcon name={["reception","housekeeping","maintenance"][i]}/><strong>{name}</strong><span className="gostaya-status">{c.stages[i+1]}</span></div>)}</div>}
    </div><small className="gostaya-example-note">{c.demoNote}</small>
  </div>;
}

export default function ProductExperience({ moduleKey, lang }: { moduleKey: string; lang: Lang }) {
  const c = COPY[lang];
  if (moduleKey === "guest") return <RequestJourney lang={lang}/>;
  if (moduleKey === "staff" || moduleKey === "team") return <Departments lang={lang}/>;
  if (moduleKey === "manager") return <div className="gostaya-manager-example"><ProductModuleExplorer moduleKey="manager" lang={lang} /><div className="gostaya-example-heading"><span>MANAGER INTELLIGENCE</span></div><h4>{c.managerTitle}</h4><div className="gostaya-intelligence-cycle">{c.cycle.map((label,i)=><div key={label} data-approval={i===3}><span>0{i+1}</span><strong>{label}</strong>{i===3 && <MarketingIcon name="team"/>}</div>)}</div><p className="gostaya-example-note">{c.managerNote}</p></div>;
  const key = moduleKey === "training" ? "training" : moduleKey === "revenue" ? "revenue" : "integrations";
  return <ProductModuleExplorer moduleKey={key} lang={lang} />;
}
