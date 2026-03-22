import type {
  StaffDepartment,
  StaffRequestStatus,
  StaffServiceTime,
} from "@/lib/staff/types";
import type { StaffUiLang } from "@/components/staff/StaffUiProvider";

const copy = {
  bg: {
    guestHub: "GuestHub",
    staffHub: "Служебен център",
    simpleOperationalView: "Изчистен оперативен изглед за хотелския екип",
    department: "Отдел",
    housekeeping: "Камериерки",
    maintenance: "Техническа поддръжка",
    reception: "Рецепция",
    restaurant: "Ресторант",
    managerDashboard: "Мениджърски контролен панел",
    staffHubModules: "Модули за служители",
    staffHubIntro:
      "Това е вътрешната част на GuestHub за служители. Интерфейсът е умишлено изчистен: ясни списъци със задачи, четими карти и бързи действия.",
    housekeepingDesc:
      "Общи заявки от гости като хавлии, тоалетна хартия, възглавници, одеяла, ютия и минибар.",
    maintenanceDesc:
      "Технически проблеми като климатик, топла вода, осветление и други неизправности.",
    receptionDesc:
      "Наблюдение на всички заявки по отдели, плюс обработка на заявките за рецепция.",
    managerDesc:
      "Пълен оперативен преглед по отдели, статуси и натоварване.",
    departmentBadge: "Отдел",
    controlBadge: "Контрол",
    managementBadge: "Управление",
    openArrow: "Отвори →",
    confirmedProductDecisions: "Потвърдени продуктови решения",
    confirmedDecision1:
      "Заявките от гости включват само допълнителни услуги и по избор заявки, не стандартно почистване на стая.",
    confirmedDecision2:
      "Задължителни хотелски операции като room cleaning не са част от guest request потока.",
    confirmedDecision3:
      "Рецепцията следи всички заявки, а отделите работят по своите собствени заявки.",
    confirmedDecision4: "Потокът за служители е максимално прост: Старт, Завършено, Върни.",
    sharedHousekeepingBoard: "Общ board за камериерки",
    unlockSupervisorActions: "Отключи действията на супервайзъра",
    lockSupervisorMode: "Заключи супервайзър режим",
    supervisorPinRequired: "Нужен е PIN на супервайзъра за промяна на housekeeping заявки.",
    incorrectPin: "Грешен PIN.",
    housekeepingIntro:
      "Общ supervisory board само за допълнителни guest заявки. Няма стандартен workflow за room cleaning тук.",
    maintenanceIntro:
      "Само технически guest проблеми. Ясен номер на стая, ясен проблем и бързи статус действия.",
    receptionIntro:
      "Оперативен контролен изглед. Рецепцията изпълнява само своите заявки и следи останалите отдели в режим само за преглед.",
    managerIntro:
      "Пълен оперативен преглед за всички отдели. Фокус върху активното натоварване, върнатите заявки и най-старите нерешени задачи.",
    controlCenterMonitoring: "Контролен център + наблюдение",
    technicalQueue: "Активна техническа опашка",
    allDepartmentsOverview: "Пълен преглед на всички отдели",
    total: "Общо",
    active: "Активни",
    new: "Нови",
    inProgress: "В процес",
    completed: "Приключени",
    returned: "Върнати",
    receptionOpen: "Отворени за рецепция",
    otherDepartmentsOpen: "Отворени в други отдели",
    activeOnly: "Активни + върнати",
    receptionActions: "Действия на рецепция",
    receptionActionsText: "Тези заявки могат да бъдат обработени директно от рецепция.",
    monitoringOnly: "Само наблюдение",
    monitoringOnlyText:
      "Рецепцията може да следи тези заявки, но изпълнението остава в съответния отдел.",
    noReceptionRequests: "Няма заявки за рецепция по текущия филтър.",
    noMonitoringRequests: "Няма заявки за наблюдение по текущия филтър.",
    oldestActiveRequests: "Най-стари активни заявки",
    oldestActiveRequestsText: "Тези нерешени заявки чакат най-дълго.",
    noActiveRequests: "В момента няма активни заявки.",
    filteredRequestView: "Филтриран изглед на заявките",
    filteredRequestViewText: "Преглед по отдели и статуси за оперативно проследяване.",
    noRequestsForFilter: "Няма заявки по текущия филтър.",
    departmentFilter: "Филтър по отдел",
    statusFilter: "Филтър по статус",
    sort: "Подредба",
    priority: "Приоритет",
    newest: "Най-нови",
    oldest: "Най-стари",
    all: "Всички",
    activeSummaryOnly: "Показват се само активните и върнатите заявки за отдела.",
    allStaffCanMonitor: "Всички камериерки могат да следят новите заявки. Смяна на статус изисква PIN на супервайзъра.",
    room: "Стая",
    requestedAt: "Подадена в",
    serviceTimeNow: "Сега",
    serviceTimeTomorrow: "Утре",
    serviceTimeToday: "Днес",
    managerViewOnly: "Само за преглед от мениджър. Пълна видимост по всички отдели.",
    receptionMonitoringOnly: "Само наблюдение от рецепция. Изпълнението е в съответния отдел.",
    start: "СТАРТ",
    done: "ГОТОВО",
    return: "ВЪРНИ",
    noActionsAvailable: "Няма налични действия",
  },
  en: {
    guestHub: "GuestHub",
    staffHub: "Staff Hub",
    simpleOperationalView: "Simple operational view for hotel staff",
    department: "Department",
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    reception: "Reception",
    restaurant: "Restaurant",
    managerDashboard: "Manager Dashboard",
    staffHubModules: "Staff Hub Modules",
    staffHubIntro:
      "This is the internal GuestHub side for staff. The interface is intentionally simple: clear task lists, readable cards and fast actions.",
    housekeepingDesc:
      "Shared guest supply requests like towels, toilet paper, pillows, blankets, iron and minibar refill.",
    maintenanceDesc:
      "Technical issues such as air conditioning, hot water, lights and other defects.",
    receptionDesc:
      "Monitor all department requests and execute reception-owned requests.",
    managerDesc:
      "Full operational overview across departments, statuses and workload.",
    departmentBadge: "Department",
    controlBadge: "Control",
    managementBadge: "Management",
    openArrow: "Open →",
    confirmedProductDecisions: "Confirmed product decisions",
    confirmedDecision1:
      "Guest requests include only optional services and optional requests, not standard room cleaning.",
    confirmedDecision2:
      "Mandatory hotel operations like room cleaning are not part of the guest request flow.",
    confirmedDecision3:
      "Reception monitors all requests, while departments work on their own tasks.",
    confirmedDecision4: "The staff flow stays simple: Start, Done, Return.",
    sharedHousekeepingBoard: "Shared housekeeping board",
    unlockSupervisorActions: "Unlock supervisor actions",
    lockSupervisorMode: "Lock supervisor mode",
    supervisorPinRequired: "Supervisor PIN required to update housekeeping requests.",
    incorrectPin: "Incorrect PIN.",
    housekeepingIntro:
      "Shared supervisor board for optional guest requests only. No standard room cleaning workflow here.",
    maintenanceIntro:
      "Technical guest issues only. Clear room number, clear problem type and simple status actions.",
    receptionIntro:
      "Operational control view. Reception executes only reception tasks and monitors the other departments in read-only mode.",
    managerIntro:
      "Full operational overview across all departments. Focus on active load, returned requests and the oldest unresolved items.",
    controlCenterMonitoring: "Control center + monitoring",
    technicalQueue: "Active technical queue",
    allDepartmentsOverview: "All departments overview",
    total: "Total",
    active: "Active",
    new: "New",
    inProgress: "In Progress",
    completed: "Completed",
    returned: "Returned",
    receptionOpen: "Reception Open",
    otherDepartmentsOpen: "Other Departments Open",
    activeOnly: "Active + returned",
    receptionActions: "Reception actions",
    receptionActionsText: "These requests can be handled directly by reception.",
    monitoringOnly: "Monitoring only",
    monitoringOnlyText:
      "Reception can monitor these requests, but execution stays inside the assigned department.",
    noReceptionRequests: "No reception requests in the current filter.",
    noMonitoringRequests: "No monitoring requests in the current filter.",
    oldestActiveRequests: "Oldest active requests",
    oldestActiveRequestsText: "These unresolved items have been waiting the longest.",
    noActiveRequests: "No active requests at the moment.",
    filteredRequestView: "Filtered request view",
    filteredRequestViewText: "Cross-department visibility for operational follow-up.",
    noRequestsForFilter: "No requests match the current filter.",
    departmentFilter: "Department filter",
    statusFilter: "Status filter",
    sort: "Sort",
    priority: "Priority",
    newest: "Newest",
    oldest: "Oldest",
    all: "All",
    activeSummaryOnly: "Only active and returned requests are shown for this department.",
    allStaffCanMonitor: "All housekeeping staff can monitor incoming requests. Status changes require supervisor PIN.",
    room: "Room",
    requestedAt: "Requested at",
    serviceTimeNow: "Now",
    serviceTimeTomorrow: "Tomorrow",
    serviceTimeToday: "Today",
    managerViewOnly: "Manager view only. Operational visibility across all departments.",
    receptionMonitoringOnly: "Reception monitoring only. Execution happens inside the assigned department.",
    start: "START",
    done: "DONE",
    return: "RETURN",
    noActionsAvailable: "No actions available",
  },
  de: {
    guestHub: "GuestHub",
    staffHub: "Mitarbeiter-Hub",
    simpleOperationalView: "Einfacher operativer Überblick für das Hotelteam",
    department: "Abteilung",
    housekeeping: "Housekeeping",
    maintenance: "Technik",
    reception: "Rezeption",
    restaurant: "Restaurant",
    managerDashboard: "Manager-Dashboard",
    staffHubModules: "Module für Mitarbeiter",
    staffHubIntro:
      "Dies ist der interne GuestHub-Bereich für Mitarbeiter. Die Oberfläche bleibt bewusst einfach: klare Aufgabenlisten, gut lesbare Karten und schnelle Aktionen.",
    housekeepingDesc:
      "Gemeinsame Gästewünsche wie Handtücher, Toilettenpapier, Kissen, Decken, Bügeleisen und Minibar-Nachfüllung.",
    maintenanceDesc:
      "Technische Probleme wie Klimaanlage, Warmwasser, Beleuchtung und andere Störungen.",
    receptionDesc:
      "Überblick über alle Abteilungsanfragen und Bearbeitung der Rezeptionsanfragen.",
    managerDesc:
      "Voller operativer Überblick über Abteilungen, Status und Auslastung.",
    departmentBadge: "Abteilung",
    controlBadge: "Kontrolle",
    managementBadge: "Management",
    openArrow: "Öffnen →",
    confirmedProductDecisions: "Bestätigte Produktentscheidungen",
    confirmedDecision1:
      "Gästeanfragen umfassen nur optionale Services und optionale Wünsche, nicht die Standard-Zimmerreinigung.",
    confirmedDecision2:
      "Pflichtprozesse wie Zimmerreinigung gehören nicht zum Guest-Request-Flow.",
    confirmedDecision3:
      "Die Rezeption überwacht alle Anfragen, während die Abteilungen ihre eigenen Aufgaben bearbeiten.",
    confirmedDecision4: "Der Mitarbeiterfluss bleibt einfach: Start, Fertig, Zurück.",
    sharedHousekeepingBoard: "Gemeinsames Housekeeping-Board",
    unlockSupervisorActions: "Supervisor-Aktionen entsperren",
    lockSupervisorMode: "Supervisor-Modus sperren",
    supervisorPinRequired: "Supervisor-PIN erforderlich, um Housekeeping-Anfragen zu ändern.",
    incorrectPin: "Falscher PIN.",
    housekeepingIntro:
      "Gemeinsames Supervisor-Board nur für optionale Gästewünsche. Kein Standard-Workflow für Zimmerreinigung.",
    maintenanceIntro:
      "Nur technische Gästethemen. Klare Zimmernummer, klares Problem und einfache Statusaktionen.",
    receptionIntro:
      "Operative Kontrollansicht. Die Rezeption bearbeitet nur eigene Aufgaben und überwacht die anderen Abteilungen im Nur-Lesen-Modus.",
    managerIntro:
      "Voller operativer Überblick über alle Abteilungen. Fokus auf aktive Last, zurückgesendete Anfragen und die ältesten offenen Punkte.",
    controlCenterMonitoring: "Kontrollzentrum + Monitoring",
    technicalQueue: "Aktive technische Warteschlange",
    allDepartmentsOverview: "Überblick über alle Abteilungen",
    total: "Gesamt",
    active: "Aktiv",
    new: "Neu",
    inProgress: "In Bearbeitung",
    completed: "Erledigt",
    returned: "Zurückgegeben",
    receptionOpen: "Offen für Rezeption",
    otherDepartmentsOpen: "Offen in anderen Abteilungen",
    activeOnly: "Aktiv + zurückgegeben",
    receptionActions: "Rezeptionsaktionen",
    receptionActionsText: "Diese Anfragen können direkt von der Rezeption bearbeitet werden.",
    monitoringOnly: "Nur Überwachung",
    monitoringOnlyText:
      "Die Rezeption kann diese Anfragen überwachen, die Ausführung bleibt aber in der zuständigen Abteilung.",
    noReceptionRequests: "Keine Rezeptionsanfragen im aktuellen Filter.",
    noMonitoringRequests: "Keine Monitoring-Anfragen im aktuellen Filter.",
    oldestActiveRequests: "Älteste aktive Anfragen",
    oldestActiveRequestsText: "Diese offenen Anfragen warten bereits am längsten.",
    noActiveRequests: "Im Moment gibt es keine aktiven Anfragen.",
    filteredRequestView: "Gefilterte Anfragenansicht",
    filteredRequestViewText: "Abteilungsübergreifende Sicht für operative Nachverfolgung.",
    noRequestsForFilter: "Keine Anfragen für den aktuellen Filter.",
    departmentFilter: "Abteilungsfilter",
    statusFilter: "Statusfilter",
    sort: "Sortierung",
    priority: "Priorität",
    newest: "Neueste",
    oldest: "Älteste",
    all: "Alle",
    activeSummaryOnly: "Für diese Abteilung werden nur aktive und zurückgegebene Anfragen angezeigt.",
    allStaffCanMonitor: "Alle Housekeeping-Mitarbeiter können neue Anfragen sehen. Statusänderungen benötigen den Supervisor-PIN.",
    room: "Zimmer",
    requestedAt: "Angefragt um",
    serviceTimeNow: "Jetzt",
    serviceTimeTomorrow: "Morgen",
    serviceTimeToday: "Heute",
    managerViewOnly: "Nur Manager-Ansicht. Operative Sicht über alle Abteilungen.",
    receptionMonitoringOnly: "Nur Monitoring durch die Rezeption. Die Ausführung erfolgt in der zuständigen Abteilung.",
    start: "START",
    done: "ERLEDIGT",
    return: "ZURÜCK",
    noActionsAvailable: "Keine Aktionen verfügbar",
  },
} as const;

export function staffText(lang: StaffUiLang) {
  return copy[lang] ?? copy.bg;
}

export function translateStaffStatus(status: StaffRequestStatus, lang: StaffUiLang) {
  const t = staffText(lang);
  switch (status) {
    case "new":
      return t.new;
    case "in_progress":
      return t.inProgress;
    case "completed":
      return t.completed;
    case "returned":
      return t.returned;
  }
}

export function translateStaffServiceTime(
  serviceTime: StaffServiceTime,
  lang: StaffUiLang
) {
  const t = staffText(lang);
  switch (serviceTime) {
    case "today":
      return t.serviceTimeToday;
    case "tomorrow":
      return t.serviceTimeTomorrow;
    default:
      return t.serviceTimeNow;
  }
}

export function translateDepartment(department: StaffDepartment, lang: StaffUiLang) {
  const t = staffText(lang);
  switch (department) {
    case "housekeeping":
      return t.housekeeping;
    case "maintenance":
      return t.maintenance;
    case "reception":
      return t.reception;
    case "restaurant":
      return t.restaurant;
  }
}
