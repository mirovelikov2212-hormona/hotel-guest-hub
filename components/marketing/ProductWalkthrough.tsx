"use client";
import { GostayaRotatingTabs } from "./GostayaMotion";
import ProductExperience from "./ProductExperience";
import Image from "next/image";




import "./platform-showcase.css";

type Lang = "bg" | "en" | "de";

type PreviewItem = {
  label: string;
  detail: string;
  badge: string;
};

type ProductView = {
  key: string;
  nav: string;
  eyebrow: string;
  title: string;
  text: string;
  points: string[];
  previewEyebrow: string;
  previewTitle: string;
  previewText: string;
  previewItems: PreviewItem[];
};

type ProductCopy = {
  explorerLabel: string;
  flowTitle: string;
  flowText: string;
  live: string;
  safe: string;
  views: ProductView[];
};

const COPY: Record<Lang, ProductCopy> = {
  bg: {
    explorerLabel: "РАЗГЛЕДАЙ ПЛАТФОРМАТА",
    flowTitle: "Разгледайте платформата отвътре",
    flowText:
      "Изберете модул, за да видите неговата роля и основните функции,\nкоито хотелът използва в ежедневната работа.",
    live: "Отвори хъба · PIN 2026",
    safe: "Изолирана тестова среда · без реални хотелски заявки",
    views: [
      {
        key: "guest",
        nav: "Портал за госта",
        eyebrow: "ГОСТЪТ",
        title: "Един QR код. Целият престой.",
        text:
          "Брандиран хотелски портал в браузъра и като приложение на телефона на госта за информация, услуги, AI асистент и директни заявки.",
        points: [
          "Потвърждение на стая",
          "Информация за хотела и обектите",
          "AI асистент",
          "Директни заявки за услуги",
        ],
        previewEyebrow: "ФУНКЦИИ В ПОРТАЛА",
        previewTitle: "Какво вижда и използва гостът",
        previewText:
          "Порталът събира на едно място най-честите действия по време на престоя.",
        previewItems: [
          {
            label: "Начало на престоя",
            detail: "Потвърждение на стая и отключване на персонализирани услуги.",
            badge: "Стая 901",
          },
          {
            label: "Хотелска информация",
            detail: "Обекти, работно време, услуги и полезна информация без търсене по сайта.",
            badge: "24/7 достъп",
          },
          {
            label: "AI асистент",
            detail: "Отговори, основани на проверената информация и правилата на конкретния хотел.",
            badge: "Хотелски знания",
          },
          {
            label: "Дигитални заявки",
            detail: "Заявката стига директно до правилния хотелски отдел.",
            badge: "Проследим статус",
          },
        ],
      },
      {
        key: "staff",
        nav: "Екип",
        eyebrow: "ХОТЕЛСКИ ЕКИП",
        title: "Всяка заявка стига до правилния отдел.",
        text:
          "Рецепция, Хаускипинг и Поддръжка работят в отделни служебни панели според правилата и работното време на хотела.",
        points: [
          "Автоматично разпределяне",
          "Правила извън работно време",
          "Статуси и известия",
          "Изолирана среда за всеки хотел",
        ],
        previewEyebrow: "ФУНКЦИИ ЗА ЕКИПА",
        previewTitle: "Работни панели по отдели",
        previewText:
          "Всеки отдел вижда само задачите и действията, които са част от неговата работа.",
        previewItems: [
          {
            label: "Нови задачи",
            detail: "Заявките се появяват директно в правилния отдел без ръчно препредаване.",
            badge: "Нова заявка",
          },
          {
            label: "Поемане и статус",
            detail: "Екипът приема задачата и актуализира нейния статус до приключване.",
            badge: "В процес",
          },
          {
            label: "Известия",
            detail: "Нови и забавени заявки се отличават ясно за по-бърза реакция.",
            badge: "Сигнал",
          },
          {
            label: "Работа извън график",
            detail: "Правилата на хотела определят кой поема заявката извън работното време.",
            badge: "Автоматично правило",
          },
        ],
      },
      {
        key: "manager",
        nav: "Мениджър",
        eyebrow: "МЕНИДЖЪРСКИ ПАНЕЛ",
        title: "Цялата оперативна картина на хотела на едно място.",
        text:
          "Мениджърът получава информация от всички ключови процеси в хотела – заявки, качество, проблеми, приходи, анкети, персонал и оперативни показатели.",
        points: [
          "Оперативен преглед",
          "Управление на проблеми",
          "Сигнали от анкети",
          "AI анализ и обобщение",
        ],
        previewEyebrow: "ФУНКЦИИ ЗА МЕНИДЖЪРА",
        previewTitle: "От процесите в хотела към управленско решение",
        previewText:
          "Мениджърският панел събира данните от отделите и ги превръща в ясна оперативна картина.",
        previewItems: [
          {
            label: "Текущи операции",
            detail: "Активни заявки, натоварване по отдели и статус на изпълнението.",
            badge: "На живо",
          },
          {
            label: "Качество и проблеми",
            detail: "Сигнали от анкети, проблеми и проследяване на предприетите действия.",
            badge: "Контрол",
          },
          {
            label: "Приходи и възвръщаемост",
            detail: "Платени услуги, допълнителни продажби и оперативна стойност.",
            badge: "ROI",
          },
          {
            label: "Персонал и развитие",
            detail: "Стандарти, обучения, тестове и проверими резултати за екипа.",
            badge: "Развитие",
          },
        ],
      },
      {
        key: "training",
        nav: "Обучение",
        eyebrow: "РАЗВИТИЕ НА ПЕРСОНАЛА",
        title: "Стандарт → обучение → тест → доказан резултат.",
        text:
          "Хотелските стандарти и стандартите на отделите се превръщат в обучения, тестове и проверими резултати за персонала.",
        points: [
          "Хотелски стандарти",
          "Стандарти на отделите",
          "Планове за обучение",
          "Тестове и проверими резултати",
        ],
        previewEyebrow: "ФУНКЦИИ ЗА ОБУЧЕНИЕ",
        previewTitle: "От хотелския стандарт до проверим резултат",
        previewText:
          "Мениджърът и HR могат да поддържат общите стандарти на хотела и отделните правила за работа по отдели.",
        previewItems: [
          {
            label: "Хотелски стандарти",
            detail: "Обща информация, поведение, дисциплина и правила, валидни за целия хотел.",
            badge: "За всички",
          },
          {
            label: "Стандарти на отделите",
            detail: "Конкретни работни правила за Рецепция, Хаускипинг, Поддръжка и други екипи.",
            badge: "По отдели",
          },
          {
            label: "Обучения",
            detail: "Материали и сценарии, изградени върху одобрените стандарти.",
            badge: "Обучение",
          },
          {
            label: "Тестове и резултати",
            detail: "Проверка на знанията и проследяване на доказаните резултати.",
            badge: "Проверимо",
          },
        ],
      },
      {
        key: "revenue",
        nav: "Приходи",
        eyebrow: "ПРИХОДИ И ВЪЗВРЪЩАЕМОСТ",
        title: "От активност към измерима стойност.",
        text:
          "Платените услуги, допълнителните продажби и автоматизираното обслужване се свързват с проверими данни за приходите и оперативната стойност.",
        points: [
          "Платени услуги",
          "Отчет на приходите",
          "Модел за ROI и стойност",
          "Мениджърски отчети",
        ],
        previewEyebrow: "ФУНКЦИИ ЗА ПРИХОДИТЕ",
        previewTitle: "Как GOSTAYA показва създадената стойност",
        previewText:
          "Приходите и оперативните спестявания се разглеждат отделно, за да бъде ясно кое е реално измерено и кое е изчислена оценка.",
        previewItems: [
          {
            label: "Платени услуги",
            detail: "Проследяване на услуги и резервации, които генерират директен приход.",
            badge: "Приход",
          },
          {
            label: "Допълнителни продажби",
            detail: "Възможности за допълнителни услуги по време на престоя.",
            badge: "Upsell",
          },
          {
            label: "Оперативна стойност",
            detail: "Измерване на автоматизираното обслужване и директното насочване към отделите.",
            badge: "Ефективност",
          },
          {
            label: "ROI и отчети",
            detail: "Ясно разделение между наблюдавани данни и моделирани оценки за възвръщаемост.",
            badge: "Мениджмънт",
          },
        ],
      },
      {
        key: "integrations",
        nav: "Интеграции",
        eyebrow: "ИНТЕГРАЦИИ",
        title: "Интеграции с PMS и други хотелски системи.",
        text:
          "GOSTAYA може да работи самостоятелно и при нужда да се свърже с PMS, хотелски софтуер и външни услуги, без да губи контрол върху хотелските процеси.",
        points: [
          "PMS и хотелски системи",
          "Външни доставчици",
          "Контролирани действия",
          "История и одит",
        ],
        previewEyebrow: "ФУНКЦИИ ЗА ИНТЕГРАЦИИ",
        previewTitle: "Една платформа, свързана с хотелската технологична среда",
        previewText:
          "Интеграциите добавят обмен на данни и действия, без да създават втори източник на истина за хотела.",
        previewItems: [
          {
            label: "PMS",
            detail: "Обмен на необходимите данни със системата за управление на хотела.",
            badge: "Интеграция",
          },
          {
            label: "Достъп и хотелски услуги",
            detail: "Възможност за свързване с външни доставчици и хотелски системи.",
            badge: "Външна система",
          },
          {
            label: "Контрол и одобрение",
            detail: "Чувствителните действия могат да изискват изрично човешко потвърждение.",
            badge: "Контрол",
          },
          {
            label: "Проследимост",
            detail: "История на интеграционните действия, грешките и предприетите корекции.",
            badge: "Одит",
          },
        ],
      },
    ],
  },
  en: {
    explorerLabel: "EXPLORE THE PLATFORM",
    flowTitle: "See the platform from the inside",
    flowText:
      "Choose a module to see its role and the main functions used in day-to-day hotel operations.",
    live: "Open live demo · PIN 2026",
    safe: "Demo tenant · no real hotel requests",
    views: [
      {
        key: "guest",
        nav: "Guest Hub",
        eyebrow: "THE GUEST",
        title: "One QR. The whole stay.",
        text:
          "A branded hotel hub in the browser for information, services, AI assistance and direct requests.",
        points: [
          "Room confirmation",
          "Hotel information & venues",
          "AI assistant",
          "Direct service requests",
        ],
        previewEyebrow: "GUEST HUB FUNCTIONS",
        previewTitle: "What the guest can see and use",
        previewText:
          "The hub brings the most common actions during the stay into one place.",
        previewItems: [
          { label: "Stay access", detail: "Room confirmation unlocks stay-specific services.", badge: "Room 901" },
          { label: "Hotel information", detail: "Venues, opening hours, services and useful information.", badge: "24/7 access" },
          { label: "AI assistant", detail: "Answers grounded in verified hotel information and rules.", badge: "Hotel knowledge" },
          { label: "Digital requests", detail: "Requests are sent directly to the right hotel team.", badge: "Tracked status" },
        ],
      },
      {
        key: "staff",
        nav: "Teams",
        eyebrow: "HOTEL TEAMS",
        title: "Every request reaches the right team.",
        text:
          "Reception, Housekeeping and Maintenance use role-based operational panels based on the hotel's rules and working hours.",
        points: [
          "Automatic routing",
          "After-hours rules",
          "Statuses and alerts",
          "Tenant isolation",
        ],
        previewEyebrow: "TEAM FUNCTIONS",
        previewTitle: "Operational panels by department",
        previewText:
          "Each team sees the tasks and actions that belong to its role.",
        previewItems: [
          { label: "New tasks", detail: "Requests appear directly in the correct department.", badge: "New request" },
          { label: "Accept & update", detail: "Teams accept work and update status through completion.", badge: "In progress" },
          { label: "Alerts", detail: "New and delayed requests are surfaced clearly.", badge: "Alert" },
          { label: "After-hours coverage", detail: "Hotel rules decide who owns work outside normal hours.", badge: "Automatic rule" },
        ],
      },
      {
        key: "manager",
        nav: "Manager",
        eyebrow: "MANAGER DASHBOARD",
        title: "The hotel's complete operational picture in one place.",
        text:
          "Managers receive information from the hotel's key processes: requests, quality, incidents, revenue, surveys, staff and operational indicators.",
        points: [
          "Operational overview",
          "Incident management",
          "Survey signals",
          "AI-assisted analysis",
        ],
        previewEyebrow: "MANAGER FUNCTIONS",
        previewTitle: "From hotel processes to management decisions",
        previewText:
          "The manager dashboard brings department data together into a clear operational view.",
        previewItems: [
          { label: "Live operations", detail: "Active requests, department workload and completion status.", badge: "Live" },
          { label: "Quality & incidents", detail: "Survey signals, incidents and follow-up actions.", badge: "Control" },
          { label: "Revenue & ROI", detail: "Paid services, upsell and operational value.", badge: "ROI" },
          { label: "Staff development", detail: "Standards, training, tests and verified results.", badge: "Development" },
        ],
      },
      {
        key: "training",
        nav: "Training",
        eyebrow: "STAFF DEVELOPMENT",
        title: "Standard → training → assessment → verified result.",
        text:
          "Hotel standards and department standards become training, assessments and verified results.",
        points: [
          "Hotel standards",
          "Department standards",
          "Training plans",
          "Assessments & verified results",
        ],
        previewEyebrow: "TRAINING FUNCTIONS",
        previewTitle: "From standards to verified results",
        previewText:
          "Managers and HR can maintain hotel-wide standards and department-specific operating rules.",
        previewItems: [
          { label: "Hotel standards", detail: "Shared conduct, discipline and hotel-wide rules.", badge: "All staff" },
          { label: "Department standards", detail: "Specific procedures for Reception, Housekeeping, Maintenance and other teams.", badge: "By department" },
          { label: "Training", detail: "Learning content and scenarios built from approved standards.", badge: "Learning" },
          { label: "Assessments", detail: "Knowledge checks and verified staff results.", badge: "Verified" },
        ],
      },
      {
        key: "revenue",
        nav: "Revenue",
        eyebrow: "REVENUE & VALUE",
        title: "Turn activity into measurable value.",
        text:
          "Paid services, upsell and automated service connect to auditable revenue and operational value data.",
        points: [
          "Paid services",
          "Revenue reporting",
          "ROI / value model",
          "Management reports",
        ],
        previewEyebrow: "REVENUE FUNCTIONS",
        previewTitle: "How GOSTAYA shows created value",
        previewText:
          "Revenue and operational savings are separated so measured evidence stays distinct from modeled estimates.",
        previewItems: [
          { label: "Paid services", detail: "Track services and bookings that create direct revenue.", badge: "Revenue" },
          { label: "Upsell", detail: "Offer additional services during the guest stay.", badge: "Upsell" },
          { label: "Operational value", detail: "Measure automation and direct department routing.", badge: "Efficiency" },
          { label: "ROI & reports", detail: "Separate observed data from modeled return estimates.", badge: "Management" },
        ],
      },
      {
        key: "integrations",
        nav: "Integrations",
        eyebrow: "INTEGRATIONS",
        title: "Integrations with PMS and other hotel systems.",
        text:
          "GOSTAYA can operate independently and connect to PMS, hotel software and external services when needed, while keeping hotel processes under control.",
        points: [
          "PMS & hotel systems",
          "External providers",
          "Controlled actions",
          "History & audit",
        ],
        previewEyebrow: "INTEGRATION FUNCTIONS",
        previewTitle: "One platform connected to the hotel technology stack",
        previewText:
          "Integrations add data exchange and actions without creating a second operational source of truth.",
        previewItems: [
          { label: "PMS", detail: "Exchange required data with the property management system.", badge: "Integration" },
          { label: "Access & hotel services", detail: "Connect supported external providers and hotel systems.", badge: "External system" },
          { label: "Control & approval", detail: "Sensitive actions can require explicit human approval.", badge: "Control" },
          { label: "Traceability", detail: "Keep a history of integration actions, failures and corrections.", badge: "Audit" },
        ],
      },
    ],
  },
  de: {
    explorerLabel: "PLATTFORM ENTDECKEN",
    flowTitle: "Die Plattform von innen sehen",
    flowText:
      "Wählen Sie ein Modul und sehen Sie dessen Rolle sowie die wichtigsten Funktionen im täglichen Hotelbetrieb.",
    live: "Live-Demo öffnen · PIN 2026",
    safe: "Demo-Tenant · keine echten Hotelanfragen",
    views: [
      {
        key: "guest",
        nav: "Guest Hub",
        eyebrow: "DER GAST",
        title: "Ein QR-Code. Der gesamte Aufenthalt.",
        text:
          "Gebrandeter Hotel-Hub im Browser für Informationen, Services, AI-Assistent und direkte Anfragen.",
        points: ["Zimmerbestätigung", "Hotelinfo & Outlets", "AI-Assistent", "Direkte Serviceanfragen"],
        previewEyebrow: "GUEST-HUB-FUNKTIONEN",
        previewTitle: "Was der Gast sehen und nutzen kann",
        previewText: "Die wichtigsten Aktionen während des Aufenthalts an einem Ort.",
        previewItems: [
          { label: "Aufenthaltszugang", detail: "Zimmerbestätigung schaltet aufenthaltsbezogene Services frei.", badge: "Zimmer 901" },
          { label: "Hotelinformationen", detail: "Outlets, Öffnungszeiten, Services und nützliche Informationen.", badge: "24/7" },
          { label: "AI-Assistent", detail: "Antworten auf Basis verifizierter Hotelinformationen und Regeln.", badge: "Hotelwissen" },
          { label: "Digitale Anfragen", detail: "Anfragen gehen direkt an das zuständige Hotelteam.", badge: "Status" },
        ],
      },
      {
        key: "staff",
        nav: "Teams",
        eyebrow: "HOTELTEAMS",
        title: "Jede Anfrage erreicht das richtige Team.",
        text:
          "Rezeption, Housekeeping und Technik arbeiten in rollenbasierten Ansichten nach Hotelregeln und Arbeitszeiten.",
        points: ["Automatisches Routing", "After-hours-Regeln", "Status & Alerts", "Tenant Isolation"],
        previewEyebrow: "TEAM-FUNKTIONEN",
        previewTitle: "Operative Panels nach Abteilung",
        previewText: "Jedes Team sieht nur die Aufgaben und Aktionen seiner Rolle.",
        previewItems: [
          { label: "Neue Aufgaben", detail: "Anfragen erscheinen direkt in der zuständigen Abteilung.", badge: "Neu" },
          { label: "Übernehmen & Status", detail: "Teams übernehmen Aufgaben und aktualisieren den Status.", badge: "In Arbeit" },
          { label: "Alerts", detail: "Neue und verzögerte Anfragen werden klar hervorgehoben.", badge: "Signal" },
          { label: "After-hours", detail: "Hotelregeln bestimmen die Zuständigkeit außerhalb der Arbeitszeit.", badge: "Regel" },
        ],
      },
      {
        key: "manager",
        nav: "Manager",
        eyebrow: "MANAGER-DASHBOARD",
        title: "Das vollständige operative Bild des Hotels an einem Ort.",
        text:
          "Manager erhalten Informationen aus den wichtigsten Hotelprozessen: Anfragen, Qualität, Probleme, Umsatz, Surveys, Personal und operative Kennzahlen.",
        points: ["Operational Overview", "Incident Management", "Survey-Signale", "AI-gestützte Analyse"],
        previewEyebrow: "MANAGER-FUNKTIONEN",
        previewTitle: "Von Hotelprozessen zu Managemententscheidungen",
        previewText: "Das Manager-Dashboard bündelt Abteilungsdaten zu einer klaren operativen Sicht.",
        previewItems: [
          { label: "Live Operations", detail: "Aktive Anfragen, Abteilungsauslastung und Erledigungsstatus.", badge: "Live" },
          { label: "Qualität & Probleme", detail: "Survey-Signale, Probleme und Follow-up-Aktionen.", badge: "Kontrolle" },
          { label: "Umsatz & ROI", detail: "Paid Services, Upsell und operativer Wert.", badge: "ROI" },
          { label: "Personalentwicklung", detail: "Standards, Trainings, Tests und verifizierte Ergebnisse.", badge: "Entwicklung" },
        ],
      },
      {
        key: "training",
        nav: "Training",
        eyebrow: "PERSONALENTWICKLUNG",
        title: "Standard → Training → Test → verifiziertes Ergebnis.",
        text:
          "Hotelstandards und Abteilungsstandards werden zu Trainings, Tests und verifizierten Ergebnissen.",
        points: ["Hotelstandards", "Abteilungsstandards", "Trainingspläne", "Tests & Ergebnisse"],
        previewEyebrow: "TRAININGSFUNKTIONEN",
        previewTitle: "Vom Standard zum verifizierten Ergebnis",
        previewText: "Manager und HR verwalten hotelweite und abteilungsspezifische Standards.",
        previewItems: [
          { label: "Hotelstandards", detail: "Gemeinsame Regeln, Verhalten und Disziplin.", badge: "Alle" },
          { label: "Abteilungsstandards", detail: "Konkrete Regeln für Rezeption, Housekeeping, Technik und weitere Teams.", badge: "Abteilungen" },
          { label: "Training", detail: "Lerninhalte und Szenarien auf Basis freigegebener Standards.", badge: "Lernen" },
          { label: "Tests & Ergebnisse", detail: "Wissensprüfung und verifizierte Ergebnisse.", badge: "Verifiziert" },
        ],
      },
      {
        key: "revenue",
        nav: "Umsatz",
        eyebrow: "UMSATZ & WERT",
        title: "Aktivität wird zu messbarem Wert.",
        text:
          "Paid Services, Upsell und automatisierter Service werden mit prüfbaren Umsatz- und Betriebsdaten verbunden.",
        points: ["Paid Services", "Umsatzberichte", "ROI / Value Model", "Manager Reports"],
        previewEyebrow: "UMSATZFUNKTIONEN",
        previewTitle: "Wie GOSTAYA den geschaffenen Wert sichtbar macht",
        previewText: "Umsatz und operative Einsparungen bleiben von modellierten Schätzungen getrennt.",
        previewItems: [
          { label: "Paid Services", detail: "Services und Buchungen mit direktem Umsatzbeitrag.", badge: "Umsatz" },
          { label: "Upsell", detail: "Zusätzliche Services während des Aufenthalts.", badge: "Upsell" },
          { label: "Operativer Wert", detail: "Automatisierung und direktes Routing messbar machen.", badge: "Effizienz" },
          { label: "ROI & Reports", detail: "Beobachtete Daten von Modellwerten trennen.", badge: "Management" },
        ],
      },
      {
        key: "integrations",
        nav: "Integrationen",
        eyebrow: "INTEGRATIONEN",
        title: "Integrationen mit PMS und weiteren Hotelsystemen.",
        text:
          "GOSTAYA kann eigenständig arbeiten und bei Bedarf mit PMS, Hotelsoftware und externen Services verbunden werden.",
        points: ["PMS & Hotelsysteme", "Externe Anbieter", "Kontrollierte Aktionen", "Historie & Audit"],
        previewEyebrow: "INTEGRATIONSFUNKTIONEN",
        previewTitle: "Eine Plattform, verbunden mit der Hoteltechnologie",
        previewText: "Integrationen ergänzen Datenaustausch und Aktionen ohne zweite operative Wahrheit.",
        previewItems: [
          { label: "PMS", detail: "Notwendige Daten mit dem Property Management System austauschen.", badge: "Integration" },
          { label: "Zugang & Services", detail: "Unterstützte externe Anbieter und Hotelsysteme anbinden.", badge: "Extern" },
          { label: "Kontrolle & Freigabe", detail: "Sensible Aktionen können eine menschliche Freigabe erfordern.", badge: "Kontrolle" },
          { label: "Nachvollziehbarkeit", detail: "Historie von Aktionen, Fehlern und Korrekturen.", badge: "Audit" },
        ],
      },
    ],
  },
};

