"use client";

import { useState, type ReactNode } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

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
  evidence: { detailCount: number; landingExpectedCount: number | null; observedLandingCounts: number[] };
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
  };
  completeness?: {
    status: string;
    domains: DomainCoverage[];
    documents: { discovered: number; ingested: number; pending: number; pendingUrls: string[] };
    conflicts: { unresolved: number; inventory: number };
    blockingReasons: string[];
    prerequisitesSatisfied: boolean;
  };
  intelligenceCandidate?: { validation: { status: string; downstreamHandoffAllowed: false; blockingReasons: string[] } };
  validationGate?: { downstreamHandoffAllowed: false; approvalEligible: boolean; blockingReasons: string[] };
  diagnostics?: { discoveryLatencyMs: number; extractionLatencyMs: number; verificationLatencyMs: number; totalLatencyMs: number };
};

const COPY = {
  bg: {
    title: "Production Hotel Scanner V2",
    intro: "Preview-only Hotel Intake Pipeline. Inventory се установява независимо от AI extraction и нищо не се предава към Design Studio / Factory без validation и изрично approval.",
    url: "Хотелски сайт",
    placeholder: "https://hotel-example.com",
    scan: "Сканирай с V2",
    scanning: "Site Map → Inventory → Extraction → PDF → Verification…",
    preview: "PREVIEW ONLY · БЕЗ PRODUCTION HANDOFF",
    failed: "V2 сканирането не завърши успешно.",
    status: "Pipeline статус",
    canonical: "Canonical URL",
    pages: "Crawled pages",
    resources: "Site Map resources",
    expected: "Expected items",
    docs: "PDF документи",
    conflicts: "Конфликти",
    inventory: "Completeness по категории",
    domain: "Категория",
    expectation: "Inventory",
    ratio: "Extracted / Expected",
    result: "Резултат",
    missing: "Липсващи",
    blockers: "Validation blockers",
    diagnostics: "Диагностика",
    approval: "Approval gate",
    eligible: "Готово за човешко approval",
    blocked: "Блокирано",
    noHandoff: "Downstream handoff е изключен. Scanner V2 никога не auto-approve-ва.",
    failedUrls: "Неуспешно прочетени страници",
    pendingDocs: "Необработени PDF-и",
    webFacts: "Web facts",
    pdfFacts: "PDF facts",
    verificationInput: "Verification input",
    verificationOutput: "Verification output",
    verified: "Verified",
    crossDomainConflicts: "Cross-domain conflicts",
  },
  en: {
    title: "Production Hotel Scanner V2",
    intro: "Preview-only Hotel Intake Pipeline. Inventory is established independently from AI extraction and nothing reaches Design Studio / Factory before validation and explicit approval.",
    url: "Hotel website",
    placeholder: "https://hotel-example.com",
    scan: "Scan with V2",
    scanning: "Site Map → Inventory → Extraction → PDF → Verification…",
    preview: "PREVIEW ONLY · NO PRODUCTION HANDOFF",
    failed: "V2 scan did not complete successfully.",
    status: "Pipeline status",
    canonical: "Canonical URL",
    pages: "Crawled pages",
    resources: "Site Map resources",
    expected: "Expected items",
    docs: "PDF documents",
    conflicts: "Conflicts",
    inventory: "Completeness by domain",
    domain: "Domain",
    expectation: "Inventory",
    ratio: "Extracted / Expected",
    result: "Result",
    missing: "Missing",
    blockers: "Validation blockers",
    diagnostics: "Diagnostics",
    approval: "Approval gate",
    eligible: "Ready for human approval",
    blocked: "Blocked",
    noHandoff: "Downstream handoff is disabled. Scanner V2 never auto-approves.",
    failedUrls: "Failed page reads",
    pendingDocs: "Pending PDFs",
    webFacts: "Web facts",
    pdfFacts: "PDF facts",
    verificationInput: "Verification input",
    verificationOutput: "Verification output",
    verified: "Verified",
    crossDomainConflicts: "Cross-domain conflicts",
  },
} as const;

const inputClass = "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-neutral-600 focus:border-emerald-300/60 focus:ring-2 focus:ring-emerald-300/10";

