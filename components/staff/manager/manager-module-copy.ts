type Lang = "bg" | "en" | "de";
type ModuleId = "messages" | "rooms" | "intelligence" | "training" | "reports" | "massages" | "value" | "configuration" | "requests";

const MODULES: Array<{ id: ModuleId; icon: string; labels: [string, string, string]; descriptions: [string, string, string] }> = [
  { id: "messages", icon: "megaphone", labels: ["Съобщения", "Messages", "Mitteilungen"], descriptions: ["Комуникация с гостите на хотела", "Communication with hotel guests", "Kommunikation mit Hotelgästen"] },
  { id: "rooms", icon: "bed", labels: ["Активност по стаи", "Room activity", "Zimmeraktivität"], descriptions: ["Активност в Guest Hub по стаи", "Guest Hub activity by room", "Guest-Hub-Aktivität pro Zimmer"] },
  { id: "intelligence", icon: "robot", labels: ["Manager Intelligence", "Manager Intelligence", "Manager Intelligence"], descriptions: ["Анализ, препоръки и контролирани действия", "Analysis, recommendations and controlled actions", "Analyse, Empfehlungen und kontrollierte Aktionen"] },
  { id: "training", icon: "graduation_cap", labels: ["Стандарти и обучения", "Standards & training", "Standards & Schulungen"], descriptions: ["Развитие на персонала и проверими резултати", "Staff development and verified results", "Personalentwicklung und überprüfbare Ergebnisse"] },
  { id: "reports", icon: "bar_chart", labels: ["Отчети и анкети", "Reports & surveys", "Berichte & Umfragen"], descriptions: ["Оперативни показатели и обратна връзка", "Operational metrics and guest feedback", "Betriebliche Kennzahlen und Gästefeedback"] },
  { id: "massages", icon: "lotus", labels: ["Масажи", "Massages", "Massagen"], descriptions: ["Резервации, статуси и начисления", "Reservations, statuses and billing", "Reservierungen, Status und Abrechnung"] },
  { id: "value", icon: "chart_increasing", labels: ["Приходи и ROI", "Revenue & ROI", "Umsatz & ROI"], descriptions: ["Измерени приходи и оценена оперативна стойност", "Measured revenue and estimated operational value", "Gemessener Umsatz und geschätzter betrieblicher Wert"] },
  { id: "configuration", icon: "desktop_computer", labels: ["Управление и интеграции", "Settings & integrations", "Verwaltung & Integrationen"], descriptions: ["Съдържание, услуги и статус на връзките", "Content, services and connection status", "Inhalte, Services und Verbindungsstatus"] },
  { id: "requests", icon: "clipboard", labels: ["Заявки и проблеми", "Requests & issues", "Anfragen & Probleme"], descriptions: ["Задачите на отделите и тяхното изпълнение", "Department tasks and their completion", "Aufgaben der Abteilungen und ihre Erledigung"] },
];

export function getManagerModuleCopy(lang: Lang) {
  const index = lang === "bg" ? 0 : lang === "en" ? 1 : 2;
  return MODULES.map((module) => ({ id: module.id, icon: module.icon, label: module.labels[index], description: module.descriptions[index] }));
}
