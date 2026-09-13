"use client";

import type { ScannerV2CandidateView, ScannerV2DocumentView, ScannerV2FactView } from "./HotelScannerV2Details";

export type ScannerV2ReviewAttribute = {
  attribute: string;
  label: string;
  value: string;
  verificationStatus: string;
  independentSourceCount: number;
  sourceUrls: string[];
};

export type ScannerV2ReviewConflict = {
  attribute: string;
  claims: Array<{ value: string; sourceUrls: string[] }>;
};

export type ScannerV2ReviewCard = {
  id: string;
  domain: string;
  entityType: string;
  name: string;
  status: "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT" | "MISSING";
  sourceUrls: string[];
  attributes: ScannerV2ReviewAttribute[];
  conflicts: ScannerV2ReviewConflict[];
};

export type ScannerV2ReviewSection = {
  domain: string;
  expectedCount: number;
  cardCount: number;
  verifiedCount: number;
  conflictCount: number;
  missingCount: number;
  cards: ScannerV2ReviewCard[];
};

const DOMAIN_LABELS = {
  bg: {
    accommodation: "Настаняване",
    gastronomy: "Ресторанти и барове",
    spa: "SPA / Medical",
    services: "Хотелски услуги",
    experiences: "Преживявания",
    events: "Събития",
    offers: "Оферти",
    policies: "Правила",
    contacts: "Контакти",
  },
  en: {
    accommodation: "Accommodation",
    gastronomy: "Restaurants & bars",
    spa: "SPA / Medical",
    services: "Hotel services",
    experiences: "Experiences",
    events: "Events",
    offers: "Offers",
    policies: "Policies",
    contacts: "Contacts",
  },
} as const;

const ENTITY_LABELS: Record<string, [string, string]> = {
  room_type: ["Тип стая", "Room type"],
  venue: ["Ресторант / бар", "Dining venue"],
  spa_facility: ["SPA зона", "SPA facility"],
  treatment_category: ["Категория процедури", "Treatment category"],
  spa_technology: ["SPA / medical технология", "SPA / medical technology"],
  spa_surface: ["SPA секция", "SPA section"],
  service: ["Хотелска услуга", "Hotel service"],
  experience: ["Преживяване", "Experience"],
  event: ["Събитие", "Event"],
  offer: ["Оферта", "Offer"],
  operational_policy: ["Правило", "Policy"],
  contact: ["Контакт", "Contact"],
};

const ATTRIBUTE_LABELS: Record<string, [string, string]> = {
  size: ["Размер", "Size"], area: ["Площ", "Area"], capacity: ["Капацитет", "Capacity"], occupancy: ["Капацитет", "Occupancy"],
  guests: ["Гости", "Guests"], bed: ["Легло", "Bed"], bed_type: ["Легло", "Bed"], view: ["Гледка", "View"], price: ["Цена", "Price"],
  opening_hours: ["Работно време", "Opening hours"], cuisine: ["Кухня", "Cuisine"], reservation_required: ["Резервация", "Reservation"], reservation: ["Резервация", "Reservation"],
  external_access: ["Достъп за външни гости", "External guest access"], date: ["Дата", "Date"], start_date: ["Начало", "Starts"], end_date: ["Край", "Ends"], validity: ["Валидност", "Validity"],
  phone: ["Телефон", "Phone"], email: ["Имейл", "Email"], address: ["Адрес", "Address"], website: ["Уебсайт", "Website"], social_profile: ["Социален профил", "Social profile"],
  check_in: ["Настаняване", "Check-in"], check_out: ["Освобождаване", "Check-out"], quiet_hours: ["Часове за тишина", "Quiet hours"], pet_policy: ["Домашни любимци", "Pet policy"], pet_fee: ["Такса за домашен любимец", "Pet fee"], smoking_policy: ["Пушене", "Smoking policy"], dress_code: ["Дрескод", "Dress code"],
};

