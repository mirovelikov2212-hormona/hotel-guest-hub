import ProductWalkthrough from "./ProductWalkthrough";

type Lang = "bg" | "en" | "de";

type Copy = {
  nav: { product: string; evidence: string; platform: string; faq: string; demo: string };
  eyebrow: string;
  heroTitle: string;
  heroText: string;
  heroPrimary: string;
  heroSecondary: string;
  heroNote: string;
  heroChips: string[];
  clarityTitle: string;
  clarityText: string;
  clarityCards: { title: string; text: string }[];
  platformEyebrow: string;
  platformTitle: string;
  platformText: string;
  modules: { title: string; text: string }[];
  evidenceEyebrow: string;
  evidenceTitle: string;
  evidenceText: string;
  metrics: { value: string; label: string; note: string }[];
  evidenceFoot: string;
  aiTitle: string;
  aiText: string;
  aiPoints: string[];
  faqTitle: string;
  faqs: { q: string; a: string }[];
  finalTitle: string;
  finalText: string;
  finalDemo: string;
  finalContact: string;
  footer: string;
};

const COPY: Record<Lang, Copy> = {
  bg: {
    nav: { product: "Продукт", evidence: "Резултати", platform: "Платформа", faq: "FAQ", demo: "Live demo" },
    eyebrow: "AI GUEST EXPERIENCE + HOTEL OPERATIONS",
    heroTitle: "Една платформа между госта, хотелския екип и мениджмънта.",
    heroText: "GOSTAYA е multi-hotel AI guest-experience и operations платформа за дигитално обслужване на гостите, директно routing към отделите, AI concierge, staff operations, обучение, manager intelligence, revenue/ROI и интеграции.",
    heroPrimary: "Виж продукта",
    heroSecondary: "Отвори live demo",
    heroNote: "Работи в браузъра. Без задължителен app download. Hotel-specific логика и човешки контрол върху критичните действия.",
    heroChips: ["Guest Hub", "Staff Operations", "AI Concierge", "Manager Intelligence", "Staff Development", "Revenue & ROI"],
    clarityTitle: "Не е просто хотелски chatbot.",
    clarityText: "GOSTAYA свързва guest experience с реалните операции на хотела. Гостът не получава само отговор — заявката може да стане проследима задача, да стигне до правилния екип и да остави измерима следа за Manager-а.",
    clarityCards: [
      { title: "За госта", text: "Брандиран Guest Hub, информация, venues, AI concierge, услуги, заявки, масажи, surveys и push комуникация." },
      { title: "За екипа", text: "Role-based Staff Hub за Reception, Housekeeping, Maintenance и Manager с routing, статуси, известия и after-hours логика." },
      { title: "За Manager-а", text: "Operational overview, Incident Center, surveys, service recovery, revenue, ROI и AI-assisted management analysis." },
      { title: "За развитието", text: "Hotel Standards → Training → Testing → Verified Results → HR Rules → AI Management Analysis." },
    ],
    platformEyebrow: "ONE OPERATING LAYER",
    platformTitle: "Модулите работят като една система.",
    platformText: "Модулите могат да се активират според нуждите на хотела, но споделят една tenant-scoped operational foundation.",
    modules: [
      { title: "Guest Hub", text: "QR/PWA guest experience, room confirmation, multilingual content and services." },
      { title: "Staff Operations", text: "Department queues, direct routing, working-hours logic, alerts and request lifecycle." },
      { title: "Operational AI", text: "Hotel-grounded AI concierge, safe action bridge, escalation and service recovery boundaries." },
      { title: "Manager Intelligence", text: "Operational signals, KPI, incidents, surveys and management visibility." },
      { title: "Staff Development", text: "Standards, training, assessments, verified results and deterministic HR rules." },
      { title: "Revenue Intelligence", text: "Paid services, immutable price evidence, upsell and ROI/value measurement." },
      { title: "Integration Layer", text: "Provider-neutral PMS and hotel-system contracts with idempotency and audit." },
      { title: "Product Factory", text: "Multi-hotel onboarding, Design Studio, sandbox certification, lifecycle and rollback." },
    ],
    evidenceEyebrow: "REAL PILOT EVIDENCE",
    evidenceTitle: "Реален сезон. Реални interaction data.",
    evidenceText: "Анонимизиран сезонен pilot в български морски хотел. Показваме измерените данни отделно от моделираните operational estimates.",
    metrics: [
      { value: "5 347", label: "Guest Hub opens", note: "измерени събития" },
      { value: "2 448", label: "дедуплицирани info interactions", note: "session + info item" },
      { value: "145", label: "service requests", note: "non-test requests" },
      { value: "56", label: "massage bookings", note: "реални сезонни резервации" },
      { value: "€2 570", label: "charged massage value", note: "54 charged bookings" },
      { value: "24–45 h", label: "estimated admin time avoided", note: "консервативен модел, не измерен stopwatch time" },
    ],
    evidenceFoot: "Идентифицирането на пилотния хотел и публичното използване на името му остават subject to hotel approval. Методологията отделя observed counts от modeled time savings.",
    aiTitle: "AI, който знае границите си.",
    aiText: "GOSTAYA използва AI за разбиране, обобщение и подпомагане на действията, но хотелът остава authority. Системата не трябва да измисля наличност, да потвърждава непроверено действие или да взема автоматични HR решения.",
    aiPoints: ["Hotel-grounded context", "Human approval where required", "No fabricated action success", "Verified evidence for Manager analysis"],
    faqTitle: "Често задавани въпроси",
    faqs: [
      { q: "Какво е GOSTAYA?", a: "Multi-hotel AI guest-experience и operations платформа, която свързва Guest Hub, хотелските отдели, Manager Intelligence, Staff Development, Revenue Intelligence и Integration Layer." },
      { q: "Трябва ли гостът да инсталира приложение?", a: "Не. Guest Hub работи директно в браузъра и може да се добави като PWA shortcut." },
      { q: "Заявките минават ли през рецепция?", a: "Не задължително. GOSTAYA може да route-ва заявките директно към Housekeeping, Maintenance или Reception според хотелските правила и работното време." },
      { q: "Има ли реален продукт, който може да се види?", a: "Да. На тази страница има интерактивен product explorer, а live demo отваря реален demo Guest Hub tenant." },
      { q: "Може ли да се свърже с PMS?", a: "Integration Layer е provider-neutral и е подготвен за PMS actions. Реалният connector се добавя за конкретния PMS и се тества в неговата sandbox/test среда." },
      { q: "Как се измерва ROI?", a: "GOSTAYA разделя директно измерени operational events от deterministic derived metrics и моделирани стойности като saved time. Методологията и допусканията трябва да са видими." },
    ],
    finalTitle: "Покажи ни как работи хотелът ти. GOSTAYA ще се адаптира към него.",
    finalText: "Започни с live demo, после можем да моделираме реалния guest flow, departmental routing и нужните модули за конкретния хотел.",
    finalDemo: "Отвори live demo",
    finalContact: "Заяви разговор",
    footer: "AI guest experience, hotel operations and manager intelligence in one multi-hotel platform.",
  },
  en: {
    nav: { product: "Product", evidence: "Evidence", platform: "Platform", faq: "FAQ", demo: "Live demo" },
    eyebrow: "AI GUEST EXPERIENCE + HOTEL OPERATIONS",
    heroTitle: "One platform between the guest, the hotel team and management.",
    heroText: "GOSTAYA is a multi-hotel AI guest-experience and operations platform for digital guest service, direct department routing, AI concierge, staff operations, training, manager intelligence, revenue/ROI and integrations.",
    heroPrimary: "Explore the product",
    heroSecondary: "Open live demo",
    heroNote: "Browser-first. No mandatory app download. Hotel-specific logic with human control over critical actions.",
    heroChips: ["Guest Hub", "Staff Operations", "AI Concierge", "Manager Intelligence", "Staff Development", "Revenue & ROI"],
    clarityTitle: "Not just another hotel chatbot.",
    clarityText: "GOSTAYA connects guest experience to real hotel operations. A guest does not only receive an answer — an intent can become a traceable task, reach the right team and create measurable evidence for management.",
    clarityCards: [
      { title: "For guests", text: "Branded Guest Hub, hotel information, venues, AI concierge, services, requests, massage booking, surveys and push communication." },
      { title: "For teams", text: "Role-based Staff Hub for Reception, Housekeeping, Maintenance and Manager with routing, statuses, alerts and after-hours logic." },
      { title: "For managers", text: "Operational overview, Incident Center, surveys, service recovery, revenue, ROI and AI-assisted management analysis." },
      { title: "For development", text: "Hotel Standards → Training → Testing → Verified Results → HR Rules → AI Management Analysis." },
    ],
    platformEyebrow: "ONE OPERATING LAYER",
    platformTitle: "The modules operate as one system.",
    platformText: "Hotels can enable modules according to scope, while the modules share the same tenant-scoped operational foundation.",
    modules: [
      { title: "Guest Hub", text: "QR/PWA guest experience, room confirmation, multilingual content and services." },
      { title: "Staff Operations", text: "Department queues, direct routing, working-hours logic, alerts and request lifecycle." },
      { title: "Operational AI", text: "Hotel-grounded AI concierge, safe action bridge, escalation and service recovery boundaries." },
      { title: "Manager Intelligence", text: "Operational signals, KPI, incidents, surveys and management visibility." },
      { title: "Staff Development", text: "Standards, training, assessments, verified results and deterministic HR rules." },
      { title: "Revenue Intelligence", text: "Paid services, immutable price evidence, upsell and ROI/value measurement." },
      { title: "Integration Layer", text: "Provider-neutral PMS and hotel-system contracts with idempotency and audit." },
      { title: "Product Factory", text: "Multi-hotel onboarding, Design Studio, sandbox certification, lifecycle and rollback." },
    ],
    evidenceEyebrow: "REAL PILOT EVIDENCE",
    evidenceTitle: "A real season. Real interaction data.",
    evidenceText: "An anonymized seasonal pilot at a Bulgarian seaside hotel. Measured data is shown separately from modeled operational estimates.",
    metrics: [
      { value: "5,347", label: "Guest Hub opens", note: "measured events" },
      { value: "2,448", label: "deduplicated info interactions", note: "session + info item" },
      { value: "145", label: "service requests", note: "non-test requests" },
      { value: "56", label: "massage bookings", note: "real seasonal bookings" },
      { value: "€2,570", label: "charged massage value", note: "54 charged bookings" },
      { value: "24–45 h", label: "estimated admin time avoided", note: "conservative model, not stopwatch-measured time" },
    ],
    evidenceFoot: "The pilot hotel remains anonymized until the hotel approves public identification. The methodology separates observed counts from modeled time savings.",
    aiTitle: "AI that knows its boundaries.",
    aiText: "GOSTAYA uses AI for understanding, summarization and assisted actions while the hotel remains the authority. The system should not invent availability, confirm an unverified action or make automated HR decisions.",
    aiPoints: ["Hotel-grounded context", "Human approval where required", "No fabricated action success", "Verified evidence for Manager analysis"],
    faqTitle: "Frequently asked questions",
    faqs: [
      { q: "What is GOSTAYA?", a: "A multi-hotel AI guest-experience and operations platform connecting the Guest Hub, hotel departments, Manager Intelligence, Staff Development, Revenue Intelligence and an Integration Layer." },
      { q: "Does the guest need to install an app?", a: "No. The Guest Hub runs directly in the browser and can optionally be added as a PWA shortcut." },
      { q: "Do guest requests always go through reception?", a: "No. GOSTAYA can route requests directly to Housekeeping, Maintenance or Reception according to hotel rules and working hours." },
      { q: "Is there a real product demo?", a: "Yes. This page includes an interactive product explorer and the live demo opens a real GOSTAYA Guest Hub demo tenant." },
      { q: "Can GOSTAYA connect to a PMS?", a: "The Integration Layer is provider-neutral and prepared for PMS actions. A real connector is added and tested for the specific PMS provider." },
      { q: "How is ROI measured?", a: "GOSTAYA separates directly observed operational events, deterministic derived metrics and modeled values such as estimated time saved. Assumptions should remain visible." },
    ],
    finalTitle: "Show us how your hotel works. GOSTAYA adapts to the operation.",
    finalText: "Start with the live demo, then map the real guest flow, departmental routing and modules for your property.",
    finalDemo: "Open live demo",
    finalContact: "Request a conversation",
    footer: "AI guest experience, hotel operations and manager intelligence in one multi-hotel platform.",
  },
  de: {
    nav: { product: "Produkt", evidence: "Ergebnisse", platform: "Plattform", faq: "FAQ", demo: "Live Demo" },
    eyebrow: "AI GUEST EXPERIENCE + HOTEL OPERATIONS",
    heroTitle: "Eine Plattform zwischen Gast, Hotelteam und Management.",
    heroText: "GOSTAYA ist eine Multi-Hotel-Plattform für AI Guest Experience und Hotel Operations: digitaler Gästeservice, direktes Department Routing, AI Concierge, Staff Operations, Training, Manager Intelligence, Revenue/ROI und Integrationen.",
    heroPrimary: "Produkt entdecken",
    heroSecondary: "Live Demo öffnen",
    heroNote: "Browser-first. Kein verpflichtender App-Download. Hotelspezifische Logik mit menschlicher Kontrolle über kritische Aktionen.",
    heroChips: ["Guest Hub", "Staff Operations", "AI Concierge", "Manager Intelligence", "Staff Development", "Revenue & ROI"],
    clarityTitle: "Nicht nur ein weiterer Hotel-Chatbot.",
    clarityText: "GOSTAYA verbindet Guest Experience mit dem realen Hotelbetrieb. Ein Gast erhält nicht nur eine Antwort — ein Anliegen kann zu einer nachvollziehbaren Aufgabe werden, das richtige Team erreichen und messbare Management-Daten erzeugen.",
    clarityCards: [
      { title: "Für Gäste", text: "Gebrandeter Guest Hub, Hotelinformationen, Outlets, AI Concierge, Services, Anfragen, Massagebuchung, Surveys und Push-Kommunikation." },
      { title: "Für Teams", text: "Rollenbasierter Staff Hub für Rezeption, Housekeeping, Technik und Manager mit Routing, Status, Alerts und After-hours-Logik." },
      { title: "Für Manager", text: "Operational Overview, Incident Center, Surveys, Service Recovery, Revenue, ROI und AI-gestützte Management-Analyse." },
      { title: "Für Entwicklung", text: "Hotel Standards → Training → Testing → Verified Results → HR Rules → AI Management Analysis." },
    ],
    platformEyebrow: "ONE OPERATING LAYER",
    platformTitle: "Die Module arbeiten als ein System.",
    platformText: "Hotels aktivieren Module nach Bedarf; alle Module teilen dieselbe tenant-isolierte operative Grundlage.",
    modules: [
      { title: "Guest Hub", text: "QR/PWA Guest Experience, Zimmerbestätigung, mehrsprachige Inhalte und Services." },
      { title: "Staff Operations", text: "Department Queues, Direct Routing, Arbeitszeiten, Alerts und Request Lifecycle." },
      { title: "Operational AI", text: "Hotel-grounded AI Concierge, sichere Actions, Eskalation und Service-Recovery-Grenzen." },
      { title: "Manager Intelligence", text: "Operative Signale, KPI, Incidents, Surveys und Management Visibility." },
      { title: "Staff Development", text: "Standards, Training, Assessments, Verified Results und deterministische HR Rules." },
      { title: "Revenue Intelligence", text: "Paid Services, unveränderliche Preisdaten, Upsell und ROI/Value Measurement." },
      { title: "Integration Layer", text: "Provider-neutrale PMS- und Hotel-System-Contracts mit Idempotency und Audit." },
      { title: "Product Factory", text: "Multi-Hotel Onboarding, Design Studio, Sandbox Certification, Lifecycle und Rollback." },
    ],
    evidenceEyebrow: "REAL PILOT EVIDENCE",
    evidenceTitle: "Eine reale Saison. Reale Interaktionsdaten.",
    evidenceText: "Anonymisierter saisonaler Pilot in einem bulgarischen Küstenhotel. Gemessene Daten werden klar von modellierten Operational Estimates getrennt.",
    metrics: [
      { value: "5.347", label: "Guest Hub Opens", note: "gemessene Events" },
      { value: "2.448", label: "deduplizierte Info-Interaktionen", note: "Session + Info Item" },
      { value: "145", label: "Service Requests", note: "Non-test Requests" },
      { value: "56", label: "Massagebuchungen", note: "reale Saisonbuchungen" },
      { value: "€2.570", label: "berechneter Massagewert", note: "54 charged bookings" },
      { value: "24–45 h", label: "geschätzte vermiedene Admin-Zeit", note: "konservatives Modell, keine Stoppuhrmessung" },
    ],
    evidenceFoot: "Das Pilot-Hotel bleibt anonym, bis die öffentliche Nennung freigegeben ist. Die Methodik trennt observed counts von modeled time savings.",
    aiTitle: "AI, die ihre Grenzen kennt.",
    aiText: "GOSTAYA nutzt AI für Verständnis, Zusammenfassung und unterstützte Aktionen, während das Hotel die Autorität behält. Keine erfundene Verfügbarkeit, kein unbestätigter Action-Erfolg und keine automatischen HR-Entscheidungen.",
    aiPoints: ["Hotel-grounded Context", "Human Approval where required", "No fabricated action success", "Verified evidence for Manager analysis"],
    faqTitle: "Häufige Fragen",
    faqs: [
      { q: "Was ist GOSTAYA?", a: "Eine Multi-Hotel-Plattform für AI Guest Experience und Operations, die Guest Hub, Hotelabteilungen, Manager Intelligence, Staff Development, Revenue Intelligence und Integration Layer verbindet." },
      { q: "Muss der Gast eine App installieren?", a: "Nein. Der Guest Hub läuft direkt im Browser und kann optional als PWA-Shortcut hinzugefügt werden." },
      { q: "Gehen Gästeanfragen immer über die Rezeption?", a: "Nein. GOSTAYA kann Anfragen nach Hotelregeln und Arbeitszeiten direkt an Housekeeping, Technik oder Rezeption routen." },
      { q: "Gibt es ein echtes Produktdemo?", a: "Ja. Diese Seite enthält einen interaktiven Product Explorer; die Live Demo öffnet einen echten GOSTAYA Guest-Hub-Demo-Tenant." },
      { q: "Kann GOSTAYA mit einem PMS verbunden werden?", a: "Der Integration Layer ist provider-neutral. Der reale Connector wird für den konkreten PMS-Anbieter ergänzt und getestet." },
      { q: "Wie wird ROI gemessen?", a: "GOSTAYA trennt direkt gemessene Operational Events, deterministische Kennzahlen und modellierte Werte wie geschätzte Zeiteinsparungen." },
    ],
    finalTitle: "Zeig uns, wie dein Hotel arbeitet. GOSTAYA passt sich dem Betrieb an.",
    finalText: "Starte mit der Live Demo. Danach können Guest Flow, Department Routing und Module für das konkrete Hotel modelliert werden.",
    finalDemo: "Live Demo öffnen",
    finalContact: "Gespräch anfragen",
    footer: "AI Guest Experience, Hotel Operations und Manager Intelligence in einer Multi-Hotel-Plattform.",
  },
};

