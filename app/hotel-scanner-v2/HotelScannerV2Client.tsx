"use client";

import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import HotelScannerV2Details, {
  type ScannerV2CandidateView,
  type ScannerV2DocumentView,
} from "./HotelScannerV2Details";

type DomainCoverage = {
  domain: string;
  status: string;
  reason: string;
  expected: number | null;
  extracted: number;
  missingItems: Array<{ id: string; nameHint: string; url: string; crawled: boolean }>;
};

type DomainInventory = {
  domain: string;
  expectationState: string;
  expectedCount: number;
  issues: string[];
  evidence: {
    detailCount: number;
    landingExpectedCount: number | null;
    landingIdentifiedCount: number | null;
    observedLandingCounts: number[];
  };
};

type ScanV2Result = {
  ok?: boolean;
  error?: string;
  stage?: string;
  pipelineStatus?: "READY_FOR_APPROVAL" | "INCOMPLETE" | "CONFLICT_REVIEW_REQUIRED";
  source?: { canonicalUrl: string; scannedAt: string };
  discovery?: {
    siteMap: { counts: { resources: number; pages: number; documents: number; crawledPages: number; languageVariantGroups: number } };
    inventory: { domains: DomainInventory[]; counts: { expectedItems: number; pendingDocuments: number; conflictingDomains: number; unknownExpectationDomains: number } };
    crawlPolicy: { robotsApplied: boolean; robotsBlockedUrlCount: number };
    failedPageUrls: string[];
  };
  extraction?: { diagnostics: { model: string; extractedDomainCount: number; factCount: number } };
  documents?: {
    documents?: ScannerV2DocumentView[];
    facts?: unknown[];
    diagnostics: { discoveredDocumentCount: number; ingestedDocumentCount: number; failedDocumentCount: number; skippedDocumentCount: number };
  };
  verification?: {
    verifiedFactCount: number;
    singleSourceFactCount: number;
    conflictFactCount: number;
    conflictGroupCount: number;
    inputFactCount?: number;
    outputFactCount?: number;
    crossDomainConflictCount?: number;
    rejectedSingleDocumentConflictCount?: number;
  };
  completeness?: {
    status: string;
    domains: DomainCoverage[];
    documents: { discovered: number; ingested: number; pending: number; pendingUrls: string[] };
    conflicts: { unresolved: number; inventory: number };
    blockingReasons: string[];
    prerequisitesSatisfied: boolean;
  };
  intelligenceCandidate?: ScannerV2CandidateView;
  validationGate?: { downstreamHandoffAllowed: false; approvalEligible: boolean; blockingReasons: string[] };
  diagnostics?: { discoveryLatencyMs: number; extractionLatencyMs: number; verificationLatencyMs: number; totalLatencyMs: number };
};

const DOMAIN = {
  bg: {
    accommodation: ["Настаняване", "Типове стаи, студиа, апартаменти и суити."],
    gastronomy: ["Ресторанти и барове", "Реалните dining обекти на хотела."],
    spa: ["SPA / Medical", "SPA, wellness и medical surfaces; детайлният каталог се проверява и през PDF."],
    services: ["Хотелски услуги", "Удобства и услуги в самия хотел."],
    experiences: ["Преживявания", "Дестинационни активности, маршрути и забележителности."],
    events: ["Събития", "Събития с дати и валидност."],
    offers: ["Оферти", "Пакети и промоции с период на валидност."],
    policies: ["Правила", "Hotel policies и условия, които влияят на госта."],
    contacts: ["Контакти", "Официални публични контакти на хотела."],
  },
  en: {
    accommodation: ["Accommodation", "Room, studio, apartment and suite types."],
    gastronomy: ["Restaurants & bars", "The hotel's actual dining venues."],
    spa: ["SPA / Medical", "SPA, wellness and medical surfaces; detailed catalogue is also checked in PDFs."],
    services: ["Hotel services", "On-property amenities and services."],
    experiences: ["Experiences", "Destination activities, routes and attractions."],
    events: ["Events", "Events with dates and validity."],
    offers: ["Offers", "Packages and promotions with validity periods."],
    policies: ["Policies", "Guest-facing hotel rules and conditions."],
    contacts: ["Contacts", "Official public hotel contact information."],
  },
} as const;