export default function HotelScannerV2ReviewWorkspace({
  sections,
  candidate,
  documents,
  lang,
}: {
  sections?: ScannerV2ReviewSection[];
  candidate?: ScannerV2CandidateView;
  documents?: ScannerV2DocumentView[];
  lang: "bg" | "en";
}) {
  if (!candidate) return null;
  const labels = DOMAIN_LABELS[lang];
  const copy = lang === "bg" ? {
    title: "3. Хотелско съдържание",
    help: "Информацията е подредена като бъдещия Hub: един реален обект = една карта. Всяка карта показва източник и ниво на проверка.",
    noDetails: "Все още няма сигурно извлечени детайли за този обект.",
    sources: "Източници",
    source: "Източник",
    verified: "Потвърдено от няколко източника",
    single: "Един източник",
    conflict: "Има несъответствие",
    missing: "Липсват детайли",
    issuesTitle: "4. Реални проблеми и несъответствия в сайта",
    issuesHelp: "Тук са твърденията, които Scanner-ът счита за противоречиви и които трябва да бъдат проверени от човек. Всяко твърдение сочи към публичния си източник.",
    noIssues: "Не са открити конфликти, изискващи човешко решение.",
    docsTitle: "Документи / PDF",
    docsHelp: "Публичните документи са отделни доказателствени източници и могат да допълват сайта.",
    evidence: "Пълно техническо доказателство",
    evidenceHelp: "Всички нормализирани facts остават достъпни за одит, но не се показват като основен клиентски интерфейс.",
    facts: "факта",
  } : {
    title: "3. Hotel content",
    help: "Information is arranged like the future Hub: one real entity = one card. Every card shows provenance and verification level.",
    noDetails: "No confidently extracted details are available for this entity yet.",
    sources: "Sources",
    source: "Source",
    verified: "Verified by multiple sources",
    single: "Single source",
    conflict: "Conflict detected",
    missing: "Details missing",
    issuesTitle: "4. Real website issues & conflicts",
    issuesHelp: "These claims appear contradictory and require human review. Every claim links back to its public source.",
    noIssues: "No conflicts requiring human review were found.",
    docsTitle: "Documents / PDF",
    docsHelp: "Public documents are separate evidence sources and can supplement the website.",
    evidence: "Full technical evidence",
    evidenceHelp: "All normalized facts remain available for audit, but are not the primary client-facing interface.",
    facts: "facts",
  };

  const factsByCategory = new Map<string, ScannerV2FactView[]>();
  for (const fact of candidate.facts || []) {
    const category = fact.category || "other";
    if (!factsByCategory.has(category)) factsByCategory.set(category, []);
    factsByCategory.get(category)?.push(fact);
  }

  return <div className="space-y-6">
    <section className="v2-panel p-5 sm:p-6">
      <h2 className="v2-section-title text-xl">{copy.title}</h2>
      <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.help}</p>
      <div className="mt-6 space-y-8">
        {(sections || []).map((section) => <div key={section.domain}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">{labels[section.domain as keyof typeof labels] || section.domain}</h3>
              <p className="v2-muted mt-1 text-xs">{section.cardCount}/{section.expectedCount} entities · {section.verifiedCount} verified · {section.conflictCount} conflicts · {section.missingCount} missing details</p>
            </div>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {section.cards.map((card) => <EntityCard key={card.id} card={card} lang={lang} copy={copy} />)}
          </div>
        </div>)}
      </div>
    </section>

    <section className="v2-panel p-5 sm:p-6">
      <h2 className="v2-section-title text-xl">{copy.issuesTitle}</h2>
      <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.issuesHelp}</p>
      <div className="mt-5 space-y-4">
        {(candidate.conflicts || []).map((conflict, index) => <article key={conflict.id || `${conflict.subject}:${conflict.attribute}:${index}`} className="v2-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{conflict.subject || "hotel"}</strong>
            <span className="v2-muted font-mono text-xs">{conflict.attribute || conflict.topicLabel || conflict.topic}</span>
            <span className="v2-pill v2-pill-warn">CONFLICT</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {(conflict.claims || []).map((claim, claimIndex) => <div key={`${claim.value || claim.canonicalValue}:${claimIndex}`} className="v2-card-soft p-3">
              <p className="text-sm leading-6">{claim.value || claim.canonicalValue}</p>
              <SourceLinks urls={claim.sourceUrls || []} label={copy.source} />
            </div>)}
          </div>
        </article>)}
        {!candidate.conflicts?.length ? <div className="v2-card-soft p-4"><span className="v2-pill v2-pill-good">OK</span><p className="v2-muted mt-2 text-sm">{copy.noIssues}</p></div> : null}
      </div>
    </section>

    <section className="v2-panel p-5 sm:p-6">
      <h2 className="v2-section-title text-xl">{copy.docsTitle}</h2>
      <p className="v2-muted mt-1 text-sm">{copy.docsHelp}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(documents || []).map((document) => <article key={document.url} className="v2-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={document.status} />
            <span className="v2-muted text-xs">{document.facts?.length || 0} {copy.facts}</span>
            <span className="v2-muted text-xs">{document.domains?.join(" · ")}</span>
          </div>
          <a href={document.url} target="_blank" rel="noreferrer" className="v2-source-link mt-3 block break-all text-xs">{shortSource(document.url)}</a>
          {document.error ? <p className="mt-2 text-sm" style={{ color: "var(--v2-bad)" }}>{document.error}</p> : null}
        </article>)}
      </div>
    </section>

    <details className="v2-details v2-panel p-5 sm:p-6">
      <summary className="cursor-pointer font-bold">{copy.evidence}</summary>
      <p className="v2-muted mt-2 text-sm">{copy.evidenceHelp}</p>
      <div className="mt-4 space-y-3">
        {[...factsByCategory.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, facts]) => <details key={category} className="v2-details v2-card p-4">
          <summary className="cursor-pointer font-bold">{category} · {facts.length} {copy.facts}</summary>
          <div className="mt-3 space-y-2">
            {facts.map((fact, index) => <div key={`${fact.subject}:${fact.attribute}:${index}`} className="v2-card-soft p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><strong>{fact.subject || "hotel"}</strong><span className="v2-muted font-mono text-[11px]">{fact.attribute || fact.label}</span></div>
              <p className="mt-2 leading-6">{fact.value}</p>
              <SourceLinks urls={fact.sourceUrls || []} label={copy.sources} />
            </div>)}
          </div>
        </details>)}
      </div>
    </details>
  </div>;
}