function languagePath(lang: Lang) {
  return lang === "bg" ? "/bg" : lang === "de" ? "/de" : "/en";
}

function JsonLd({ lang, copy }: { lang: Lang; copy: Copy }) {
  const base = "https://gostaya.com";
  const page = base + languagePath(lang);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": base + "/#organization",
        name: "GOSTAYA",
        url: base,
        description: copy.heroText,
      },
      {
        "@type": "SoftwareApplication",
        "@id": base + "/#software",
        name: "GOSTAYA",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: page,
        description: copy.heroText,
        featureList: copy.modules.map((m) => m.title),
        publisher: { "@id": base + "/#organization" },
      },
      {
        "@type": "WebSite",
        "@id": base + "/#website",
        name: "GOSTAYA",
        url: base,
        publisher: { "@id": base + "/#organization" },
        inLanguage: ["en", "de", "bg"],
      },
      {
        "@type": "FAQPage",
        mainEntity: copy.faqs.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />;
}

export default function MarketingPage({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const paths = { bg: "/bg", en: "/en", de: "/de" };

  return (
    <main className="min-h-screen bg-[#07111a] text-white selection:bg-cyan-300 selection:text-slate-950">
      <JsonLd lang={lang} copy={c} />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07111a]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <a href={languagePath(lang)} className="flex items-center gap-3" aria-label="GOSTAYA home">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-sm font-black tracking-tight text-cyan-200">G</div>
            <div>
              <div className="text-sm font-black tracking-[0.16em]">GOSTAYA</div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">hotel intelligence layer</div>
            </div>
          </a>

          <nav className="hidden items-center gap-5 text-sm text-white/65 lg:flex" aria-label="Main navigation">
            <a href="#product" className="hover:text-white">{c.nav.product}</a>
            <a href="#evidence" className="hover:text-white">{c.nav.evidence}</a>
            <a href="#platform" className="hover:text-white">{c.nav.platform}</a>
            <a href="#faq" className="hover:text-white">{c.nav.faq}</a>
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden rounded-full border border-white/10 bg-white/[0.03] p-1 sm:flex">
              {(Object.keys(paths) as Lang[]).map((key) => (
                <a key={key} href={paths[key]} hrefLang={key} className={"rounded-full px-2.5 py-1 text-[10px] font-bold uppercase " + (key === lang ? "bg-white text-slate-950" : "text-white/50 hover:text-white")}>{key}</a>
              ))}
            </div>
            <a href="/qr/demo?src=website&code=gostaya-nav" target="_blank" rel="noreferrer" className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-cyan-200">{c.nav.demo}</a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,.16),transparent_34%),radial-gradient(circle_at_85%_25%,rgba(139,92,246,.15),transparent_32%),radial-gradient(circle_at_50%_95%,rgba(16,185,129,.1),transparent_38%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pb-28 lg:pt-24">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.26em] text-cyan-300">{c.eyebrow}</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-7xl">{c.heroTitle}</h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">{c.heroText}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#product" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5">{c.heroPrimary}</a>
              <a href="/qr/demo?src=website&code=gostaya-hero" target="_blank" rel="noreferrer" className="rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/[0.09]">{c.heroSecondary}</a>
            </div>
            <p className="mt-4 max-w-2xl text-xs leading-5 text-white/40">{c.heroNote}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              {c.heroChips.map((chip) => <span key={chip} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/65">{chip}</span>)}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-8 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="relative rounded-[34px] border border-white/10 bg-white/[0.045] p-4 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[26px] border border-white/10 bg-[#0a1722] p-5">
                <div className="flex items-center justify-between">
                  <div><div className="text-[10px] font-bold tracking-[0.22em] text-white/30">GOSTAYA / LIVE FLOW</div><div className="mt-1 text-sm font-semibold">Guest → Team → Manager</div></div>
                  <div className="flex gap-1.5">{[0,1,2].map((i)=><span key={i} className="h-2 w-2 rounded-full bg-white/15" />)}</div>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    ["01", "Guest intent", "Extra towels · Room 317", "Guest Hub"],
                    ["02", "Direct routing", "Housekeeping queue", "Operations"],
                    ["03", "Operational action", "Seen → in progress → completed", "Staff Hub"],
                    ["04", "Evidence", "Request lifecycle + KPI", "Manager"],
                  ].map(([n,title,text,tag]) => (
                    <div key={n} className="grid grid-cols-[38px_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/10 text-xs font-black text-cyan-200">{n}</div>
                      <div><div className="text-xs font-bold text-white/50">{title}</div><div className="mt-0.5 text-sm font-semibold text-white">{text}</div></div>
                      <div className="hidden rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-wider text-white/35 sm:block">{tag}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Hotel grounded", "AI"],
                    ["Tenant scoped", "Data"],
                    ["Human controlled", "Actions"],
                  ].map(([v,l]) => <div key={l} className="rounded-xl border border-white/10 bg-black/10 px-3 py-3"><div className="text-xs font-semibold text-white">{v}</div><div className="mt-1 text-[9px] uppercase tracking-widest text-white/30">{l}</div></div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">{c.clarityTitle}</h2>
            <p className="mt-4 text-base leading-7 text-slate-300">{c.clarityText}</p>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {c.clarityCards.map((card, index) => (
              <article key={card.title} className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5">
                <div className="text-[10px] font-black tracking-[0.2em] text-cyan-300/70">0{index+1}</div>
                <h3 className="mt-4 text-lg font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{card.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ProductWalkthrough lang={lang} />

      <section id="evidence" className="border-y border-white/10 bg-[#0a1620]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">{c.evidenceEyebrow}</p>
          <div className="mt-3 grid gap-6 lg:grid-cols-[.85fr_1.15fr] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">{c.evidenceTitle}</h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">{c.evidenceText}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {c.metrics.map((metric) => (
                <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-3xl font-semibold tracking-tight text-white">{metric.value}</div>
                  <div className="mt-2 text-sm font-semibold text-white/85">{metric.label}</div>
                  <div className="mt-1 text-xs leading-5 text-white/35">{metric.note}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 max-w-5xl text-xs leading-5 text-white/35">{c.evidenceFoot}</p>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-300">{c.platformEyebrow}</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">{c.platformTitle}</h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{c.platformText}</p>
        <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {c.modules.map((module) => (
            <article key={module.title} className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5 transition hover:-translate-y-1 hover:bg-white/[0.05]">
              <h3 className="text-base font-semibold">{module.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{module.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-400/10">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_.8fr] lg:items-center lg:py-20">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">{c.aiTitle}</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{c.aiText}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {c.aiPoints.map((point) => <div key={point} className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm font-semibold text-white/85">{point}</div>)}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">{c.faqTitle}</h2>
        <div className="mt-8 divide-y divide-white/10 rounded-[28px] border border-white/10 bg-white/[0.025]">
          {c.faqs.map((item) => (
            <details key={item.q} className="group p-5">
              <summary className="cursor-pointer list-none pr-8 text-base font-semibold marker:hidden">{item.q}<span className="float-right text-white/35 group-open:rotate-45">+</span></summary>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[36px] border border-cyan-300/20 bg-cyan-300/[0.07] p-7 sm:p-10 lg:flex lg:items-end lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">{c.finalTitle}</h2>
            <p className="mt-4 text-base leading-7 text-slate-300">{c.finalText}</p>
          </div>
          <div className="mt-7 flex shrink-0 flex-wrap gap-3 lg:mt-0">
            <a href="/qr/demo?src=website&code=gostaya-footer" target="_blank" rel="noreferrer" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950">{c.finalDemo}</a>
            <a href="mailto:sales@gostaya.com?subject=GOSTAYA%20demo" className="rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white">{c.finalContact}</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-10 text-sm text-white/45 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div><span className="font-black tracking-[0.14em] text-white">GOSTAYA</span><span className="ml-3">{c.footer}</span></div>
          <div className="flex flex-wrap gap-4">
            <a href="/impressum" className="hover:text-white">Impressum</a>
            <a href="/datenschutz" className="hover:text-white">Datenschutz</a>
            <a href="/agb" className="hover:text-white">AGB</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
