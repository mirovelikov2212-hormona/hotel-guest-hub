"use client";

import { useState, type ReactNode } from "react";
import HotelScannerHubResults from "@/app/hotel-scanner/HotelScannerHubResults";
import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";

type VerificationStatus = "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT" | "UNSCORED";
type ScanFact = { category: string; subject?: string; attribute?: string; label: string; value: string; confidence: number; sourceUrls: string[]; verification?: { status?: VerificationStatus; independentSourceCount?: number; sourceUrls?: string[] } };
type ScanProfile = {
  schemaVersion: string;
  source: { requestedUrl: string; canonicalUrl: string; scannedAt: string; pageCount: number };
  identity: { hotelName: string; summary: string; address: string; city: string; country: string; bookingUrl: string; contactUrl: string };
  contacts: { phones: string[]; emails: string[]; socialLinks: string[] };
  operations: { checkIn: string; checkOut: string; languages: string[] };
  hospitality: { roomTypes: string[]; amenities: string[]; venues: Array<{ name: string; type: string; hours: string; summary: string }>; spaServices: string[]; policies: string[] };
  brand: { logoUrls: string[]; imageUrls: string[]; colors: string[]; fonts: string[]; styleKeywords: string[] };
  facts: ScanFact[]; uncertainties: string[];
};
type FactoryBlueprint = { rooms?: unknown[]; venues?: unknown[]; services?: unknown[]; policies?: unknown[]; operations?: unknown[]; amenities?: unknown[] };
type ProfessionalIntelligencePackage = HotelIntelligencePackage & { pipelineVersion?: string; factoryBlueprint?: FactoryBlueprint; readiness: HotelIntelligencePackage["readiness"] & { verifiedFactCount?: number; singleSourceFactCount?: number; conflictFactCount?: number; humanReviewResolved?: boolean } };
type ScanResult = { ok?: boolean; error?: string; draft?: boolean; lang?: "bg" | "en"; profile?: ScanProfile; intelligencePackage?: ProfessionalIntelligencePackage; verification?: { verifiedFactCount?: number; singleSourceFactCount?: number; conflictFactCount?: number; conflictGroupCount?: number }; diagnostics?: { model?: string; pageCount?: number } };

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";
const COPY = {
  bg: {
    title: "AI сканиране на хотелски сайт", help: "StayHub обхожда публичните хотелски страници и подготвя компактно Hub-ready съдържание за Design Studio и Factory.", url: "Хотелски уеб сайт", placeholder: "https://hotel-example.com", scan: "Сканирай сайта", scanning: "Професионално сканиране и AI анализ…", draft: "ЧЕРНОВА · нищо не е публикувано", publicOnly: "САМО ПУБЛИЧНИ БИЗНЕС ДАННИ", identity: "Хотел", pages: "Сканирани страници", aiModel: "AI модел", schema: "Схема", intelligence: "Hotel Intelligence Package", verified: "Проверени", singleSource: "Един източник", conflicts: "Конфликти", hubCandidates: "Hub кандидати", reviewRequired: "Човешки преглед", openDesignStudio: "Отвори в Design Studio", handoffHelp: "Структурираната чернова се предава към Design Studio. Нищо не се активира автоматично.", brand: "Дизайн сигнали", colors: "Бранд цветове", fonts: "Шрифтове", style: "Стил", images: "Изображения", logos: "Лога", uncertainties: "Изисква човешки преглед", failed: "Сканирането не завърши успешно.", next: "След човешки преглед и approval същият immutable Intelligence Package продължава към Design Studio и Factory.",
    metricHelp: {
      verified: "Факти, потвърдени от поне 2 независими публични източника.",
      singleSource: "Факти с един надежден публичен източник; могат да се използват в Hub draft-а.",
      conflicts: "Реални противоречия за един и същ гост-facing факт, които трябва да се решат.",
      hubCandidates: "Факти, които Scanner-ът е подготвил за автоматично структуриране в Hub / Design Studio.",
      reviewRequired: "Само оставащите видими въпроси и конфликти, които изискват решение от човек.",
    },
  },
  en: {
    title: "AI hotel website scan", help: "StayHub crawls public hotel pages and prepares compact Hub-ready content for Design Studio and Factory.", url: "Hotel website", placeholder: "https://hotel-example.com", scan: "Scan website", scanning: "Professional crawl and AI analysis…", draft: "DRAFT · nothing has been published", publicOnly: "PUBLIC BUSINESS DATA ONLY", identity: "Hotel", pages: "Scanned pages", aiModel: "AI model", schema: "Schema", intelligence: "Hotel Intelligence Package", verified: "Verified", singleSource: "Single source", conflicts: "Conflicts", hubCandidates: "Hub candidates", reviewRequired: "Human review", openDesignStudio: "Open in Design Studio", handoffHelp: "The structured draft is handed to Design Studio. Nothing is activated automatically.", brand: "Design signals", colors: "Brand colors", fonts: "Fonts", style: "Style", images: "Images", logos: "Logos", uncertainties: "Human review required", failed: "The scan did not complete successfully.", next: "After human review and approval, the same immutable Intelligence Package continues to Design Studio and Factory.",
    metricHelp: {
      verified: "Facts corroborated by at least 2 independent public sources.",
      singleSource: "Facts backed by one reliable public source; usable in the Hub draft.",
      conflicts: "Real contradictions about the same guest-facing fact that require a decision.",
      hubCandidates: "Facts prepared by the Scanner for automatic Hub / Design Studio structure.",
      reviewRequired: "Only the remaining visible gaps and conflicts that need a human decision.",
    },
  },
} as const;

