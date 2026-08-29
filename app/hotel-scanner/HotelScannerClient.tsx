"use client";

import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";

type ScanFact = {
  category: string;
  label: string;
  value: string;
  confidence: number;
  sourceUrls: string[];
};

type ScanProfile = {
  schemaVersion: string;
  source: { requestedUrl: string; canonicalUrl: string; scannedAt: string; pageCount: number };
  identity: { hotelName: string; summary: string; address: string; city: string; country: string; bookingUrl: string; contactUrl: string };
  contacts: { phones: string[]; emails: string[]; socialLinks: string[] };
  operations: { checkIn: string; checkOut: string; languages: string[] };
  hospitality: {
    roomTypes: string[];
    amenities: string[];
    venues: Array<{ name: string; type: string; hours: string; summary: string }>;
    spaServices: string[];
    policies: string[];
  };
  brand: { logoUrls: string[]; imageUrls: string[]; colors: string[]; fonts: string[]; styleKeywords: string[] };
  facts: ScanFact[];
  uncertainties: string[];
};

type ScanResult = {
  ok?: boolean;
  error?: string;
  draft?: boolean;
  lang?: "bg" | "en";
  profile?: ScanProfile;
  intelligencePackage?: HotelIntelligencePackage;
  diagnostics?: {
    model?: string;
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    pageCount?: number;
    stylesheetCount?: number;
    detectedColorCount?: number;
    detectedFontCount?: number;
  };
};

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";

const COPY = {
  bg: {
    title: "AI сканиране на хотелски сайт",
    help: "Въведи публичния сайт на хотела. StayHub събира само публични страници, извлича доказуеми факти и създава чернова за преглед. Нищо не се прехвърля към Smart Setup или Design Studio без твое действие.",
    url: "Хотелски уеб сайт",
    placeholder: "https://hotel-example.com",
    scan: "Сканирай сайта",
    scanning: "Сканиране и AI анализ…",
    draft: "ЧЕРНОВА · нищо не е публикувано",
    identity: "Хотел",
    operations: "Оперативни данни",
    hospitality: "Съдържание и услуги",
    brand: "Дизайн сигнали",
    colors: "Бранд цветове",
    fonts: "Шрифтове",
    style: "Стил",
    images: "Изображения",
    logos: "Лога",
    evidence: "Доказани факти",
    uncertainties: "За проверка",
    sourcesOne: "източник",
    sourcesMany: "източника",
    pages: "Страници",
    aiModel: "AI модел",
    schema: "Схема",
    summary: "Описание",
    address: "Адрес",
    phone: "Телефон",
    email: "Имейл",
    checkIn: "Настаняване",
    checkOut: "Освобождаване",
    languages: "Езици",
    rooms: "Стаи",
    amenities: "Удобства",
    spa: "СПА",
    venues: "Обекти",
    policies: "Политики",
    failed: "Сканирането не завърши успешно.",
    noFacts: "Няма достатъчно доказуеми факти в сканираните страници.",
    next: "След преглед тази чернова може изрично да се подаде към Smart Setup / Design Studio.",
    intelligence: "Hotel Intelligence Package",
    evidenceLayer: "Evidence Layer",
    profileLayer: "Hotel Profile Layer",
    designLayer: "Design Intelligence Layer",
    hubCandidates: "Hub кандидати",
    smartSetupCandidates: "Smart Setup кандидати",
    designSignals: "Design сигнали",
    reviewRequired: "За review",
    openDesignStudio: "Отвори в Design Studio",
    handoffHelp: "Package-ът се прехвърля само локално като чернова. Не се създава хотел и нищо не се публикува.",
  },
  en: {
    title: "AI hotel website scan",
    help: "Enter the hotel's public website. StayHub reads public pages only, extracts evidence-backed facts and creates a review draft. Nothing is sent to Smart Setup or Design Studio without your action.",
    url: "Hotel website",
    placeholder: "https://hotel-example.com",
    scan: "Scan website",
    scanning: "Scanning and AI analysis…",
    draft: "DRAFT · nothing has been published",
    identity: "Hotel",
    operations: "Operations",
    hospitality: "Content & services",
    brand: "Design signals",
    colors: "Brand colors",
    fonts: "Fonts",
    style: "Style",
    images: "Images",
    logos: "Logos",
    evidence: "Evidence-backed facts",
    uncertainties: "Needs review",
    sourcesOne: "source",
    sourcesMany: "sources",
    pages: "Pages",
    aiModel: "AI model",
    schema: "Schema",
    summary: "Summary",
    address: "Address",
    phone: "Phone",
    email: "Email",
    checkIn: "Check-in",
    checkOut: "Check-out",
    languages: "Languages",
    rooms: "Rooms",
    amenities: "Amenities",
    spa: "SPA",
    venues: "Venues",
    policies: "Policies",
    failed: "The scan did not complete successfully.",
    noFacts: "No sufficiently supported facts were found in the scanned pages.",
    next: "After review, this draft can be explicitly sent to Smart Setup / Design Studio.",
    intelligence: "Hotel Intelligence Package",
    evidenceLayer: "Evidence Layer",
    profileLayer: "Hotel Profile Layer",
    designLayer: "Design Intelligence Layer",
    hubCandidates: "Hub candidates",
    smartSetupCandidates: "Smart Setup candidates",
    designSignals: "Design signals",
    reviewRequired: "Needs review",
    openDesignStudio: "Open in Design Studio",
    handoffHelp: "The package is handed off locally as a draft only. No hotel is created and nothing is published.",
  },
} as const;