const COPY = {
  bg: {
    setup: "Ново сканиране",
    setupHelp: "Въведи официалния сайт. Scanner V2 няма да публикува или предава нищо автоматично.",
    url: "Официален хотелски сайт",
    placeholder: "https://hotel-example.com",
    scan: "Сканирай с V2",
    scanning: "Сканиране и проверка…",
    failed: "Сканирането не завърши успешно.",
    overview: "Резюме на сканирането",
    overviewHelp: "Тези показатели показват дали сайтът е обходен и дали резултатът може да продължи към човешки преглед.",
    inventoryTitle: "2. Какво установихме, че съществува",
    inventoryHelp: "Expected се определя от сайта и документите, независимо от extraction-а. Identified показва колко entities имат конкретно име. Extracted показва за колко сме извлекли данни.",
    source: "1. Discovery",
    sourceHelp: "Какво е открито и прочетено от публичния сайт.",
    approval: "5. Approval",
    approvalHelp: "Нищо не стига до Design Studio / Factory, докато липсите и конфликтите не бъдат разрешени и човек не одобри резултата.",
    blocked: "Блокирано",
    eligible: "Готово за човешки approval",
    technical: "Технически детайли",
    blockers: "Какво блокира approval",
    identified: "Identified",
    extracted: "Extracted",
    expected: "Expected",
    missing: "Липсва",
    evidence: "Inventory evidence",
    pages: "Прочетени страници",
    resources: "Открити ресурси",
    documents: "PDF обработка",
    conflicts: "Конфликти",
    canonical: "Canonical URL",
    status: "Статус",
  },
  en: {
    setup: "New scan",
    setupHelp: "Enter the official website. Scanner V2 will not publish or hand anything off automatically.",
    url: "Official hotel website",
    placeholder: "https://hotel-example.com",
    scan: "Scan with V2",
    scanning: "Scanning and verifying…",
    failed: "The scan did not complete successfully.",
    overview: "Scan summary",
    overviewHelp: "These indicators show whether the website was covered and whether the result can proceed to human review.",
    inventoryTitle: "2. What the website says exists",
    inventoryHelp: "Expected is established from the website and documents independently from extraction. Identified is the number of named entities. Extracted is how many have usable extracted data.",
    source: "1. Discovery",
    sourceHelp: "What was discovered and read from the public website.",
    approval: "5. Approval",
    approvalHelp: "Nothing reaches Design Studio / Factory until gaps and conflicts are resolved and a human approves the result.",
    blocked: "Blocked",
    eligible: "Ready for human approval",
    technical: "Technical details",
    blockers: "What blocks approval",
    identified: "Identified",
    extracted: "Extracted",
    expected: "Expected",
    missing: "Missing",
    evidence: "Inventory evidence",
    pages: "Crawled pages",
    resources: "Discovered resources",
    documents: "PDF ingestion",
    conflicts: "Conflicts",
    canonical: "Canonical URL",
    status: "Status",
  },
} as const;

function humanIssue(issue: string, lang: ControlPlaneLang) {
  const labels: Record<string, [string, string]> = {
    landing_inventory_count_conflict: ["Различни надеждни източници дават различна бройка.", "Reliable sources disagree on the expected count."],
    landing_entities_partially_identified: ["Сайтът заявява повече обекти, отколкото сме идентифицирали по име.", "The site states more entities than we have identified by name."],
    detail_inventory_exceeds_landing_count: ["Detail страниците са повече от заявената бройка на landing page.", "Detail pages exceed the count stated by the landing page."],
  };
  return labels[issue]?.[lang === "bg" ? 0 : 1] || issue;
}

