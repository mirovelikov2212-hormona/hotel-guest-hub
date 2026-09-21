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
    structuralCrawl?: { stopReason?: string; inventoryClosed?: boolean };
  };
  canonicalInventory?: {
    authority?: { snapshotId?: string; snapshotFingerprint?: string; domains?: Array<{ domain: string; count: number }> };
    observed?: { snapshotId?: string; snapshotFingerprint?: string; domains?: Array<{ domain: string; count: number }> };
    delta?: {
      changed?: boolean;
      addedEntityIds?: string[];
      removedEntityIds?: string[];
      domainChangedEntityIds?: string[];
    };
    authorityLocked?: boolean;
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
  components?: Array<{
    domain: string;
    count: number;
    state: string;
    namedCount?: number;
    needsOnboarding?: boolean;
    manualOnly?: boolean;
    items?: Array<{ name: string; hours?: string }>;
  }>;
  contacts?: {
    phones?: string[];
    emails?: string[];
    addresses?: string[];
    website?: string;
  };
  documents?: Array<{ kind: string; bg: string; en: string; onboarding: boolean; count: number }>;
  diagnostics?: { pageCount?: number; resourceCount?: number; expectedItems?: number; inventorySnapshotId?: string };
  inventoryAuthority?: {
    snapshotId?: string;
    snapshotFingerprint?: string;
    domains?: Array<{ domain: string; count: number; status?: string }>;
  } | null;
  inventoryAuthorityToken?: string;
  workflow?: (WorkflowStart & { reusedDiscovery?: boolean }) | null;
  checkpoint?: {
    reusable?: boolean;
    bytes?: number;
    maxInlineBytes?: number;
    fallbackRequired?: boolean;
  };
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
    coverageHelp: "Inventory показва какво е намерено на сайта. Липсващи описания, цени, снимки и други подробности са onboarding работа и не правят Scanner-а неуспешен.",
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
    quickHelp: "Основните компоненти на бъдещия Hub са готови за преглед. Отвори всяка карта, за да видиш какво е намерено.",
    quickLoading: "Подготвям бързия preview…",
    quickFailed: "Quick Preview не успя, но Deep Verification продължава.",
    quickDesign: "Виж визуално в Design Studio",
    documentsFound: "Намерени документи",
    onboardingLater: "добавяме при onboarding",
    verifiedLater: "проверяваме за конфликти",
    deepRunning: "Пълната проверка продължава във фонов режим",
    found: "Намерени",
    notFound: "Не е открито на сайта",
    openCard: "Виж съдържанието",
    hours: "Работно време",
    hoursMissing: "Работно време не е открито на сайта",
    onboardingReady: "Сканирането е готово за onboarding.",
    onboardingHelp: "Намерените компоненти са готови. Описания, цени, снимки и други детайли могат да се допълнят ръчно при onboarding.",
    onboardingSection: "Следваща стъпка: onboarding",
    manualSetup: "Детайлите се допълват при onboarding",
    needsReview: "Нужна е проверка",
    discoveredOnSite: "Намерено на сайта",
    contactsFound: "Контакти намерени",
    manualConfiguration: "Нужда от ръчна настройка",
    technical: "Технически детайли",
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
    coverageHelp: "Inventory shows what was discovered on the website. Missing descriptions, prices, images and other details are onboarding work and do not make the Scanner fail.",
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
    quickHelp: "The core components of the future Hub are ready to review. Open each card to see what was found.",
    quickLoading: "Preparing quick preview…",
    quickFailed: "Quick Preview failed, but Deep Verification continues.",
    quickDesign: "Open visual Design Studio preview",
    documentsFound: "Discovered documents",
    onboardingLater: "add during onboarding",
    verifiedLater: "verify for conflicts",
    deepRunning: "Full verification continues in the background",
    found: "Found",
    notFound: "Not found on the website",
    openCard: "View contents",
    hours: "Opening hours",
    hoursMissing: "Opening hours were not found on the website",
    onboardingReady: "The scan is ready for onboarding.",
    onboardingHelp: "The discovered components are ready. Descriptions, prices, images and other details can be completed manually during onboarding.",
    onboardingSection: "Next step: onboarding",
    manualSetup: "Details are completed during onboarding",
    needsReview: "Needs review",
    discoveredOnSite: "Found on the website",
    contactsFound: "Contacts found",
    manualConfiguration: "Manual setup required",
    technical: "Technical details",
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

    let inventoryAuthorityToken = "";
    let quickWorkflow: (WorkflowStart & { reusedDiscovery?: boolean }) | null = null;
    try {
      const quickResponse = await fetch("/api/control-plane/hotel-scanner/scan-v2-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      const quickBody = (await quickResponse.json().catch(() => ({}))) as QuickPreview;
      if (!quickResponse.ok || !quickBody.ok || !quickBody.sourcePackage) {
        throw new Error(quickBody.error || "scanner_v2_quick_preview_failed");
      }
      setQuickPreview(quickBody);
      setQuickPreviewError(null);
      inventoryAuthorityToken = String(quickBody.inventoryAuthorityToken || "");
      quickWorkflow = quickBody.workflow || null;
    } catch (reason) {
      setQuickPreviewError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setQuickPreviewLoading(false);
    }

    try {
      if (
        quickWorkflow?.runId
        && quickWorkflow.scanRunId
        && quickWorkflow.runAccessToken
      ) {
        // M6: the preview route already started Deep Verification with the same
        // discovery evidence. No second crawl of the hotel is needed.
        setRunId(quickWorkflow.runId);
        setScanRunId(quickWorkflow.scanRunId);
        setRunAccessToken(quickWorkflow.runAccessToken);
        setStatus(quickWorkflow.status || "running");
        setPollStartedAt(Date.now());
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          runId: quickWorkflow.runId,
          scanRunId: quickWorkflow.scanRunId,
          runAccessToken: quickWorkflow.runAccessToken,
          url: url.trim(),
        }));
        return;
      }

      // Fallback for an oversized/failed checkpoint handoff. It is sequential,
      // bounded and robots-aware; the scanners are never run concurrently.
      const response = await fetch("/api/control-plane/hotel-scanner/scan-v2-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          lang,
          inventoryAuthorityToken: inventoryAuthorityToken || undefined,
        }),
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
    return [
      [copy.pages, String(counts?.crawledPages ?? 0)],
      [copy.resources, String(counts?.resources ?? 0)],
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
                {(quickPreview.components || []).map((component) => {
                  const isContacts = component.domain === "contacts";
                  const namedCount = component.namedCount ?? component.items?.length ?? 0;
                  const hasContacts = Boolean(
                    quickPreview.contacts?.phones?.length
                    || quickPreview.contacts?.emails?.length
                    || quickPreview.contacts?.addresses?.length
                  );
                  const hasCountOnlyEvidence = !isContacts && component.count > 0 && namedCount === 0;
                  const manualOnly = Boolean(component.manualOnly);
                  const summaryValue = isContacts
                    ? (hasContacts ? copy.contactsFound : "—")
                    : manualOnly || hasCountOnlyEvidence
                      ? "—"
                      : String(namedCount || 0);
                  const summaryText = isContacts
                    ? (hasContacts ? copy.discoveredOnSite : copy.notFound)
                    : manualOnly || hasCountOnlyEvidence
                      ? copy.manualConfiguration
                      : namedCount
                        ? `${copy.found}: ${namedCount}${component.needsOnboarding ? ` · ${copy.manualConfiguration}` : ""}`
                        : copy.notFound;
                  return (
                    <details key={component.domain} className="v2-card-soft group p-4">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="v2-muted text-xs font-bold uppercase tracking-[0.12em]">{domainLabel(component.domain, lang)}</p>
                            <p className={`mt-2 font-semibold ${isContacts ? "text-base" : "text-2xl"}`}>{summaryValue}</p>
                            <p className="v2-muted mt-1 text-xs">{summaryText}</p>
                          </div>
                          <span className="v2-muted text-xs">{copy.openCard}</span>
                        </div>
                      </summary>
                      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--v2-line)" }}>
                        {isContacts ? (
                          <div className="space-y-2 text-sm">
                            {(quickPreview.contacts?.phones || []).map((phone) => <p key={`phone:${phone}`}><strong>{lang === "bg" ? "Телефон" : "Phone"}:</strong> {phone}</p>)}
                            {(quickPreview.contacts?.emails || []).map((email) => <p key={`email:${email}`}><strong>Email:</strong> {email}</p>)}
                            {(quickPreview.contacts?.addresses || []).map((address) => <p key={`address:${address}`}><strong>{lang === "bg" ? "Адрес" : "Address"}:</strong> {address}</p>)}
                            {quickPreview.contacts?.website ? <p className="break-all"><strong>Web:</strong> {quickPreview.contacts.website}</p> : null}
                            {!hasContacts ? <p className="v2-muted">{copy.notFound}</p> : null}
                          </div>
                        ) : component.items?.length ? (
                          <div className="space-y-2">
                            {component.items.map((item, index) => (
                              <div key={`${component.domain}:${item.name}:${index}`} className="v2-card p-3">
                                <p className="text-sm font-semibold">{item.name}</p>
                                {component.domain === "gastronomy" ? (
                                  <p className="v2-muted mt-1 text-xs">{item.hours ? `${copy.hours}: ${item.hours}` : copy.hoursMissing}</p>
                                ) : null}
                              </div>
                            ))}
                            {component.needsOnboarding ? <p className="v2-muted text-xs">{copy.manualConfiguration}</p> : null}
                          </div>
                        ) : <p className="v2-muted text-sm">{hasCountOnlyEvidence ? copy.manualConfiguration : copy.notFound}</p>}
                      </div>
                    </details>
                  );
                })}
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
            <span className="v2-pill v2-pill-good">{lang === "bg" ? "ГОТОВО" : "READY"}</span>
            <h2 className="mt-3 text-xl font-bold">{copy.onboardingReady}</h2>
            <p className="v2-muted mt-2 text-sm leading-6">{copy.onboardingHelp}</p>
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
            <h2 className="v2-section-title text-xl">{copy.onboardingSection}</h2>
            <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.onboardingHelp}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {(result.completeness?.domains || []).map((domain) => {
                const inventoryLayer = domain.inventory || {
                  status: domain.status,
                  reason: domain.reason,
                  expected: domain.expected,
                  extracted: domain.extracted,
                  missingItems: domain.missingItems || [],
                };
                const inventoryReady = inventoryLayer.status === "COMPLETE";
                const notDiscovered = domain.status === "NOT_DISCOVERED";
                const label = notDiscovered ? copy.notFound : inventoryReady ? copy.discoveredOnSite : copy.needsReview;
                return (
                  <article key={domain.domain} className="v2-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{domainLabel(domain.domain, lang)}</h3>
                        <p className="v2-muted mt-1 text-sm">
                          {notDiscovered ? copy.notFound : `${copy.found}: ${inventoryLayer.extracted}/${inventoryLayer.expected ?? "?"}`}
                        </p>
                      </div>
                      <span className={`v2-pill ${inventoryReady ? "v2-pill-good" : notDiscovered ? "v2-pill-info" : "v2-pill-warn"}`}>{label}</span>
                    </div>
                    {!notDiscovered && inventoryReady && domain.content?.status === "ONBOARDING_REQUIRED" ? (
                      <p className="v2-muted mt-3 text-xs">{copy.manualSetup}</p>
                    ) : null}
                    {inventoryLayer.missingItems?.length ? (
                      <div className="mt-3 space-y-2">
                        {inventoryLayer.missingItems.map((item) => (
                          <p key={item.id} className="v2-card-soft p-2 text-xs">{item.nameHint || item.url || item.id}</p>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <HotelScannerV2ReviewWorkspace
            sections={result.reviewSections}
            candidate={result.intelligenceCandidate}
            documents={result.documents?.documents}
            lang={lang}
          />

          <details className="v2-details v2-panel p-5 sm:p-6">
            <summary className="cursor-pointer font-bold">{copy.technical}</summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map(([label, value]) => (
                <div key={`tech:${label}`} className="v2-card-soft p-3">
                  <p className="v2-muted text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p>
                  <p className="mt-2 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="v2-muted mt-4 text-xs">{blockers.length ? blockers.join(" · ") : copy.noBlockers}</p>
          </details>
        </>
      ) : null}
    </div>
  );
}
