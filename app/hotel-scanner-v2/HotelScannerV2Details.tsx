import type { ReactNode } from "react";

export type ScannerV2ExpectedItemView = {
  id: string;
  domain: string;
  nameHint: string;
  url: string;
  urls: string[];
  basis: string;
  crawled: boolean;
};

export type ScannerV2DomainInventoryView = {
  domain: string;
  expectationState: string;
  expectedCount: number;
  expectedItems: ScannerV2ExpectedItemView[];
  issues: string[];
};

export type ScannerV2FactView = {
  category: string;
  subject?: string;
  attribute?: string;
  label: string;
  value: string;
  confidence: number;
  sourceUrls: string[];
  verification?: {
    status?: string;
    independentSourceCount?: number;
    sourceUrls?: string[];
  };
};

export type ScannerV2ConflictClaimView = {
  category?: string;
  label?: string;
  value?: string;
  canonicalValue?: string;
  sourceUrls?: string[];
};

export type ScannerV2ConflictView = {
  id?: string;
  topic?: string;
  topicLabel?: string;
  subject?: string;
  attribute?: string;
  state?: string;
  claims?: ScannerV2ConflictClaimView[];
  sourceUrls?: string[];
};

export type ScannerV2CandidateView = {
  inventory: {
    domains: ScannerV2DomainInventoryView[];
  };
  facts: ScannerV2FactView[];
  conflicts: ScannerV2ConflictView[];
  validation: {
    status: string;
    downstreamHandoffAllowed: false;
    blockingReasons: string[];
  };
};

export type ScannerV2DocumentView = {
  url: string;
  status: string;
  domains: string[];
  facts?: ScannerV2FactView[];
  byteCount?: number;
  error?: string;
};

const DOMAIN_LABELS = {
  bg: {
    accommodation: "Настаняване",
    dining: "Ресторанти и барове",
    gastronomy: "Ресторанти и барове",
    wellness: "SPA / Medical",
    spa: "SPA / Medical",
    services: "Хотелски услуги",
    amenities: "Хотелски услуги",
    experiences: "Преживявания",
    events: "Събития",
    offers: "Оферти",
    policy: "Правила",
    policies: "Правила",
    contact: "Контакти",
  },
  en: {
    accommodation: "Accommodation",
    dining: "Restaurants & bars",
    gastronomy: "Restaurants & bars",
    wellness: "SPA / Medical",
    spa: "SPA / Medical",
    services: "Hotel services",
    amenities: "Hotel services",
    experiences: "Experiences",
    events: "Events",
    offers: "Offers",
    policy: "Policies",
    policies: "Policies",
    contact: "Contacts",
  },
} as const;

function basisLabel(value: string, lang: "bg" | "en") {
  const labels: Record<string, [string, string]> = {
    deterministic_semantic_block_entity: ["Идентифициран от content block на официалната страница", "Identified from a content block on the official page"],
    deterministic_json_ld_entity: ["Идентифициран от structured data (JSON-LD)", "Identified from structured data (JSON-LD)"],
    deterministic_detail_resource: ["Открита dedicated detail страница", "Dedicated detail page discovered"],
    deterministic_explicit_count_slot: ["Сайтът заявява бройка, но името още не е установено", "The site states a count, but this entity is not yet named"],
    deterministic_logical_surface: ["Официална логическа страница на хотела", "Official logical hotel surface"],
  };
  return labels[value]?.[lang === "bg" ? 0 : 1] || value;
}