const FACT_CATEGORY_COPY = {
  bg: {
    identity: "Идентичност",
    location: "Локация",
    contact: "Контакти",
    operations: "Операции",
    accommodation: "Настаняване",
    dining: "Хранене",
    amenities: "Удобства",
    wellness: "Уелнес",
    events: "Събития",
    policy: "Политики",
    sustainability: "Устойчивост",
    family: "За семейства",
    beach: "Плаж",
    parking: "Паркинг",
    services: "Услуги",
    brand: "Бранд",
    hotel: "Хотел",
  },
  en: {
    identity: "Identity",
    location: "Location",
    contact: "Contact",
    operations: "Operations",
    accommodation: "Accommodation",
    dining: "Dining",
    amenities: "Amenities",
    wellness: "Wellness",
    events: "Events",
    policy: "Policy",
    sustainability: "Sustainability",
    family: "Family",
    beach: "Beach",
    parking: "Parking",
    services: "Services",
    brand: "Brand",
    hotel: "Hotel",
  },
} as const;

const inputClass = "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-neutral-600 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10";

export default function HotelScannerClient({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function scan() {
    if (!url.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/control-plane/hotel-scanner/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      const payload = (await response.json().catch(() => ({}))) as ScanResult;
      setResult(payload);
    } catch {
      setResult({ ok: false, error: "network_error" });
    } finally {
      setLoading(false);
    }
  }

  function openDesignStudio() {
    if (!result?.intelligencePackage) return;
    window.sessionStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(result.intelligencePackage));
    window.location.assign(`/design-studio?lang=${lang}`);
  }

  const profile = result?.ok ? result.profile : undefined;
  const intelligencePackage = result?.ok ? result.intelligencePackage : undefined;

  return (
    <section className="rounded-[2rem] border border-cyan-300/15 bg-neutral-900/85 p-5 shadow-[0_30px_100px_rgba(6,182,212,0.06)] backdrop-blur-xl sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/70">StayHub Intelligence</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-400">{copy.help}</p>
        </div>
        <span className="w-fit rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">{copy.draft}</span>
      </div>

      <div className="mt-7 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="text-sm text-neutral-300">
          {copy.url}
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void scan(); }}
            placeholder={copy.placeholder}
            maxLength={2048}
            className={`${inputClass} mt-2`}
          />
        </label>
        <button
          type="button"
          onClick={() => { void scan(); }}
          disabled={loading || !url.trim()}
          className="rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-6 py-3 font-semibold text-cyan-50 transition hover:border-cyan-200/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? copy.scanning : copy.scan}
        </button>
      </div>

      {result && !result.ok && (
        <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-100">
          {copy.failed} <span className="font-mono text-xs text-rose-200/70">{result.error || "scanner_failed"}</span>
        </div>
      )}

      {profile && (
        <div className="mt-7 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={copy.identity} value={profile.identity.hotelName || "—"} />
            <Metric label={copy.pages} value={String(profile.source.pageCount)} />
            <Metric label={copy.aiModel} value={result?.diagnostics?.model || "—"} />
            <Metric label={copy.schema} value={profile.schemaVersion} />
          </div>

          {intelligencePackage && (
            <Card title={copy.intelligence}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <LayerMetric label={copy.evidenceLayer} value={intelligencePackage.readiness.evidenceFactCount} />
                <LayerMetric label={copy.hubCandidates} value={intelligencePackage.readiness.hubCandidateCount} />
                <LayerMetric label={copy.smartSetupCandidates} value={intelligencePackage.readiness.smartSetupCandidateCount} />
                <LayerMetric label={copy.designSignals} value={intelligencePackage.readiness.designSignalCount} />
                <LayerMetric label={copy.reviewRequired} value={intelligencePackage.readiness.reviewRequiredCount} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <LayerDescription title={copy.evidenceLayer} text={`${intelligencePackage.evidenceLayer.sourceUrls.length} URLs · ${intelligencePackage.evidenceLayer.facts.length} facts`} />
                <LayerDescription title={copy.profileLayer} text={profile.identity.hotelName || "—"} />
                <LayerDescription title={copy.designLayer} text={`${profile.brand.colors.length} colors · ${profile.brand.fonts.length} fonts`} />
              </div>
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-violet-300/15 bg-violet-300/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-xs leading-5 text-neutral-400">{copy.handoffHelp}</p>
                <button
                  type="button"
                  onClick={openDesignStudio}
                  className="shrink-0 rounded-2xl border border-violet-300/35 bg-violet-300/10 px-4 py-3 text-sm font-semibold text-violet-100 transition hover:border-violet-200/60"
                >
                  {copy.openDesignStudio}
                </button>
              </div>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={copy.identity}>
              <Field label={copy.summary} value={profile.identity.summary} />
              <Field label={copy.address} value={[profile.identity.address, profile.identity.city, profile.identity.country].filter(Boolean).join(", ")} />
              <Field label={copy.phone} value={profile.contacts.phones.join(" · ")} />
              <Field label={copy.email} value={profile.contacts.emails.join(" · ")} />
            </Card>
            <Card title={copy.operations}>
              <Field label={copy.checkIn} value={profile.operations.checkIn} />
              <Field label={copy.checkOut} value={profile.operations.checkOut} />
              <Field label={copy.languages} value={profile.operations.languages.join(", ")} />
              <Field label={copy.rooms} value={profile.hospitality.roomTypes.join(", ")} />
            </Card>
            <Card title={copy.hospitality}>
              <Field label={copy.amenities} value={profile.hospitality.amenities.join(", ")} />
              <Field label={copy.spa} value={profile.hospitality.spaServices.join(", ")} />
              <Field label={copy.venues} value={profile.hospitality.venues.map((venue) => venue.name).join(", ")} />
              <Field label={copy.policies} value={profile.hospitality.policies.join(" · ")} />
            </Card>
            <Card title={copy.brand}>
              <BrandPalette label={copy.colors} colors={profile.brand.colors} />
              <Field label={copy.fonts} value={profile.brand.fonts.join(", ")} />
              <Field label={copy.style} value={profile.brand.styleKeywords.join(", ")} />
              <Field label={copy.images} value={String(profile.brand.imageUrls.length)} />
              <Field label={copy.logos} value={String(profile.brand.logoUrls.length)} />
            </Card>
          </div>

          <Card title={`${copy.evidence} · ${profile.facts.length}`}>
            {profile.facts.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {profile.facts.map((fact, index) => (
                  <div key={`${fact.category}:${fact.label}:${index}`} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/60">{factCategoryLabel(fact.category, lang)}</p>
                        <p className="mt-1 text-sm font-semibold text-neutral-200">{fact.label}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-neutral-500">{Math.round(fact.confidence * 100)}%</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-neutral-400">{fact.value}</p>
                    <p className="mt-3 text-[10px] text-neutral-600">{fact.sourceUrls.length} {fact.sourceUrls.length === 1 ? copy.sourcesOne : copy.sourcesMany}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-neutral-500">{copy.noFacts}</p>}
          </Card>

          {profile.uncertainties.length > 0 && (
            <Card title={copy.uncertainties}>
              <ul className="space-y-2 text-sm text-neutral-400">
                {profile.uncertainties.map((item, index) => <li key={`${item}:${index}`}>• {item}</li>)}
              </ul>
            </Card>
          )}

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-4 text-sm text-emerald-100/80">
            {copy.next}
          </div>
        </div>
      )}
    </section>
  );
}

function factCategoryLabel(category: string, lang: ControlPlaneLang) {
  const key = category.trim().toLowerCase() as keyof typeof FACT_CATEGORY_COPY.bg;
  return FACT_CATEGORY_COPY[lang][key] || category;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/5 bg-black/15 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <div><p className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">{label}</p><p className="mt-1 text-sm leading-6 text-neutral-300">{value}</p></div>;
}

function BrandPalette({ label, colors }: { label: string; colors: string[] }) {
  if (!colors.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {colors.map((color) => (
          <span key={color} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-neutral-300">
            <span className="h-4 w-4 rounded-full border border-white/20 shadow-inner" style={{ backgroundColor: color }} aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase">{color}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/5 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-neutral-600">{label}</p><p className="mt-2 break-words text-sm font-semibold text-neutral-200">{value}</p></div>;
}

function LayerMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.03] p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/50">{label}</p><p className="mt-2 text-2xl font-semibold text-neutral-100">{value}</p></div>;
}

function LayerDescription({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-white/5 bg-black/20 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{title}</p><p className="mt-2 text-sm text-neutral-300">{text}</p></div>;
}