export default function HotelScannerV2Client({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const domainCopy = DOMAIN[lang];
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanV2Result | null>(null);

  async function scan() {
    if (!url.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/control-plane/hotel-scanner/scan-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      setResult((await response.json().catch(() => ({}))) as ScanV2Result);
    } catch {
      setResult({ ok: false, error: "network_error" });
    } finally {
      setLoading(false);
    }
  }

  const inventoryByDomain = new Map((result?.discovery?.inventory?.domains || []).map((domain) => [domain.domain, domain]));
  const webFactCount = result?.extraction?.diagnostics.factCount ?? 0;
  const pdfFactCount = result?.documents?.facts?.length ?? 0;
  const verificationInputCount = result?.verification?.inputFactCount ?? webFactCount + pdfFactCount;

  return (
    <div className="space-y-6">
      <section className="v2-panel p-5 sm:p-6">
        <h2 className="v2-section-title text-xl">{copy.setup}</h2>
        <p className="v2-muted mt-1 text-sm">{copy.setupHelp}</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="text-sm font-semibold">{copy.url}
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void scan(); }} placeholder={copy.placeholder} maxLength={2048} className="v2-input mt-2" />
          </label>
          <button type="button" onClick={() => void scan()} disabled={loading || !url.trim()} className="v2-button min-w-48">{loading ? copy.scanning : copy.scan}</button>
        </div>
        {result && !result.ok ? <div className="v2-card mt-4 p-4"><span className="v2-pill v2-pill-bad">ERROR</span><p className="v2-muted mt-2 text-sm">{copy.failed} <span className="font-mono">{result.error || "scanner_v2_failed"}</span></p></div> : null}
      </section>

      {result?.ok ? <>
        <section className="v2-panel p-5 sm:p-6">
          <h2 className="v2-section-title text-xl">{copy.overview}</h2>
          <p className="v2-muted mt-1 text-sm">{copy.overviewHelp}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label={copy.status} value={result.pipelineStatus || "—"} />
            <Metric label={copy.pages} value={String(result.discovery?.siteMap.counts.crawledPages ?? 0)} />
            <Metric label={copy.resources} value={String(result.discovery?.siteMap.counts.resources ?? 0)} />
            <Metric label={copy.expected} value={String(result.discovery?.inventory.counts.expectedItems ?? 0)} />
            <Metric label={copy.documents} value={`${result.completeness?.documents.ingested ?? 0}/${result.completeness?.documents.discovered ?? 0}`} />
            <Metric label={copy.conflicts} value={String(result.completeness?.conflicts.unresolved ?? 0)} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {["Discovery", "Inventory", "Extracted data", "Conflicts & gaps", "Approval"].map((step, index) => <div key={step} className="v2-step"><span className="v2-step-number">{index + 1}</span><div><p className="text-sm font-semibold">{step}</p><p className="v2-muted mt-0.5 text-xs">{index < 4 ? "Evidence review" : "Human decision"}</p></div></div>)}
          </div>
        </section>

        <section className="v2-panel p-5 sm:p-6">
          <h2 className="v2-section-title text-xl">{copy.source}</h2>
          <p className="v2-muted mt-1 text-sm">{copy.sourceHelp}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="v2-card-soft p-4"><p className="v2-muted text-xs uppercase tracking-wide">{copy.canonical}</p><a href={result.source?.canonicalUrl || "#"} target="_blank" rel="noreferrer" className="v2-source-link mt-2 block break-all text-sm font-semibold">{result.source?.canonicalUrl || "—"}</a></div>
            <div className="v2-card-soft p-4"><p className="v2-muted text-xs uppercase tracking-wide">Discovery evidence</p><p className="mt-2 text-sm">{result.discovery?.siteMap.counts.crawledPages ?? 0} pages · {result.discovery?.siteMap.counts.resources ?? 0} resources · {result.discovery?.siteMap.counts.languageVariantGroups ?? 0} language groups</p></div>
          </div>
        </section>

        <section className="v2-panel p-5 sm:p-6">
          <h2 className="v2-section-title text-xl">{copy.inventoryTitle}</h2>
          <p className="v2-muted mt-1 text-sm leading-6">{copy.inventoryHelp}</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {(result.completeness?.domains || []).map((coverage) => {
              const inventory = inventoryByDomain.get(coverage.domain);
              const labels = domainCopy[coverage.domain as keyof typeof domainCopy] || [coverage.domain, ""];
              const identified = inventory?.evidence?.landingIdentifiedCount ?? inventory?.evidence?.detailCount ?? null;
              return <article key={coverage.domain} className="v2-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-bold">{labels[0]}</h3><p className="v2-muted mt-1 text-xs leading-5">{labels[1]}</p></div>
                  <StatusPill value={coverage.status} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <SmallMetric label={copy.expected} value={coverage.expected === null ? "?" : String(coverage.expected)} />
                  <SmallMetric label={copy.identified} value={identified === null ? "—" : String(identified)} />
                  <SmallMetric label={copy.extracted} value={String(coverage.extracted)} />
                </div>
                <div className="v2-help mt-4"><strong>{copy.evidence}:</strong> {inventory?.expectationState || "UNKNOWN"}. {inventory?.evidence?.detailCount ? `${inventory.evidence.detailCount} dedicated detail pages. ` : ""}{inventory?.evidence?.landingExpectedCount ? `Landing page expectation: ${inventory.evidence.landingExpectedCount}.` : ""}</div>
                {(inventory?.issues || []).length ? <ul className="mt-3 space-y-1 text-xs">{inventory?.issues.map((issue) => <li key={issue} className="v2-muted">• {humanIssue(issue, lang)}</li>)}</ul> : null}
                {coverage.missingItems.length ? <div className="mt-3"><p className="text-xs font-bold">{copy.missing}</p><p className="v2-muted mt-1 text-xs leading-5">{coverage.missingItems.slice(0, 8).map((item) => item.nameHint || (lang === "bg" ? "Неидентифициран обект" : "Unidentified entity")).join(" · ")}{coverage.missingItems.length > 8 ? ` · +${coverage.missingItems.length - 8}` : ""}</p></div> : null}
              </article>;
            })}
          </div>
        </section>

        <HotelScannerV2Details candidate={result.intelligenceCandidate} documents={result.documents?.documents} lang={lang} />

        <section className="v2-panel p-5 sm:p-6">
          <h2 className="v2-section-title text-xl">{copy.approval}</h2>
          <p className="v2-muted mt-1 text-sm">{copy.approvalHelp}</p>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <StatusPill value={result.validationGate?.approvalEligible ? copy.eligible : copy.blocked} />
            {(result.validationGate?.blockingReasons || []).length ? <div className="max-w-2xl"><p className="text-sm font-bold">{copy.blockers}</p><ul className="v2-muted mt-2 space-y-1 text-sm">{result.validationGate?.blockingReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></div> : null}
          </div>
        </section>

        <details className="v2-details v2-panel p-5 sm:p-6">
          <summary className="cursor-pointer font-bold">{copy.technical}</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Web facts" value={String(webFactCount)} />
            <Metric label="PDF facts" value={String(pdfFactCount)} />
            <Metric label="Verification input" value={String(verificationInputCount)} />
            <Metric label="Verification output" value={String(result.verification?.outputFactCount ?? 0)} />
            <Metric label="Multi-source verified" value={String(result.verification?.verifiedFactCount ?? 0)} />
            <Metric label="Single-source" value={String(result.verification?.singleSourceFactCount ?? 0)} />
            <Metric label="Rejected same-document conflicts" value={String(result.verification?.rejectedSingleDocumentConflictCount ?? 0)} />
            <Metric label="Total ms" value={String(result.diagnostics?.totalLatencyMs ?? 0)} />
          </div>
          {(result.discovery?.failedPageUrls || []).length ? <p className="v2-muted mt-4 text-xs">Failed page reads: {result.discovery?.failedPageUrls.length}</p> : null}
        </details>
      </> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="v2-card-soft p-4"><p className="v2-muted text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>;
}
function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="v2-card-soft p-3 text-center"><p className="v2-muted text-[10px] uppercase tracking-wide">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}
function StatusPill({ value }: { value: string }) {
  const upper = String(value || "").toUpperCase();
  const cls = (upper.includes("COMPLETE") && !upper.includes("INCOMPLETE")) || upper.includes("READY") ? "v2-pill-good" : upper.includes("CONFLICT") || upper.includes("BLOCK") || upper.includes("INCOMPLETE") ? "v2-pill-warn" : "v2-pill-info";
  return <span className={`v2-pill ${cls}`}>{value || "—"}</span>;
}