export default function HotelScannerV2Details({
  candidate,
  documents,
  lang,
}: {
  candidate?: ScannerV2CandidateView;
  documents?: ScannerV2DocumentView[];
  lang: "bg" | "en";
}) {
  if (!candidate) return null;
  const copy = lang === "bg" ? {
    factsTitle: "3. Извлечени данни",
    factsHelp: "Това са нормализираните факти, извлечени от сайта и документите. Отвори категория, за да видиш стойността и точния източник.",
    conflictsTitle: "4. Конфликти и несъответствия",
    conflictsHelp: "Тук се показват само claims, които изискват човешко решение. Всяка страна сочи към конкретен публичен източник.",
    documentsTitle: "Документи / PDF",
    documentsHelp: "Показва кои публични документи са ingest-нати и към кои domains са отнесени.",
    inventorySources: "Inventory source details",
    inventoryHelp: "Технически provenance за това защо даден entity е включен в Expected inventory.",
    noItems: "Няма записи.",
    source: "Източник",
    sources: "Източници",
    status: "Статус",
    basis: "Защо е включено",
    crawled: "страницата е прочетена",
    discoveredOnly: "само е открита",
    facts: "факта",
    openSource: "Отвори източника",
  } : {
    factsTitle: "3. Extracted data",
    factsHelp: "These are normalized facts extracted from the website and documents. Open a category to inspect each value and its exact source.",
    conflictsTitle: "4. Conflicts & gaps",
    conflictsHelp: "Only claims that require human resolution are shown here. Each side points to a concrete public source.",
    documentsTitle: "Documents / PDF",
    documentsHelp: "Shows which public documents were ingested and which domains they support.",
    inventorySources: "Inventory source details",
    inventoryHelp: "Technical provenance explaining why an entity is included in Expected inventory.",
    noItems: "No records.",
    source: "Source",
    sources: "Sources",
    status: "Status",
    basis: "Why included",
    crawled: "page crawled",
    discoveredOnly: "discovered only",
    facts: "facts",
    openSource: "Open source",
  };

  const factsByCategory = new Map<string, ScannerV2FactView[]>();
  for (const fact of candidate.facts || []) {
    const category = fact.category || "other";
    if (!factsByCategory.has(category)) factsByCategory.set(category, []);
    factsByCategory.get(category)?.push(fact);
  }
  const labels = DOMAIN_LABELS[lang];

  return (
    <div className="space-y-6">
      <section className="v2-panel p-5 sm:p-6">
        <h2 className="v2-section-title text-xl">{copy.factsTitle}</h2>
        <p className="v2-muted mt-1 text-sm leading-6">{copy.factsHelp}</p>
        <div className="mt-5 space-y-3">
          {[...factsByCategory.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([category, facts]) => (
            <ReviewDetails key={category} title={`${labels[category as keyof typeof labels] || category} · ${facts.length} ${copy.facts}`}>
              <div className="space-y-2">
                {facts.map((fact, index) => (
                  <div key={`${category}:${fact.subject || "hotel"}:${fact.attribute || fact.label}:${index}`} className="v2-card-soft p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{fact.subject || "hotel"}</span>
                      <span className="v2-muted font-mono text-[11px]">{fact.attribute || fact.label}</span>
                      {fact.verification?.status ? <Badge value={fact.verification.status} /> : null}
                    </div>
                    <p className="mt-2 leading-6">{fact.value}</p>
                    <SourceUrls urls={fact.sourceUrls} label={copy.sources} openLabel={copy.openSource} />
                  </div>
                ))}
              </div>
            </ReviewDetails>
          ))}
          {!candidate.facts?.length ? <p className="v2-muted text-sm">{copy.noItems}</p> : null}
        </div>
      </section>

      <section className="v2-panel p-5 sm:p-6">
        <h2 className="v2-section-title text-xl">{copy.conflictsTitle}</h2>
        <p className="v2-muted mt-1 text-sm leading-6">{copy.conflictsHelp}</p>
        <div className="mt-5 space-y-3">
          {(candidate.conflicts || []).map((conflict, index) => (
            <div key={conflict.id || `${conflict.subject}:${conflict.attribute}:${index}`} className="v2-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{conflict.subject || "hotel"}</strong>
                <span className="v2-muted font-mono text-xs">{conflict.attribute || conflict.topicLabel || conflict.topic}</span>
                <span className="v2-pill v2-pill-warn">{conflict.state || "CONFLICT"}</span>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {(conflict.claims || []).map((claim, claimIndex) => (
                  <div key={`${claim.canonicalValue || claim.value}:${claimIndex}`} className="v2-card-soft p-3">
                    <p className="text-sm leading-6">{claim.value || claim.canonicalValue}</p>
                    <SourceUrls urls={claim.sourceUrls || []} label={copy.source} openLabel={copy.openSource} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!candidate.conflicts?.length ? <div className="v2-card-soft p-4"><span className="v2-pill v2-pill-good">OK</span><p className="v2-muted mt-2 text-sm">{copy.noItems}</p></div> : null}
        </div>
      </section>

      <section className="v2-panel p-5 sm:p-6">
        <h2 className="v2-section-title text-xl">{copy.documentsTitle}</h2>
        <p className="v2-muted mt-1 text-sm">{copy.documentsHelp}</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {(documents || []).map((document) => (
            <div key={document.url} className="v2-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={document.status} warning={document.status !== "INGESTED"} />
                <span className="v2-muted text-xs">{document.facts?.length || 0} {copy.facts}</span>
                <span className="v2-muted text-xs">{document.domains?.join(" · ")}</span>
              </div>
              <a href={document.url} target="_blank" rel="noreferrer" className="v2-source-link mt-3 block break-all text-xs">{document.url}</a>
              {document.error ? <p className="mt-2 text-sm" style={{ color: "var(--v2-bad)" }}>{document.error}</p> : null}
            </div>
          ))}
          {!documents?.length ? <p className="v2-muted text-sm">{copy.noItems}</p> : null}
        </div>
      </section>

      <details className="v2-details v2-panel p-5 sm:p-6">
        <summary className="cursor-pointer font-bold">{copy.inventorySources}</summary>
        <p className="v2-muted mt-2 text-sm">{copy.inventoryHelp}</p>
        <div className="mt-4 space-y-4">
          {(candidate.inventory?.domains || []).map((domain) => (
            <div key={domain.domain} className="v2-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{labels[domain.domain as keyof typeof labels] || domain.domain}</strong>
                <Badge value={domain.expectationState} warning={domain.expectationState === "CONFLICT"} />
                <span className="v2-muted text-xs">expected: {domain.expectedCount}</span>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {(domain.expectedItems || []).map((item) => (
                  <div key={item.id} className="v2-card-soft p-3">
                    <p className="text-sm font-bold">{item.nameHint || (lang === "bg" ? "Неидентифициран entity" : "Unidentified entity")}</p>
                    <p className="v2-muted mt-1 text-xs">{copy.basis}: {basisLabel(item.basis, lang)} · {item.crawled ? copy.crawled : copy.discoveredOnly}</p>
                    {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="v2-source-link mt-2 block break-all text-xs">{item.url}</a> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function ReviewDetails({ title, children }: { title: string; children: ReactNode }) {
  return <details className="v2-details v2-card p-4"><summary className="cursor-pointer font-bold">{title}</summary><div className="mt-3">{children}</div></details>;
}

function Badge({ value, warning = false }: { value: string; warning?: boolean }) {
  const upper = String(value || "").toUpperCase();
  const cls = warning || upper.includes("CONFLICT") || upper.includes("FAILED") ? "v2-pill-warn" : upper.includes("VERIFIED") || upper.includes("INGESTED") || upper.includes("COMPLETE") ? "v2-pill-good" : "v2-pill-info";
  return <span className={`v2-pill ${cls}`}>{value}</span>;
}

function SourceUrls({ urls, label, openLabel }: { urls: string[]; label: string; openLabel: string }) {
  if (!urls?.length) return null;
  return <div className="mt-3"><p className="v2-muted text-[10px] font-bold uppercase tracking-[0.1em]">{label}</p><div className="mt-1 space-y-1">{urls.slice(0, 6).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="v2-source-link block break-all text-xs" title={openLabel}>{url}</a>)}</div></div>;
}