function EntityCard({ card, lang, copy }: { card: ScannerV2ReviewCard; lang: "bg" | "en"; copy: Record<string, string> }) {
  const statusLabel = card.status === "VERIFIED" ? copy.verified : card.status === "SINGLE_SOURCE" ? copy.single : card.status === "CONFLICT" ? copy.conflict : copy.missing;
  return <article className="v2-card flex min-h-52 flex-col p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-base font-bold leading-6">{card.name}</h4><span className="v2-muted mt-1 block text-xs">{entityTypeLabel(card.entityType, lang)}</span></div>
      <StatusPill value={statusLabel} warning={card.status === "CONFLICT"} good={card.status === "VERIFIED"} />
    </div>
    {card.attributes.length ? <dl className="mt-4 space-y-2">
      {card.attributes.slice(0, 7).map((attribute, index) => <div key={`${attribute.attribute}:${attribute.value}:${index}`} className="grid grid-cols-[minmax(90px,0.8fr)_1.5fr] gap-3 border-t pt-2" style={{ borderColor: "var(--v2-line)" }}>
        <dt className="v2-muted text-xs font-semibold">{attributeLabel(attribute.attribute, attribute.label, lang)}</dt>
        <dd className="text-sm leading-5">{attribute.value}</dd>
      </div>)}
    </dl> : <p className="v2-muted mt-4 text-sm">{copy.noDetails}</p>}
    {card.conflicts.length ? <div className="v2-help mt-4" style={{ borderColor: "var(--v2-warn)" }}><strong>{copy.conflict}</strong><p className="v2-muted mt-1 text-xs">{card.conflicts.map((conflict) => conflict.attribute).join(" · ")}</p></div> : null}
    <div className="mt-auto pt-4"><SourceLinks urls={card.sourceUrls} label={copy.sources} /></div>
  </article>;
}

function entityTypeLabel(value: string, lang: "bg" | "en") {
  const label = ENTITY_LABELS[value];
  return label ? label[lang === "bg" ? 0 : 1] : value;
}

function attributeLabel(attribute: string, fallback: string, lang: "bg" | "en") {
  const label = ATTRIBUTE_LABELS[attribute];
  return label ? label[lang === "bg" ? 0 : 1] : fallback || attribute;
}

function StatusPill({ value, warning = false, good = false }: { value: string; warning?: boolean; good?: boolean }) {
  const upper = String(value || "").toUpperCase();
  const cls = warning || upper.includes("CONFLICT") ? "v2-pill-warn" : good || upper.includes("VERIFIED") || upper.includes("INGESTED") ? "v2-pill-good" : "v2-pill-info";
  return <span className={`v2-pill ${cls}`}>{value}</span>;
}

function shortSource(rawUrl: string) {
  try { const url = new URL(rawUrl); return `${url.hostname}${url.pathname}`; } catch { return rawUrl; }
}

function SourceLinks({ urls, label }: { urls: string[]; label: string }) {
  const unique = [...new Set((urls || []).filter(Boolean))].slice(0, 4);
  if (!unique.length) return null;
  return <div className="mt-3"><p className="v2-muted text-[10px] font-bold uppercase tracking-wide">{label}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{unique.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="v2-source-link text-xs">{url.toLowerCase().includes(".pdf") ? "PDF · " : "Web · "}{shortSource(url)}</a>)}</div></div>;
}