export default function HotelScannerV2Client({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
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
  const verificationOutputCount = result?.verification?.outputFactCount ?? 0;

  return (
    <section className="rounded-[2rem] border border-emerald-300/20 bg-neutral-900/85 p-5 shadow-[0_30px_100px_rgba(13,27,42,0.08)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300/80">StayHub Hotel Intake</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-400">{copy.intro}</p>
        </div>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/5 px-3 py-2 text-[10px] font-semibold uppercase text-amber-100">{copy.preview}</span>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="text-sm text-neutral-300">{copy.url}
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void scan(); }} placeholder={copy.placeholder} maxLength={2048} className={`${inputClass} mt-2`} />
        </label>
        <button type="button" onClick={() => void scan()} disabled={loading || !url.trim()} className="rounded-2xl border border-emerald-300/45 bg-emerald-300/10 px-6 py-3 font-semibold text-emerald-50 transition hover:border-emerald-200/70 disabled:cursor-not-allowed disabled:opacity-40">{loading ? copy.scanning : copy.scan}</button>
      </div>

      {result && !result.ok ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-100">{copy.failed} <span className="font-mono text-xs">{result.error || "scanner_v2_failed"}</span>{result.stage ? <span className="ml-2 text-neutral-400">({result.stage})</span> : null}</div> : null}

      {result?.ok ? <div className="mt-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label={copy.status} value={result.pipelineStatus || "—"} />
          <Metric label={copy.pages} value={String(result.discovery?.siteMap.counts.crawledPages ?? 0)} />
          <Metric label={copy.resources} value={String(result.discovery?.siteMap.counts.resources ?? 0)} />
          <Metric label={copy.expected} value={String(result.discovery?.inventory.counts.expectedItems ?? 0)} />
          <Metric label={copy.docs} value={`${result.completeness?.documents.ingested ?? 0}/${result.completeness?.documents.discovered ?? 0}`} />
          <Metric label={copy.conflicts} value={String((result.completeness?.conflicts.unresolved ?? 0) + (result.completeness?.conflicts.inventory ?? 0))} />
        </div>

        <Card title={copy.canonical}><p className="break-all font-mono text-xs text-neutral-300">{result.source?.canonicalUrl || "—"}</p></Card>

        <Card title={copy.inventory}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="text-neutral-500"><tr><th className="pb-3 pr-4">{copy.domain}</th><th className="pb-3 pr-4">{copy.expectation}</th><th className="pb-3 pr-4">{copy.ratio}</th><th className="pb-3 pr-4">{copy.result}</th><th className="pb-3">{copy.missing}</th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {(result.completeness?.domains || []).map((coverage) => {
                  const inventory = inventoryByDomain.get(coverage.domain);
                  return <tr key={coverage.domain} className="align-top"><td className="py-3 pr-4 font-semibold text-neutral-200">{coverage.domain}</td><td className="py-3 pr-4"><State value={inventory?.expectationState || "—"} /></td><td className="py-3 pr-4 font-mono text-neutral-300">{coverage.expected === null ? `? / ${coverage.extracted}` : `${coverage.extracted} / ${coverage.expected}`}</td><td className="py-3 pr-4"><State value={coverage.status} /></td><td className="py-3 text-neutral-400">{coverage.missingItems.length ? coverage.missingItems.map((item) => item.nameHint || item.id).join(", ") : "—"}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={copy.approval}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><State value={result.validationGate?.approvalEligible ? copy.eligible : copy.blocked} /><p className="mt-2 text-xs leading-5 text-neutral-400">{copy.noHandoff}</p></div>
            <div className="text-right text-xs text-neutral-500">candidate: <span className="font-mono text-neutral-300">{result.intelligenceCandidate?.validation.status || "—"}</span></div>
          </div>
        </Card>

        {(result.validationGate?.blockingReasons || []).length ? <Card title={copy.blockers}><ul className="space-y-2 text-sm text-amber-100/80">{result.validationGate?.blockingReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></Card> : null}
        {(result.completeness?.documents.pendingUrls || []).length ? <Card title={copy.pendingDocs}><ul className="space-y-2 text-xs text-neutral-400">{result.completeness?.documents.pendingUrls.map((item) => <li key={item} className="break-all font-mono">{item}</li>)}</ul></Card> : null}
        {(result.discovery?.failedPageUrls || []).length ? <Card title={copy.failedUrls}><ul className="space-y-2 text-xs text-neutral-400">{result.discovery?.failedPageUrls.map((item) => <li key={item} className="break-all font-mono">{item}</li>)}</ul></Card> : null}

        <Card title={copy.diagnostics}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label={copy.webFacts} value={String(webFactCount)} />
            <Metric label={copy.pdfFacts} value={String(pdfFactCount)} />
            <Metric label={copy.verificationInput} value={String(verificationInputCount)} />
            <Metric label={copy.verificationOutput} value={String(verificationOutputCount)} />
            <Metric label={copy.verified} value={String(result.verification?.verifiedFactCount ?? 0)} />
            <Metric label={copy.crossDomainConflicts} value={String(result.verification?.crossDomainConflictCount ?? 0)} />
          </div>
          <p className="mt-3 text-xs text-neutral-500">Single-source output: {result.verification?.singleSourceFactCount ?? 0} · Total: {result.diagnostics?.totalLatencyMs ?? 0} ms</p>
        </Card>
      </div> : null}
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-white/5 bg-black/15 p-4"><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{title}</h3><div className="mt-3">{children}</div></section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/5 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p><p className="mt-2 break-words text-sm font-semibold text-neutral-100">{value}</p></div>;
}

function State({ value }: { value: string }) {
  const warning = /INCOMPLETE|CONFLICT|BLOCKED|UNKNOWN/i.test(value);
  const good = /COMPLETE|DETERMINISTIC|READY/i.test(value) && !warning;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${good ? "border-emerald-300/25 bg-emerald-300/5 text-emerald-100" : warning ? "border-amber-300/25 bg-amber-300/5 text-amber-100" : "border-white/10 bg-white/5 text-neutral-300"}`}>{value}</span>;
}