const inputClass = "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-neutral-600 focus:border-violet-300/60 focus:ring-2 focus:ring-violet-300/10";

function clean(value: string) { return String(value || "").replace(/\s+/g, " ").trim(); }
function formatAddress(identity: ScanProfile["identity"]) { const parts: string[] = []; for (const raw of [identity.address, identity.city, identity.country]) { const value = clean(raw); if (!value) continue; const key = value.toLocaleLowerCase("en-US"); if (parts.some((p) => p.toLocaleLowerCase("en-US").includes(key) || key.includes(p.toLocaleLowerCase("en-US")))) continue; parts.push(value); } return parts.join(", "); }

export default function HotelScannerClient({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function scan() {
    if (!url.trim() || loading) return;
    setLoading(true); setResult(null);
    try {
      const response = await fetch("/api/control-plane/hotel-scanner/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), lang }) });
      setResult((await response.json().catch(() => ({}))) as ScanResult);
    } catch { setResult({ ok: false, error: "network_error" }); }
    finally { setLoading(false); }
  }

  function openDesignStudio() {
    if (!result?.intelligencePackage) return;
    window.sessionStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(result.intelligencePackage));
    window.location.assign(`/design-studio?lang=${lang}`);
  }

  const profile = result?.ok ? result.profile : undefined;
  const intelligencePackage = result?.ok ? result.intelligencePackage : undefined;
  const readiness = intelligencePackage?.readiness;

  return (
    <section className="scanner-surface rounded-[2rem] border border-violet-300/20 bg-neutral-900/85 p-5 shadow-[0_30px_100px_rgba(13,27,42,0.08)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300/80">StayHub Intelligence</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h2><p className="mt-3 text-sm leading-6 text-neutral-400">{copy.help}</p></div>
        <div className="flex flex-wrap gap-2"><span className="rounded-full border border-violet-300/25 bg-violet-300/5 px-3 py-2 text-[10px] font-semibold uppercase text-violet-100">{copy.publicOnly}</span><span className="rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[10px] font-semibold uppercase text-amber-100">{copy.draft}</span></div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="text-sm text-neutral-300">{copy.url}<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void scan(); }} placeholder={copy.placeholder} maxLength={2048} className={`${inputClass} scanner-input mt-2`} /></label>
        <button type="button" onClick={() => void scan()} disabled={loading || !url.trim()} className="rounded-2xl border border-violet-300/45 bg-violet-300/10 px-6 py-3 font-semibold text-violet-50 transition hover:border-violet-200/70 disabled:cursor-not-allowed disabled:opacity-40">{loading ? copy.scanning : copy.scan}</button>
      </div>

      {result && !result.ok ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-100">{copy.failed} <span className="font-mono text-xs">{result.error || "scanner_failed"}</span></div> : null}

      {profile ? <div className="mt-6 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label={copy.identity} value={profile.identity.hotelName || "—"} /><Metric label={copy.pages} value={String(profile.source.pageCount)} /><Metric label={copy.aiModel} value={result?.diagnostics?.model || "—"} /><Metric label={copy.schema} value={intelligencePackage?.pipelineVersion || profile.schemaVersion} /></div>

        {intelligencePackage && readiness ? <Card title={copy.intelligence}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <LayerMetric label={copy.verified} value={readiness.verifiedFactCount ?? result?.verification?.verifiedFactCount ?? 0} help={copy.metricHelp.verified} />
            <LayerMetric label={copy.singleSource} value={readiness.singleSourceFactCount ?? result?.verification?.singleSourceFactCount ?? 0} help={copy.metricHelp.singleSource} />
            <LayerMetric label={copy.conflicts} value={result?.verification?.conflictGroupCount ?? readiness.conflictFactCount ?? 0} help={copy.metricHelp.conflicts} />
            <LayerMetric label={copy.hubCandidates} value={readiness.hubCandidateCount} help={copy.metricHelp.hubCandidates} />
            <LayerMetric label={copy.reviewRequired} value={profile.uncertainties.length} help={copy.metricHelp.reviewRequired} />
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-violet-300/20 bg-violet-300/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-2xl text-xs leading-5 text-neutral-400">{copy.handoffHelp}</p><button type="button" onClick={openDesignStudio} className="rounded-2xl border border-violet-300/40 bg-violet-300/10 px-4 py-3 text-sm font-semibold text-violet-100">{copy.openDesignStudio}</button></div>
        </Card> : null}

        <HotelScannerHubResults facts={profile.facts} contacts={profile.contacts} address={formatAddress(profile.identity)} scannedAt={profile.source.scannedAt} lang={lang} />

        <Card title={copy.brand}><BrandPalette label={copy.colors} colors={profile.brand.colors} /><Field label={copy.fonts} value={profile.brand.fonts.join(", ")} /><Field label={copy.style} value={profile.brand.styleKeywords.join(", ")} /><Field label={copy.images} value={String(profile.brand.imageUrls.length)} /><Field label={copy.logos} value={String(profile.brand.logoUrls.length)} /></Card>
        {profile.uncertainties.length > 0 ? <Card title={copy.uncertainties}><ul className="space-y-2 text-sm text-neutral-400">{profile.uncertainties.map((item, index) => <li key={`${item}:${index}`}>• {item}</li>)}</ul></Card> : null}
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/5 px-4 py-3 text-sm text-violet-100/80">{copy.next}</div>
      </div> : null}
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="scanner-subsection rounded-2xl border border-white/5 bg-black/15 p-4"><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{title}</h3><div className="mt-3 space-y-3">{children}</div></section>; }
function Field({ label, value }: { label: string; value: string }) { if (!value) return null; return <div><p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">{label}</p><p className="mt-1 text-sm leading-6 text-neutral-200">{value}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="scanner-metric rounded-2xl border border-white/5 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</p><p className="mt-2 break-words text-sm font-semibold text-neutral-100">{value}</p></div>; }
function LayerMetric({ label, value, help }: { label: string; value: number; help: string }) { return <div className="scanner-layer-metric rounded-2xl border p-4"><p className="scanner-layer-metric-label text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p><p className="scanner-layer-metric-value mt-2 text-2xl font-semibold">{value}</p><p className="scanner-layer-metric-help mt-2 text-[11px] leading-4">{help}</p></div>; }
function BrandPalette({ label, colors }: { label: string; colors: string[] }) { if (!colors.length) return null; return <div><p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">{label}</p><div className="mt-2 flex flex-wrap gap-2">{colors.map((color) => <span key={color} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-neutral-200"><span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: color }} /><span className="font-mono text-[11px] uppercase">{color}</span></span>)}</div></div>; }
