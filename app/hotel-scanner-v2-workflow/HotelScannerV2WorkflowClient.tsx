"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import type { ScannerV2CandidateView, ScannerV2DocumentView } from "../hotel-scanner-v2/HotelScannerV2Details";
import HotelScannerV2ReviewWorkspace, { type ScannerV2ReviewSection } from "../hotel-scanner-v2/HotelScannerV2ReviewWorkspace";

type WorkflowStart = {
  ok?: boolean;
  runId?: string;
  scanRunId?: string;
  runAccessToken?: string;
  status?: string;
  error?: string;
};

type MissingCoverageItem = { id: string; nameHint: string; url: string; crawled: boolean };

type DomainCoverage = {
  domain: string;
  status: string;
  reason: string;
  expected: number | null;
  extracted: number;
  missingItems: MissingCoverageItem[];
  inventory?: {
    status: string;
    reason: string;
    expected: number | null;
    extracted: number;
    missingItems: MissingCoverageItem[];
  };
  content?: {
    status: string;
    reason: string;
    detailed: number;
    totalEntities: number;
    missingDetailItems: MissingCoverageItem[];
  };
};

type SiteCoverage = {
  coverageComplete?: boolean;
  discoveredRelevantCount?: number;
  fetchedRelevantCount?: number;
  pendingRelevantCount?: number;
  failedRelevantCount?: number;
  pendingRelevantUrls?: string[];
  failedRelevantUrls?: string[];
};

