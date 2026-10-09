"use client";

import Image from "next/image";
import { useState } from "react";
import MarketingIcon from "./MarketingIcon";

type Lang = "bg" | "en" | "de";
const DEPARTMENTS = [
  { role: "reception", icon: "bellhop_bell" },
  { role: "housekeeping", icon: "broom" },
  { role: "maintenance", icon: "hammer_and_wrench" },
  { role: "manager", icon: "bar_chart" },
] as const;
const COPY = {
  bg: {
    names: ["Рецепция", "Хаускипинг", "Технически отдел", "Мениджър"],
    short: ["Комуникация и координация", "Подреден списък със задачи", "Сигнали и отстраняване", "Поглед върху целия хотел"],
    descriptions: ["Гостите, съобщенията и заявките в един оперативен център.", "Екипът получава точната стая, задачата и текущия ѝ статус.", "Всеки технически сигнал има отговорен отдел и проследима история.", "Общ преглед на заявките, качеството, приходите и работата на отделите."],
    tickets: [["Въпрос към рецепция", "Помощ с трансфер", "Късно освобождаване"], ["Допълнителни хавлии", "Почистване на стая", "Смяна на спално бельо"], ["Проверка на климатик", "Осветление в стаята", "Проблем с телевизор"], ["Допълнителни хавлии", "Проверка на климатик", "Въпрос към рецепция"]],
    statuses: ["Нова", "В обработка", "Готова"],
    sample: "Интерактивен пример", queue: "Оперативен преглед", next: "Промени статуса", open: "Отвори панела", room: "Стая",
    flow: ["Гостът изпраща", "GOSTAYA насочва", "Отделът обработва", "Мениджърът следи"],
    note: "Примерните задачи показват работния процес. В отделния панел ще видите текущата демо сесия.",
  },
  en: {
    names: ["Reception", "Housekeeping", "Maintenance", "Manager"],
    short: ["Communication and coordination", "An organised task queue", "Issues and resolution", "A view of the whole hotel"],
    descriptions: ["Guests, messages and requests in one operational centre.", "The team receives the room, task and current status.", "Every technical issue has an assigned department and a clear history.", "An overview of requests, quality, revenue and department activity."],
    tickets: [["Question for reception", "Transfer assistance", "Late checkout"], ["Extra towels", "Room cleaning", "Change bed linen"], ["Check air conditioning", "Room lighting", "TV issue"], ["Extra towels", "Check air conditioning", "Question for reception"]],
    statuses: ["New", "In progress", "Completed"],
    sample: "Interactive example", queue: "Operational overview", next: "Change status", open: "Open panel", room: "Room",
    flow: ["The guest sends", "GOSTAYA routes", "The team handles", "The manager tracks"],
    note: "Example tasks illustrate the workflow. The separate panel shows the current demo session.",
  },
  de: {
    names: ["Rezeption", "Housekeeping", "Technik", "Manager"],
    short: ["Kommunikation und Koordination", "Eine geordnete Aufgabenliste", "Meldungen und Behebung", "Blick auf das gesamte Hotel"],
    descriptions: ["Gäste, Mitteilungen und Anfragen in einer Zentrale.", "Das Team erhält Zimmer, Aufgabe und aktuellen Status.", "Jede technische Meldung hat eine zuständige Abteilung und Historie.", "Überblick über Anfragen, Qualität, Umsatz und die Arbeit der Abteilungen."],
    tickets: [["Frage an die Rezeption", "Hilfe beim Transfer", "Später Check-out"], ["Zusätzliche Handtücher", "Zimmerreinigung", "Bettwäsche wechseln"], ["Klimaanlage prüfen", "Zimmerbeleuchtung", "Problem mit dem TV"], ["Zusätzliche Handtücher", "Klimaanlage prüfen", "Frage an die Rezeption"]],
    statuses: ["Neu", "In Bearbeitung", "Erledigt"],
    sample: "Interaktives Beispiel", queue: "Operativer Überblick", next: "Status ändern", open: "Bereich öffnen", room: "Zimmer",
    flow: ["Der Gast sendet", "GOSTAYA leitet weiter", "Das Team bearbeitet", "Der Manager verfolgt"],
    note: "Beispielaufgaben zeigen den Ablauf. Der separate Bereich zeigt die aktuelle Demo-Sitzung.",
  },
};

/** Marketing simulation only. Operational panels are separate, role-scoped routes. */
export default function DepartmentExplorer({ lang }: { lang: Lang }) {
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState(0);
  const copy = COPY[lang];
  const department = DEPARTMENTS[selected];
  return (
    <div className="gostaya-team-explorer">
      <div className="gostaya-team-layout">
        <nav className="gostaya-team-picker" aria-label={copy.queue}>
          {DEPARTMENTS.map((item, index) => (
            <button key={item.role} className="gostaya-department-card" type="button" aria-pressed={selected === index}
              onClick={() => { setSelected(index); setStatus(0); }}>
              <Image src={`/marketing/manager/emoji/${item.icon}.webp`} alt="" width={54} height={54} unoptimized />
              <strong>{copy.names[index]}</strong><span>{copy.short[index]}</span>
            </button>
          ))}
        </nav>
        <article className="gostaya-team-console" key={department.role} aria-live="polite">
          <header><div><span>{copy.sample}</span><h4>{copy.names[selected]}</h4></div>
            <Image src={`/marketing/manager/emoji/${department.icon}.webp`} alt="" width={58} height={58} unoptimized />
          </header>
          <p>{copy.descriptions[selected]}</p>
          <div className="gostaya-team-tickets">
            {copy.tickets[selected].map((ticket, index) => {
              const ticketStatus = index === 0 ? status : index;
              return <div key={ticket}><span>{copy.room} {901 + index}</span><strong>{ticket}</strong>
                <span className="gostaya-team-status" data-status={ticketStatus}>{copy.statuses[ticketStatus]}</span></div>;
            })}
          </div>
          <footer>
            <button type="button" onClick={() => setStatus((value) => (value + 1) % 3)}>{copy.next} ↻</button>
            <a href={`/demo/panel/${department.role}?lang=${lang}`}>{copy.open} →</a>
          </footer>
        </article>
      </div>
      <ol className="gostaya-team-flow">
        {copy.flow.map((label, index) => <li key={label}>
          <MarketingIcon name={["phone", "settings", "team", "chart"][index]} />
          <span>0{index + 1}</span><strong>{label}</strong>
        </li>)}
      </ol>
      <small className="gostaya-example-note">{copy.note}</small>
    </div>
  );
}
