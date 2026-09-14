"use client";

import { useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { ScannerV2CandidateView, ScannerV2DocumentView } from "../hotel-scanner-v2/HotelScannerV2Details";
import HotelScannerV2ReviewWorkspace, { type ScannerV2ReviewSection } from "../hotel-scanner-v2/HotelScannerV2ReviewWorkspace";

type WorkflowStart = {
  ok?: boolean;
  runId?: string;
  status?: string;
  error?: string;
};

type DomainCoverage = {
  domain: string;
  status: string;
  reason: string;
  expected: number | null;
  extracted: number;
  missingItems: Array<{ id: string; nameHint: string; url: string; crawled: boolean }>;
};

type WorkflowResult = {
  ok?: boolean;
  pipelineStatus?: string;
  source?: { canonicalUrl?: string };
  discovery?: {
    siteMap?: { counts?: { crawledPages?: number; resources?: number } };
    inventory?: { counts?: { expectedItems?: number } };
  };
  documents?: {
    documents?: ScannerV2DocumentView[];
  };
  completeness?: {
    status?: string;
    domains?: DomainCoverage[];
    documents?: { discovered?: number; ingested?: number };
    conflicts?: { unresolved?: number };
    blockingReasons?: string[];
  };
  intelligenceCandidate?: ScannerV2CandidateView;
  reviewSections?: ScannerV2ReviewSection[];
  validationGate?: {
    downstreamHandoffAllowed?: false;
    approvalEligible?: boolean;
    blockingReasons?: string[];
  };
  diagnostics?: { totalLatencyMs?: number };
};

type WorkflowPoll = {
  ok?: boolean;
  runId?: string;
  status?: string;
  error?: string;
  result?: WorkflowResult;
};

const STORAGE_KEY = "stayhub_scanner_v2_workflow_run";

const COPY = {
  bg: {
    title: "Scanner V2 · Durable Workflow тест",
    help: "Този екран тества новия execution модел. Бутонът стартира background job и не чака цялото сканиране в една HTTP заявка.",
    url: "Официален хотелски сайт",
    start: "Стартирай Workflow scan",
    starting: "Стартиране…",
    run: "Workflow Run",
    status: "Статус",
    resume: "При refresh този run се възстановява автоматично.",
    completed: "Сканирането завърши. Данните по-долу са пълният резултат от същия Scanner V2 pipeline, изпълнен като durable workflow.",
    failed: "Workflow сканирането завърши с грешка.",
    newScan: "Ново сканиране",
    pipeline: "Pipeline статус",
    pages: "Прочетени страници",
    resources: "Открити ресурси",
    expected: "Expected",
    pdf: "PDF",
    conflicts: "Конфликти",
    runtime: "Scanner runtime",
    coverage: "2. Completeness по категории",
    coverageHelp: "Тук вече се вижда защо Pipeline е INCOMPLETE: expected срещу extracted и конкретните липсващи entities.",
    extracted: "Extracted",
    missing: "Липсват",
    approval: "5. Approval gate",
    approvalHelp: "Workflow-ът остава evidence-only. Няма автоматичен handoff към Design Studio / Factory.",
    eligible: "Готово за човешки approval",
    blocked: "Блокирано",
    blockers: "Blocking reasons",
    noBlockers: "Няма blocking reasons.",
  },
  en: {
    title: "Scanner V2 · Durable Workflow test",
    help: "This screen tests the new execution model. The button starts a background job instead of keeping one HTTP request open for the entire scan.",
    url: "Official hotel website",
    start: "Start Workflow scan",
    starting: "Starting…",
    run: "Workflow Run",
    status: "Status",
    resume: "After refresh this run is restored automatically.",
    completed: "The scan completed. The data below is the full result from the same Scanner V2 pipeline, executed as a durable workflow.",
    failed: "The workflow scan failed.",
    newScan: "New scan",
    pipeline: "Pipeline status",
    pages: "Crawled pages",
    resources: "Discovered resources",
    expected: "Expected",
    pdf: "PDF",
    conflicts: "Conflicts",
    runtime: "Scanner runtime",
    coverage: "2. Completeness by category",
    coverageHelp: "This shows why the pipeline is INCOMPLETE: expected versus extracted and the concrete missing entities.",
    extracted: "Extracted",
    missing: "Missing",
    approval: "5. Approval gate",
    approvalHelp: "The workflow remains evidence-only. There is no automatic handoff to Design Studio / Factory.",
    eligible: "Ready for human approval",
    blocked: "Blocked",
    blockers: "Blocking reasons",
    noBlockers: "No blocking reasons.",
  },
} as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms?: number) {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function domainLabel(domain: string, lang: ControlPlaneLang) {
  const labels: Record<string, [string, string]> = {
    accommodation: ["Настаняване", "Accommodation"],
    gastronomy: ["Ресторанти и барове", "Restaurants & bars"],
    spa: ["SPA / Medical", "SPA / Medical"],
    services: ["Хотелски услуги", "Hotel services"],
    experiences: ["Преживявания", "Experiences"],
    events: ["Събития", "Events"],
    offers: ["Оферти", "Offers"],
    policies: ["Правила", "Policies"],
    contacts: ["Контакти", "Contacts"],
  };
  return labels[domain]?.[lang === "bg" ? 0 : 1] || domain;
}

export default function HotelScannerV2WorkflowClient({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const [url, setUrl] = useState("https://pavelbanyagrand.com/");
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { runId?: string; url?: string };
      if (saved.runId) {
        setRunId(saved.runId);
        setUrl(saved.url || "https://pavelbanyagrand.com/");
        setStatus("restoring");
        setPollStartedAt(Date.now());
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!pollStartedAt || result || error) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - pollStartedAt), 1000);
    return () => window.clearInterval(timer);
  }, [pollStartedAt, result, error]);

  useEffect(() => {
    if (!runId || result || error) return;
    const currentRunId = runId;
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const response = await fetch(`/api/control-plane/hotel-scanner/scan-v2-workflow/${encodeURIComponent(currentRunId)}`, {
            method: "GET",
            cache: "no-store",
          });
          const body = (await response.json().catch(() => ({}))) as WorkflowPoll;
          if (cancelled) return;

          setStatus(body.status || (body.ok === false ? "failed" : "running"));

          if (body.status === "completed" && body.result) {
            setResult(body.result);
            setError(null);
            window.localStorage.removeItem(STORAGE_KEY);
            return;
          }

          if (body.ok === false || body.status === "failed" || body.status === "cancelled") {
            setError(body.error || "scanner_v2_workflow_failed");
            window.localStorage.removeItem(STORAGE_KEY);
            return;
          }
        } catch {
          if (cancelled) return;
          setStatus("reconnecting");
        }

        await sleep(2500);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [runId, result, error]);

  async function startScan() {
    if (!url.trim() || starting || (runId && !result && !error)) return;
    setStarting(true);
    setResult(null);
    setError(null);
    setStatus("starting");
    setElapsedMs(0);

    try {
      const response = await fetch("/api/control-plane/hotel-scanner/scan-v2-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      const body = (await response.json().catch(() => ({}))) as WorkflowStart;
      if (!response.ok || !body.ok || !body.runId) {
        setError(body.error || "scanner_v2_workflow_start_failed");
        setStatus("failed");
        return;
      }

      setRunId(body.runId);
      setStatus(body.status || "running");
      setPollStartedAt(Date.now());
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ runId: body.runId, url: url.trim() }));
    } catch {
      setError("network_error");
      setStatus("failed");
    } finally {
      setStarting(false);
    }
  }

  function reset() {
    window.localStorage.removeItem(STORAGE_KEY);
    setRunId(null);
    setStatus("idle");
    setResult(null);
    setError(null);
    setPollStartedAt(null);
    setElapsedMs(0);
  }

  const metrics = useMemo(() => {
    if (!result) return [];
    const counts = result.discovery?.siteMap?.counts;
    const inventory = result.discovery?.inventory?.counts;
    const docs = result.completeness?.documents;
    return [
      [copy.pipeline, result.pipelineStatus || "—"],
      [copy.pages, String(counts?.crawledPages ?? 0)],
      [copy.resources, String(counts?.resources ?? 0)],
      [copy.expected, String(inventory?.expectedItems ?? 0)],
      [copy.pdf, `${docs?.ingested ?? 0}/${docs?.discovered ?? 0}`],
      [copy.conflicts, String(result.completeness?.conflicts?.unresolved ?? 0)],
      [copy.runtime, formatDuration(result.diagnostics?.totalLatencyMs)],
    ];
  }, [result, copy]);

  const active = Boolean(runId && !result && !error);
  const blockers = result?.validationGate?.blockingReasons || result?.completeness?.blockingReasons || [];

  return (
    <div className="space-y-6">
      <section className="v2-panel p-5 sm:p-6">
        <h2 className="v2-section-title text-xl">{copy.title}</h2>
        <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.help}</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="text-sm font-semibold">
            {copy.url}
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={active}
              className="v2-input mt-2"
            />
          </label>
          <button type="button" onClick={() => void startScan()} disabled={starting || active || !url.trim()} className="v2-button min-w-56">
            {starting ? copy.starting : copy.start}
          </button>
        </div>
      </section>

      {runId ? (
        <section className="v2-panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="v2-muted text-xs font-bold uppercase tracking-[0.16em]">{copy.run}</p>
              <p className="mt-2 break-all font-mono text-sm font-semibold">{runId}</p>
              <p className="v2-muted mt-2 text-sm">{copy.resume}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`v2-pill ${result ? "v2-pill-good" : error ? "v2-pill-bad" : "v2-pill-info"}`}>{copy.status}: {status}</span>
              <span className="v2-pill">{formatDuration(elapsedMs)}</span>
              {(result || error) ? <button type="button" onClick={reset} className="v2-button text-xs">{copy.newScan}</button> : null}
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="v2-panel p-5 sm:p-6">
          <span className="v2-pill v2-pill-bad">FAILED</span>
          <p className="v2-muted mt-3 text-sm">{copy.failed}</p>
          <p className="mt-2 font-mono text-sm">{error}</p>
        </section>
      ) : null}

      {result ? (
        <>
          <section className="v2-panel p-5 sm:p-6">
            <span className="v2-pill v2-pill-good">COMPLETED</span>
            <p className="v2-muted mt-3 text-sm leading-6">{copy.completed}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map(([label, value]) => (
                <div key={label} className="v2-card-soft p-4">
                  <p className="v2-muted text-xs font-bold uppercase tracking-[0.12em]">{label}</p>
                  <p className="mt-2 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            {result.source?.canonicalUrl ? (
              <a className="v2-source-link mt-5 inline-flex text-sm font-semibold" href={result.source.canonicalUrl} target="_blank" rel="noreferrer">
                {result.source.canonicalUrl}
              </a>
            ) : null}
          </section>

          <section className="v2-panel p-5 sm:p-6">
            <h2 className="v2-section-title text-xl">{copy.coverage}</h2>
            <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.coverageHelp}</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {(result.completeness?.domains || []).map((domain) => (
                <article key={domain.domain} className="v2-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{domainLabel(domain.domain, lang)}</h3>
                      <p className="v2-muted mt-1 text-xs font-mono">{domain.reason}</p>
                    </div>
                    <span className={`v2-pill ${domain.status === "COMPLETE" ? "v2-pill-good" : domain.status === "CONFLICT" ? "v2-pill-warn" : "v2-pill-info"}`}>{domain.status}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="v2-pill">{copy.extracted}: {domain.extracted}</span>
                    <span className="v2-pill">{copy.expected}: {domain.expected ?? "?"}</span>
                    <span className="v2-pill">{copy.missing}: {domain.missingItems?.length || 0}</span>
                  </div>
                  {domain.missingItems?.length ? (
                    <div className="mt-4 space-y-2">
                      {domain.missingItems.map((item) => (
                        <div key={item.id} className="v2-card-soft p-3">
                          <p className="text-sm font-semibold">{item.nameHint || item.id}</p>
                          {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="v2-source-link mt-1 block break-all text-xs">{item.url}</a> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <HotelScannerV2ReviewWorkspace
            sections={result.reviewSections}
            candidate={result.intelligenceCandidate}
            documents={result.documents?.documents}
            lang={lang}
          />

          <section className="v2-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="v2-section-title text-xl">{copy.approval}</h2>
                <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.approvalHelp}</p>
              </div>
              <span className={`v2-pill ${result.validationGate?.approvalEligible ? "v2-pill-good" : "v2-pill-bad"}`}>
                {result.validationGate?.approvalEligible ? copy.eligible : copy.blocked}
              </span>
            </div>
            <div className="mt-5">
              <p className="v2-muted text-xs font-bold uppercase tracking-[0.14em]">{copy.blockers}</p>
              {blockers.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {blockers.map((blocker) => <span key={blocker} className="v2-pill v2-pill-warn font-mono text-xs">{blocker}</span>)}
                </div>
              ) : <p className="v2-muted mt-2 text-sm">{copy.noBlockers}</p>}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