type WorkflowResult = {
  ok?: boolean;
  pipelineStatus?: string;
  source?: { canonicalUrl?: string };
  discovery?: {
    siteMap?: { counts?: { crawledPages?: number; resources?: number } };
    inventory?: { counts?: { expectedItems?: number } };
    coverage?: SiteCoverage;
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

type QuickPreview = {
  ok?: boolean;
  mode?: "quick_preview";
  runtimeMs?: number;
  sourcePackage?: HotelIntelligencePackage;
  components?: Array<{ domain: string; count: number; state: string }>;
  documents?: Array<{ kind: string; bg: string; en: string; onboarding: boolean; count: number }>;
  diagnostics?: { pageCount?: number; resourceCount?: number; expectedItems?: number };
  error?: string;
};

const STORAGE_KEY = "stayhub_scanner_v2_workflow_run";
const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";

const COPY = {
  bg: {
    title: "Ново сканиране",
    help: "Scanner V2 работи като durable background workflow: Discovery се checkpoint-ва отделно, AI enrichment и persistence продължават без браузърът да държи една дълга HTTP заявка.",
    url: "Официален хотелски сайт",
    start: "Сканирай с V2",
    starting: "Стартиране…",
    run: "Workflow Run",
    status: "Статус",
    resume: "При refresh този run се възстановява автоматично.",
    completed: "Сканирането завърши. Данните по-долу са пълният резултат от същия Scanner V2 pipeline, изпълнен като durable workflow.",
    failed: "Workflow сканирането завърши с грешка.",
    newScan: "Ново сканиране",
    cancelRun: "Прекрати текущия run",
    cancellingRun: "Прекратяване…",
    pipeline: "Pipeline статус",
    pages: "Прочетени страници",
    resources: "Открити ресурси",
    expected: "Expected",
    pdf: "PDF",
    conflicts: "Конфликти",
    runtime: "Scanner runtime",
    siteCoverage: "1. Coverage на релевантните страници",
    siteCoverageHelp: "Crawler-ът първо установява кои hotel pages са релевантни. Тук се вижда дали всички открити logical pages са реално прочетени преди extraction.",
    discoveredRelevant: "Открити релевантни",
    fetchedRelevant: "Прочетени релевантни",
    pendingRelevant: "Чакат прочит",
    failedRelevant: "Неуспешни",
    coverageComplete: "Coverage complete",
    coverageIncomplete: "Coverage incomplete",
    pendingPages: "Непрочетени релевантни страници",
    failedPages: "Неуспешни релевантни страници",
    coverage: "2. Completeness по категории",
    coverageHelp: "Inventory показва дали са намерени всички очаквани entities. Content показва дали намерените entities имат реални детайли. COMPLETE се дава само когато и двете са пълни.",
    extracted: "Намерени entities",
    missing: "Липсващи entities",
    withDetails: "С детайли",
    missingDetails: "Без детайли",
    approval: "5. Approval gate",
    approvalHelp: "Workflow-ът остава evidence-only. Няма автоматичен handoff към Design Studio / Factory.",
    eligible: "Готово за човешки approval",
    blocked: "Блокирано",
    blockers: "Blocking reasons",
    noBlockers: "Няма blocking reasons.",
    designStudio: "Отвори в Design Studio",
    quickTitle: "Quick Client Preview",
    quickHelp: "Основните Hub компоненти са намерени без PDF четене и без да чакаш Deep Verification.",
    quickLoading: "Подготвям бързия preview…",
    quickFailed: "Quick Preview не успя, но Deep Verification продължава.",
    quickDesign: "Виж визуално в Design Studio",
    documentsFound: "Намерени документи",
    onboardingLater: "добавяме при onboarding",
    verifiedLater: "проверяваме за конфликти",
    deepRunning: "Deep Verification продължава във фонов режим",
  },
  en: {
    title: "New scan",
    help: "Scanner V2 runs as a durable background workflow: Discovery is checkpointed separately, while AI enrichment and persistence continue without one long browser HTTP request.",
    url: "Official hotel website",
    start: "Scan with V2",
    starting: "Starting…",
    run: "Workflow Run",
    status: "Status",
    resume: "After refresh this run is restored automatically.",
    completed: "The scan completed. The data below is the full result from the same Scanner V2 pipeline, executed as a durable workflow.",
    failed: "The workflow scan failed.",
    newScan: "New scan",
    cancelRun: "Cancel current run",
    cancellingRun: "Cancelling…",
    pipeline: "Pipeline status",
    pages: "Crawled pages",
    resources: "Discovered resources",
    expected: "Expected",
    pdf: "PDF",
    conflicts: "Conflicts",
    runtime: "Scanner runtime",
    siteCoverage: "1. Relevant page coverage",
    siteCoverageHelp: "The crawler first establishes which hotel pages are relevant. This shows whether every discovered logical page was actually read before extraction.",
    discoveredRelevant: "Relevant discovered",
    fetchedRelevant: "Relevant fetched",
    pendingRelevant: "Pending read",
    failedRelevant: "Failed",
    coverageComplete: "Coverage complete",
    coverageIncomplete: "Coverage incomplete",
    pendingPages: "Unread relevant pages",
    failedPages: "Failed relevant pages",
    coverage: "2. Completeness by category",
    coverageHelp: "Inventory shows whether every expected entity was found. Content shows whether found entities have real details. COMPLETE requires both layers to be complete.",
    extracted: "Entities found",
    missing: "Missing entities",
    withDetails: "With details",
    missingDetails: "Missing details",
    approval: "5. Approval gate",
    approvalHelp: "The workflow remains evidence-only. There is no automatic handoff to Design Studio / Factory.",
    eligible: "Ready for human approval",
    blocked: "Blocked",
    blockers: "Blocking reasons",
    noBlockers: "No blocking reasons.",
    designStudio: "Open in Design Studio",
    quickTitle: "Quick Client Preview",
    quickHelp: "Core Hub components were found without PDF parsing and without waiting for Deep Verification.",
    quickLoading: "Preparing quick preview…",
    quickFailed: "Quick Preview failed, but Deep Verification continues.",
    quickDesign: "Open visual Design Studio preview",
    documentsFound: "Discovered documents",
    onboardingLater: "add during onboarding",
    verifiedLater: "verify for conflicts",
    deepRunning: "Deep Verification continues in the background",
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
  const [scanRunId, setScanRunId] = useState<string | null>(null);
  const [runAccessToken, setRunAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [quickPreview, setQuickPreview] = useState<QuickPreview | null>(null);
  const [quickPreviewLoading, setQuickPreviewLoading] = useState(false);
  const [quickPreviewError, setQuickPreviewError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { runId?: string; scanRunId?: string; runAccessToken?: string; url?: string };
      if (saved.runId && saved.scanRunId && saved.runAccessToken) {
        setRunId(saved.runId);
        setScanRunId(saved.scanRunId);
        setRunAccessToken(saved.runAccessToken);
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
    if (!runId || !scanRunId || !runAccessToken || result || error) return;
    const currentRunId = runId;
    const currentScanRunId = scanRunId;
    const currentRunAccessToken = runAccessToken;
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const response = await fetch(`/api/control-plane/hotel-scanner/scan-v2-workflow/${encodeURIComponent(currentRunId)}`, {
            method: "GET",
            cache: "no-store",
            headers: {
              "X-Scanner-Scan-Run-Id": currentScanRunId,
              "X-Scanner-Workflow-Token": currentRunAccessToken,
            },
          });
          const body = (await response.json().catch(() => ({}))) as WorkflowPoll;
          if (cancelled) return;

          if (body.status === "completed" && body.result) {
            setStatus("completed");
            setResult(body.result);
            setError(null);
            window.localStorage.removeItem(STORAGE_KEY);
            return;
          }

          if (body.status === "failed" || body.status === "cancelled") {
            setStatus(body.status);
            setError(body.error || "scanner_v2_workflow_failed");
            window.localStorage.removeItem(STORAGE_KEY);
            return;
          }

          if (!response.ok || body.ok === false) {
            // Workflow status transport can fail transiently while the durable run
            // continues in the background. Never turn a recoverable polling error
            // into a terminal FAILED state.
            if ([400, 401, 403].includes(response.status)) {
              setStatus("failed");
              setError(body.error || "scanner_v2_workflow_access_failed");
              window.localStorage.removeItem(STORAGE_KEY);
              return;
            }
            setStatus("reconnecting");
          } else {
            setStatus(body.status || "running");
            setError(null);
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
  }, [runId, scanRunId, runAccessToken, result, error]);

  async function startScan() {
    if (!url.trim() || starting || (runId && !result && !error)) return;
    setStarting(true);
    setResult(null);
    setError(null);
    setQuickPreview(null);
    setQuickPreviewError(null);
    setQuickPreviewLoading(true);
    setStatus("starting");
    setElapsedMs(0);

    const quickRequest = fetch("/api/control-plane/hotel-scanner/scan-v2-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim(), lang }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as QuickPreview;
        if (!response.ok || !body.ok || !body.sourcePackage) throw new Error(body.error || "scanner_v2_quick_preview_failed");
        setQuickPreview(body);
        setQuickPreviewError(null);
      })
      .catch((reason) => setQuickPreviewError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setQuickPreviewLoading(false));

    try {
      const response = await fetch("/api/control-plane/hotel-scanner/scan-v2-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      const body = (await response.json().catch(() => ({}))) as WorkflowStart;
      if (!response.ok || !body.ok || !body.runId || !body.scanRunId || !body.runAccessToken) {
        setError(body.error || "scanner_v2_workflow_start_failed");
        setStatus("failed");
        return;
      }

      setRunId(body.runId);
      setScanRunId(body.scanRunId);
      setRunAccessToken(body.runAccessToken);
      setStatus(body.status || "running");
      setPollStartedAt(Date.now());
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        runId: body.runId,
        scanRunId: body.scanRunId,
        runAccessToken: body.runAccessToken,
        url: url.trim(),
      }));
    } catch {
      setError("network_error");
      setStatus("failed");
    } finally {
      setStarting(false);
      void quickRequest;
    }
  }

  async function cancelCurrentRun() {
    if (!runId || !scanRunId || !runAccessToken || cancelling) return;
    setCancelling(true);
    setStatus("cancelling");
    try {
      const response = await fetch(`/api/control-plane/hotel-scanner/scan-v2-workflow/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "X-Scanner-Scan-Run-Id": scanRunId,
          "X-Scanner-Workflow-Token": runAccessToken,
        },
      });
      const body = (await response.json().catch(() => ({}))) as WorkflowPoll;
      if (!response.ok || body.ok === false) {
        setStatus(body.error || "cancel_failed");
        return;
      }
      reset();
    } catch {
      setStatus("cancel_failed");
    } finally {
      setCancelling(false);
    }
  }

  function reset() {
    window.localStorage.removeItem(STORAGE_KEY);
    setRunId(null);
    setScanRunId(null);
    setRunAccessToken(null);
    setStatus("idle");
    setResult(null);
    setError(null);
    setPollStartedAt(null);
    setElapsedMs(0);
    setQuickPreview(null);
    setQuickPreviewError(null);
    setQuickPreviewLoading(false);
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
  const siteCoverage = result?.discovery?.coverage;

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

      {(quickPreviewLoading || quickPreview || quickPreviewError) ? (
        <section className="v2-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="v2-section-title text-xl">{copy.quickTitle}</h2>
              <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.quickHelp}</p>
            </div>
            {quickPreview?.runtimeMs ? <span className="v2-pill v2-pill-good">{formatDuration(quickPreview.runtimeMs)}</span> : null}
          </div>
          {quickPreviewLoading ? <p className="v2-muted mt-5 text-sm">{copy.quickLoading}</p> : null}
          {quickPreviewError ? <p className="mt-5 text-sm" style={{ color: "var(--v2-bad)" }}>{copy.quickFailed}</p> : null}
          {quickPreview ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(quickPreview.components || []).map((component) => (
                  <div key={component.domain} className="v2-card-soft p-4">
                    <p className="v2-muted text-xs font-bold uppercase tracking-[0.12em]">{domainLabel(component.domain, lang)}</p>
                    <p className="mt-2 text-2xl font-semibold">{component.count}</p>
                    <p className="v2-muted mt-1 text-[10px] font-mono">{component.state}</p>
                  </div>
                ))}
              </div>
              {(quickPreview.documents || []).length ? (
                <div className="mt-5">
                  <p className="v2-muted text-xs font-bold uppercase tracking-[0.12em]">{copy.documentsFound}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(quickPreview.documents || []).map((document) => (
                      <span key={document.kind} className="v2-pill">
                        {lang === "bg" ? document.bg : document.en} · {document.count} · {document.onboarding ? copy.onboardingLater : copy.verifiedLater}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {quickPreview.sourcePackage ? (
                  <Link
                    href={`/design-studio?lang=${lang}&preview=quick`}
                    onClick={() => window.sessionStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(quickPreview.sourcePackage))}
                    className="v2-button inline-flex text-sm"
                  >
                    {copy.quickDesign}
                  </Link>
                ) : null}
                {runId && !result && !error ? <span className="v2-muted text-xs">{copy.deepRunning}</span> : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

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
              {active ? (
                <button type="button" onClick={() => void cancelCurrentRun()} disabled={cancelling} className="v2-button text-xs">
                  {cancelling ? copy.cancellingRun : copy.cancelRun}
                </button>
              ) : null}
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
            {scanRunId ? (
              <div className="mt-5">
                <Link href={`/design-studio?lang=${lang}&scanRunId=${encodeURIComponent(scanRunId)}`} className="v2-button inline-flex text-sm">
                  {copy.designStudio}
                </Link>
              </div>
            ) : null}
          </section>

          <section className="v2-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="v2-section-title text-xl">{copy.siteCoverage}</h2>
                <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.siteCoverageHelp}</p>
              </div>
              <span className={`v2-pill ${siteCoverage?.coverageComplete ? "v2-pill-good" : "v2-pill-warn"}`}>
                {siteCoverage?.coverageComplete ? copy.coverageComplete : copy.coverageIncomplete}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [copy.discoveredRelevant, siteCoverage?.discoveredRelevantCount ?? 0],
                [copy.fetchedRelevant, siteCoverage?.fetchedRelevantCount ?? 0],
                [copy.pendingRelevant, siteCoverage?.pendingRelevantCount ?? 0],
                [copy.failedRelevant, siteCoverage?.failedRelevantCount ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="v2-card-soft p-4">
                  <p className="v2-muted text-xs font-bold uppercase tracking-[0.12em]">{label}</p>
                  <p className="mt-2 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            {siteCoverage?.pendingRelevantUrls?.length ? (
              <details className="v2-card-soft mt-4 p-4">
                <summary className="cursor-pointer text-sm font-semibold">{copy.pendingPages} ({siteCoverage.pendingRelevantUrls.length})</summary>
                <div className="mt-3 space-y-2">
                  {siteCoverage.pendingRelevantUrls.map((pendingUrl) => (
                    <a key={pendingUrl} href={pendingUrl} target="_blank" rel="noreferrer" className="v2-source-link block break-all text-xs">{pendingUrl}</a>
                  ))}
                </div>
              </details>
            ) : null}
            {siteCoverage?.failedRelevantUrls?.length ? (
              <details className="v2-card-soft mt-4 p-4">
                <summary className="cursor-pointer text-sm font-semibold">{copy.failedPages} ({siteCoverage.failedRelevantUrls.length})</summary>
                <div className="mt-3 space-y-2">
                  {siteCoverage.failedRelevantUrls.map((failedUrl) => (
                    <a key={failedUrl} href={failedUrl} target="_blank" rel="noreferrer" className="v2-source-link block break-all text-xs">{failedUrl}</a>
                  ))}
                </div>
              </details>
            ) : null}
          </section>

          <section className="v2-panel p-5 sm:p-6">
            <h2 className="v2-section-title text-xl">{copy.coverage}</h2>
            <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.coverageHelp}</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {(result.completeness?.domains || []).map((domain) => {
                const inventoryLayer = domain.inventory || {
                  status: domain.status,
                  reason: domain.reason,
                  expected: domain.expected,
                  extracted: domain.extracted,
                  missingItems: domain.missingItems || [],
                };
                const contentLayer = domain.content || {
                  status: domain.status,
                  reason: domain.reason,
                  detailed: domain.extracted,
                  totalEntities: domain.extracted,
                  missingDetailItems: [],
                };
                return (
                <article key={domain.domain} className="v2-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{domainLabel(domain.domain, lang)}</h3>
                      <p className="v2-muted mt-1 text-xs font-mono">{domain.reason}</p>
                    </div>
                    <span className={`v2-pill ${domain.status === "COMPLETE" ? "v2-pill-good" : domain.status === "NOT_APPLICABLE" ? "v2-pill-info" : "v2-pill-warn"}`}>{domain.status}</span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="v2-card-soft p-3">
                      <p className="v2-muted text-[10px] font-bold uppercase tracking-[0.12em]">Inventory</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="v2-pill">{copy.extracted}: {inventoryLayer.extracted}/{inventoryLayer.expected ?? "?"}</span>
                        <span className="v2-pill">{copy.missing}: {inventoryLayer.missingItems?.length || 0}</span>
                      </div>
                    </div>
                    <div className="v2-card-soft p-3">
                      <p className="v2-muted text-[10px] font-bold uppercase tracking-[0.12em]">Content</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="v2-pill">{copy.withDetails}: {contentLayer.detailed}/{contentLayer.totalEntities}</span>
                        <span className="v2-pill">{copy.missingDetails}: {contentLayer.missingDetailItems?.length || 0}</span>
                      </div>
                    </div>
                  </div>
                  {inventoryLayer.missingItems?.length ? (
                    <div className="mt-4 space-y-2">
                      <p className="v2-muted text-xs font-bold">{copy.missing}</p>
                      {inventoryLayer.missingItems.map((item) => (
                        <div key={item.id} className="v2-card-soft p-3">
                          <p className="text-sm font-semibold">{item.nameHint || item.id}</p>
                          {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="v2-source-link mt-1 block break-all text-xs">{item.url}</a> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {contentLayer.missingDetailItems?.length ? (
                    <div className="mt-4 space-y-2">
                      <p className="v2-muted text-xs font-bold">{copy.missingDetails}</p>
                      {contentLayer.missingDetailItems.map((item) => (
                        <div key={`detail:${item.id}`} className="v2-card-soft p-3">
                          <p className="text-sm font-semibold">{item.nameHint || item.id}</p>
                          {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="v2-source-link mt-1 block break-all text-xs">{item.url}</a> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
                );
              })}            </div>
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
