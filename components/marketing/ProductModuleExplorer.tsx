"use client";

import { useState } from "react";
import MarketingIcon from "./MarketingIcon";
import "./product-module-explorer.css";

type Lang = "bg" | "en" | "de";
type ModuleKey = "manager" | "training" | "revenue" | "integrations";
type Example = { icon: string; title: string; detail: string; rows: Array<[string, string]> };

// Public illustrations only. Operational actions are performed in the session-scoped live demo.
const EXAMPLES: Record<Lang, Record<ModuleKey, Example[]>> = {
  bg: {
    manager: [
      { icon: "chart", title: "Оперативен преглед", detail: "Един поглед към задачите на всички отдели.", rows: [["Рецепция", "2 нови"], ["Хаускипинг", "1 в процес"], ["Технически отдел", "1 приключена"]] },
      { icon: "chat", title: "Анкети и качество", detail: "Оценката на госта остава свързана с неговата стая и сигнал.", rows: [["Стая 901", "2 / 5"], ["Сигнал", "Климатик"], ["Действие", "Към техническия отдел"]] },
      { icon: "sparkle", title: "Анализ и действие", detail: "Мениджърът одобрява предложението и проследява резултата.", rows: [["Наблюдение", "Натоварване на рецепцията"], ["Препоръка", "Директно насочване"], ["Контрол", "Одобрение от мениджъра"]] },
    ],
    training: [
      { icon: "info", title: "Стандарти", detail: "Хотелът задава собственото си съдържание и правила.", rows: [["Информация", "Само за хотела"], ["Стандарти на отдела", "Добавени от хотела"], ["Достъп", "Според ролята"]] },
      { icon: "training", title: "Обучения", detail: "Материалите следват работата на съответния отдел.", rows: [["Отдел", "Хаускипинг"], ["Материал", "Стандарт за подготовка на стая"], ["Автор", "Мениджър / HR"]] },
      { icon: "chart", title: "Проверими резултати", detail: "Резултатите се свързват с преминатите обучения.", rows: [["Тест", "Ситуации от работата"], ["Отговор", "Един опит на въпрос"], ["Мениджър", "Преглед на напредъка"]] },
    ],
    revenue: [
      { icon: "massage", title: "Резервация", detail: "Гостът избира услуга, дата и час от телефона си.", rows: [["Услуга", "Релакс масаж"], ["Потвърждение", "Две стъпки"], ["Панели", "Рецепция и мениджър"]] },
      { icon: "euro", title: "Начисления", detail: "Персоналът записва реалния финансов резултат.", rows: [["Начислено", "Влиза в приходите"], ["Без начисляване", "Отделен статус"], ["Отказано", "Отделен статус"]] },
      { icon: "chart", title: "Приходи и стойност", detail: "Измерените приходи и оценените спестявания са отделени.", rows: [["Приходи", "Действително начислени услуги"], ["Спестено време", "Оценка с видими допускания"], ["Отчет", "Проследими източници"]] },
    ],
    integrations: [
      { icon: "settings", title: "Хотелски правила", detail: "Работни часове, услуги и маршрути се настройват за всеки хотел.", rows: [["Хаускипинг", "Пример: 08:00–17:00"], ["След смяната", "Поема рецепцията"], ["Следваща смяна", "Връщане към отдела"]] },
      { icon: "link", title: "Външни системи", detail: "Наличието на конфигурация и работеща връзка са различни състояния.", rows: [["Конфигурирано", "Данните са зададени"], ["Проверено", "Връзката е потвърдена"], ["Неактивно", "Няма активна връзка"]] },
      { icon: "business", title: "Контрол", detail: "Достъпът и действията следват разрешенията на хотела.", rows: [["Роля", "Определя достъпа"], ["Действие", "Изисква разрешение"], ["История", "Запис на резултата"]] },
    ],
  },
  en: {
    manager: [
      { icon: "chart", title: "Operations", detail: "See tasks across all departments.", rows: [["Reception", "2 new"], ["Housekeeping", "1 in progress"], ["Maintenance", "1 completed"]] },
      { icon: "chat", title: "Surveys & quality", detail: "Feedback stays connected to the guest’s room and issue.", rows: [["Room 901", "2 / 5"], ["Issue", "Air conditioning"], ["Action", "To Maintenance"]] },
      { icon: "sparkle", title: "Analysis & action", detail: "The manager approves a recommendation and tracks its impact.", rows: [["Observation", "Reception workload"], ["Recommendation", "Direct routing"], ["Control", "Manager approval"]] },
    ],
    training: [
      { icon: "info", title: "Standards", detail: "The hotel defines its own content and rules.", rows: [["Information", "About this hotel"], ["Department standards", "Added by the hotel"], ["Access", "Based on role"]] },
      { icon: "training", title: "Training", detail: "Materials reflect each department’s work.", rows: [["Department", "Housekeeping"], ["Material", "Room preparation standard"], ["Author", "Manager / HR"]] },
      { icon: "chart", title: "Verified results", detail: "Results stay linked to completed training.", rows: [["Test", "Workplace scenarios"], ["Answer", "One attempt per question"], ["Manager", "Progress review"]] },
    ],
    revenue: [
      { icon: "massage", title: "Booking", detail: "The guest selects a service, date and time.", rows: [["Service", "Relaxation massage"], ["Confirmation", "Two steps"], ["Panels", "Reception and Manager"]] },
      { icon: "euro", title: "Billing", detail: "Staff record the actual financial outcome.", rows: [["Charged", "Included in revenue"], ["No charge", "Separate status"], ["Cancelled", "Separate status"]] },
      { icon: "chart", title: "Revenue & value", detail: "Measured revenue and estimated savings are separate.", rows: [["Revenue", "Actually charged services"], ["Time saved", "Estimate with assumptions"], ["Report", "Traceable sources"]] },
    ],
    integrations: [
      { icon: "settings", title: "Hotel rules", detail: "Hours, services and routes are configured per hotel.", rows: [["Housekeeping", "Example: 08:00–17:00"], ["After shift", "Reception covers"], ["Next shift", "Returns to department"]] },
      { icon: "link", title: "External systems", detail: "Configuration and a verified connection are different states.", rows: [["Configured", "Settings are provided"], ["Verified", "Connection confirmed"], ["Inactive", "No active connection"]] },
      { icon: "business", title: "Control", detail: "Access and actions follow hotel permissions.", rows: [["Role", "Determines access"], ["Action", "Requires permission"], ["History", "Outcome recorded"]] },
    ],
  },
  de: {
    manager: [
      { icon: "chart", title: "Betriebsübersicht", detail: "Aufgaben aller Abteilungen im Blick.", rows: [["Rezeption", "2 neu"], ["Housekeeping", "1 in Bearbeitung"], ["Technik", "1 erledigt"]] },
      { icon: "chat", title: "Umfragen & Qualität", detail: "Feedback bleibt mit Zimmer und Problem verbunden.", rows: [["Zimmer 901", "2 / 5"], ["Problem", "Klimaanlage"], ["Aktion", "An die Technik"]] },
      { icon: "sparkle", title: "Analyse & Aktion", detail: "Das Management genehmigt Empfehlungen und verfolgt ihre Wirkung.", rows: [["Beobachtung", "Auslastung der Rezeption"], ["Empfehlung", "Direkte Weiterleitung"], ["Kontrolle", "Manager-Freigabe"]] },
    ],
    training: [
      { icon: "info", title: "Standards", detail: "Das Hotel definiert eigene Inhalte und Regeln.", rows: [["Information", "Nur über dieses Hotel"], ["Abteilungsstandards", "Vom Hotel ergänzt"], ["Zugriff", "Nach Rolle"]] },
      { icon: "training", title: "Schulungen", detail: "Materialien passen zur Arbeit der jeweiligen Abteilung.", rows: [["Abteilung", "Housekeeping"], ["Material", "Standard zur Zimmervorbereitung"], ["Autor", "Manager / HR"]] },
      { icon: "chart", title: "Überprüfbare Ergebnisse", detail: "Ergebnisse sind mit absolvierten Schulungen verbunden.", rows: [["Test", "Arbeitssituationen"], ["Antwort", "Ein Versuch pro Frage"], ["Manager", "Fortschrittsübersicht"]] },
    ],
    revenue: [
      { icon: "massage", title: "Reservierung", detail: "Der Gast wählt Service, Datum und Uhrzeit.", rows: [["Service", "Entspannungsmassage"], ["Bestätigung", "Zwei Schritte"], ["Bereiche", "Rezeption und Manager"]] },
      { icon: "euro", title: "Abrechnung", detail: "Mitarbeiter erfassen das tatsächliche finanzielle Ergebnis.", rows: [["Berechnet", "Im Umsatz enthalten"], ["Ohne Berechnung", "Separater Status"], ["Storniert", "Separater Status"]] },
      { icon: "chart", title: "Umsatz & Wert", detail: "Gemessener Umsatz und geschätzte Einsparungen bleiben getrennt.", rows: [["Umsatz", "Tatsächlich berechnete Services"], ["Zeitersparnis", "Schätzung mit Annahmen"], ["Bericht", "Nachvollziehbare Quellen"]] },
    ],
    integrations: [
      { icon: "settings", title: "Hotelregeln", detail: "Zeiten, Services und Routen werden pro Hotel festgelegt.", rows: [["Housekeeping", "Beispiel: 08:00–17:00"], ["Nach Dienstende", "Rezeption übernimmt"], ["Nächster Dienst", "Zurück an die Abteilung"]] },
      { icon: "link", title: "Externe Systeme", detail: "Konfiguration und überprüfte Verbindung sind unterschiedliche Zustände.", rows: [["Konfiguriert", "Einstellungen hinterlegt"], ["Überprüft", "Verbindung bestätigt"], ["Inaktiv", "Keine aktive Verbindung"]] },
      { icon: "business", title: "Kontrolle", detail: "Zugriff und Aktionen folgen den Hotelberechtigungen.", rows: [["Rolle", "Bestimmt den Zugriff"], ["Aktion", "Benötigt Berechtigung"], ["Historie", "Ergebnis erfasst"]] },
    ],
  },
};

export default function ProductModuleExplorer({ moduleKey, lang }: { moduleKey: ModuleKey; lang: Lang }) {
  const [selected, setSelected] = useState(0);
  const examples = EXAMPLES[lang][moduleKey];
  const current = examples[selected];
  return <div className="gostaya-inner-explorer">
    <nav aria-label={lang === "bg" ? "Разгледайте функциите" : lang === "de" ? "Funktionen erkunden" : "Explore features"}>
      {examples.map((example, index) => <button key={example.title} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>
        <MarketingIcon name={example.icon} /><span>{example.title}</span>
      </button>)}
    </nav>
    <section key={current.title} className="gostaya-inner-preview" aria-live="polite">
      <div className="gostaya-example-heading"><MarketingIcon name={current.icon} /><span>{lang === "bg" ? "Примерен преглед" : lang === "de" ? "Beispielansicht" : "Illustrative view"}</span></div>
      <h4>{current.title}</h4><p>{current.detail}</p>
      <dl>{current.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
  </div>;
}