function BrandText({ text }: { text: string }) {
  return <>{text.split(/(GOSTAYA)/g).map((part, index) => part === "GOSTAYA" ? <span key={index} className="gostaya-mobile-brand">{part}</span> : part)}</>;
}

export default function ProductWalkthrough({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  const title = lang === "bg" ? "Разгледайте GOSTAYA в действие" : lang === "de" ? "GOSTAYA in Aktion erleben" : "Explore GOSTAYA in action";
  return <section className="gostaya-shell gostaya-section gostaya-platform">
    <p className="gostaya-eyebrow">{copy.explorerLabel}</p><h2>{title}</h2>
    <p className="gostaya-body">{lang === "bg" ? "От първия въпрос на госта до управленското решение. Изберете модул и вижте неговата роля." : lang === "de" ? "Von der ersten Gästefrage bis zur Managemententscheidung. Wählen Sie einen Bereich." : "From the guest’s first question to a management decision. Choose a module to explore."}</p>
    <GostayaRotatingTabs lang={lang} label={title} tabs={copy.views.map(view => ({id:view.key, label:view.nav, content:
      <div className="gostaya-module-panel">
        <div className="gostaya-module-explanation"><p className="gostaya-eyebrow">{view.eyebrow}</p><h3><BrandText text={view.title}/></h3><p className="gostaya-body"><BrandText text={view.text}/></p>
          <ul className="gostaya-module-benefits">{view.previewItems.slice(0,3).map(item=><li key={item.label}><span aria-hidden="true">✓</span>{item.label}</li>)}</ul>
        </div>
        <div className="gostaya-product-experience"><ProductExperience moduleKey={view.key} lang={lang}/></div>
      </div>
    }))}/>
    <div className="gostaya-manager-teaser">
      <div className="gostaya-manager-teaser-copy">
        <p className="gostaya-eyebrow">{lang === "bg" ? "ЕДИН ПАНЕЛ. ЦЕЛИЯТ ХОТЕЛ." : lang === "de" ? "EIN BEREICH. DAS GANZE HOTEL." : "ONE PANEL. THE WHOLE HOTEL."}</p>
        <h3>{lang === "bg" ? "Целият хотел в един мениджърски панел." : lang === "de" ? "Das gesamte Hotel in einem Manager-Bereich." : "The whole hotel in one manager panel."}</h3>
        <p>{lang === "bg" ? "Заявки, съобщения, анкети, масажи и отчети — в един мениджърски панел с ясна оперативна картина." : lang === "de" ? "Anfragen, Mitteilungen, Umfragen, Massagen und Berichte — ein Manager-Bereich mit klarer operativer Übersicht." : "Requests, messages, surveys, massages and reports — one manager panel with a clear operational overview."}</p>
      </div>
      <div className="gostaya-manager-teaser-image"><Image src="/marketing/manager-preview.webp" alt="" fill sizes="(min-width: 700px) 45vw, 100vw" /></div>
    </div>
  </section>;
}
