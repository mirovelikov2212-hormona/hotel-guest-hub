"use client";

import { useState, type ReactNode } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";

type VerificationStatus = "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT" | "UNSCORED";

type ScanFact = {
  category: string;
  subject?: string;
  attribute?: string;
  label: string;
  value: string;
  confidence: number;
  sourceUrls: string[];
  verification?: {
    status?: VerificationStatus;
    independentSourceCount?: number;
    sourceUrls?: string[];
  };
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

type FactoryBlueprint = {
  rooms?: unknown[];
  venues?: unknown[];
  services?: unknown[];
  policies?: unknown[];
  operations?: unknown[];
  amenities?: unknown[];
};

type ProfessionalIntelligencePackage = HotelIntelligencePackage & {
  pipelineVersion?: string;
  factoryBlueprint?: FactoryBlueprint;
  readiness: HotelIntelligencePackage["readiness"] & {
    verifiedFactCount?: number;
    singleSourceFactCount?: number;
    conflictFactCount?: number;
    humanReviewResolved?: boolean;
  };
};

type ScanResult = {
  ok?: boolean;
  error?: string;
  draft?: boolean;
  lang?: "bg" | "en";
  profile?: ScanProfile;
  intelligencePackage?: ProfessionalIntelligencePackage;
  verification?: {
    verifiedFactCount?: number;
    singleSourceFactCount?: number;
    conflictFactCount?: number;
    conflictGroupCount?: number;
  };
  privacy?: {
    scope?: string;
    personalProfileEnrichment?: boolean;
    directPersonContactProjection?: boolean;
  };
  diagnostics?: {
    model?: string;
    latencyMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    pageCount?: number;
    stylesheetCount?: number;
    detectedColorCount?: number;
    detectedFontCount?: number;
    detectedSocialLinkCount?: number;
    richFactCount?: number;
    verifiedFactCount?: number;
    singleSourceFactCount?: number;
    conflictFactCount?: number;
    conflictGroupCount?: number;
    privacyFilteredCount?: number;
  };
};

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";

const COPY = {
  bg: {
    title: "AI сканиране на хотелски сайт",
    help: "StayHub обхожда публичните хотелски страници, сравнява независими официални източници, открива конфликти и изгражда структурирана Hotel Intelligence чернова за Hub, Design Studio и Factory.",
    url: "Хотелски уеб сайт",
    placeholder: "https://hotel-example.com",
    scan: "Сканирай сайта",
    scanning: "Професионално сканиране и AI анализ…",
    draft: "ЧЕРНОВА · нищо не е публикувано",
    publicOnly: "САМО ПУБЛИЧНИ БИЗНЕС ДАННИ",
    identity: "Хотел",
    operations: "Оперативни данни",
    hospitality: "Съдържание и услуги",
    brand: "Дизайн сигнали",
    colors: "Бранд цветове",
    fonts: "Шрифтове",
    style: "Стил",
    images: "Изображения",
    logos: "Лога",
    evidence: "Evidence-backed факти",
    uncertainties: "Изисква човешки преглед",
    sourcesOne: "източник",
    sourcesMany: "източника",
    pages: "Сканирани страници",
    aiModel: "AI модел",
    schema: "Схема",
    summary: "Описание",
    address: "Адрес",
    phone: "Телефон",
    email: "Имейл",
    social: "Социални профили",
    checkIn: "Настаняване",
    checkOut: "Освобождаване",
    languages: "Езици",
    rooms: "Типове стаи",
    amenities: "Удобства",
    spa: "СПА / уелнес услуги",
    venues: "Ресторанти и обекти",
    policies: "Политики",
    failed: "Сканирането не завърши успешно.",
    noFacts: "Няма достатъчно доказуеми факти в сканираните страници.",
    next: "След човешки преглед и approval същият immutable Intelligence Package продължава към Design Studio и Factory.",
    intelligence: "Hotel Intelligence Package",
    evidenceLayer: "Evidence Layer",
    profileLayer: "Hotel Profile Layer",
    designLayer: "Design Intelligence Layer",
    factoryLayer: "Factory Blueprint",
    hubCandidates: "Hub кандидати",
    smartSetupCandidates: "Smart Setup кандидати",
    designSignals: "Design сигнали",
    reviewRequired: "За review",
    verified: "Проверени",
    singleSource: "Един източник",
    conflicts: "Конфликти",
    openDesignStudio: "Отвори в Design Studio",
    handoffHelp: "Предава се структурирана чернова с evidence, entity metadata и Factory blueprint. Нищо не се активира автоматично.",
    statusVerified: "ПРОВЕРЕН",
    statusSingle: "1 ИЗТОЧНИК",
    statusConflict: "КОНФЛИКТ",
    statusUnscored: "НЕОЦЕНЕН",
    scanned: "сканирани",
    cited: "цитирани",
    factsLabel: "факта",
    evidenceSources: "Публични доказателства",
  },
  en: {
    title: "AI hotel website scan",
    help: "StayHub crawls public hotel pages, compares independent official sources, detects conflicts and builds structured Hotel Intelligence for Hub, Design Studio and Factory.",
    url: "Hotel website",
    placeholder: "https://hotel-example.com",
    scan: "Scan website",
    scanning: "Professional crawl and AI analysis…",
    draft: "DRAFT · nothing has been published",
    publicOnly: "PUBLIC BUSINESS DATA ONLY",
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
    uncertainties: "Human review required",
    sourcesOne: "source",
    sourcesMany: "sources",
    pages: "Scanned pages",
    aiModel: "AI model",
    schema: "Schema",
    summary: "Summary",
    address: "Address",
    phone: "Phone",
    email: "Email",
    social: "Social profiles",
    checkIn: "Check-in",
    checkOut: "Check-out",
    languages: "Languages",
    rooms: "Room types",
    amenities: "Amenities",
    spa: "SPA / wellness services",
    venues: "Restaurants & venues",
    policies: "Policies",
    failed: "The scan did not complete successfully.",
    noFacts: "No sufficiently supported facts were found in the scanned pages.",
    next: "After human review and approval, the same immutable Intelligence Package continues to Design Studio and Factory.",
    intelligence: "Hotel Intelligence Package",
    evidenceLayer: "Evidence Layer",
    profileLayer: "Hotel Profile Layer",
    designLayer: "Design Intelligence Layer",
    factoryLayer: "Factory Blueprint",
    hubCandidates: "Hub candidates",
    smartSetupCandidates: "Smart Setup candidates",
    designSignals: "Design signals",
    reviewRequired: "Needs review",
    verified: "Verified",
    singleSource: "Single source",
    conflicts: "Conflicts",
    openDesignStudio: "Open in Design Studio",
    handoffHelp: "A structured draft with evidence, entity metadata and Factory blueprint is handed off. Nothing is activated automatically.",
    statusVerified: "VERIFIED",
    statusSingle: "1 SOURCE",
    statusConflict: "CONFLICT",
    statusUnscored: "UNSCORED",
    scanned: "scanned",
    cited: "cited",
    factsLabel: "facts",
    evidenceSources: "Public evidence",
  },
} as const;

const FACT_CATEGORY_COPY = {
  bg: {
    identity: "Идентичност", location: "Локация", contact: "Контакти", operations: "Операции",
    accommodation: "Настаняване", dining: "Хранене", amenities: "Удобства", wellness: "Уелнес",
    events: "Събития", policy: "Политики", sustainability: "Устойчивост", family: "За семейства",
    beach: "Плаж", parking: "Паркинг", services: "Услуги", brand: "Бранд", hotel: "Хотел",
  },
  en: {
    identity: "Identity", location: "Location", contact: "Contact", operations: "Operations",
    accommodation: "Accommodation", dining: "Dining", amenities: "Amenities", wellness: "Wellness",
    events: "Events", policy: "Policy", sustainability: "Sustainability", family: "Family",
    beach: "Beach", parking: "Parking", services: "Services", brand: "Brand", hotel: "Hotel",
  },
} as const;

const LANGUAGE_LABELS: Record<ControlPlaneLang, Record<string, string>> = {
  bg: { bg: "Български", en: "Английски", de: "Немски", ro: "Румънски", mk: "Македонски", ru: "Руски", cs: "Чешки", tr: "Турски", el: "Гръцки" },
  en: { bg: "Bulgarian", en: "English", de: "German", ro: "Romanian", mk: "Macedonian", ru: "Russian", cs: "Czech", tr: "Turkish", el: "Greek" },
};

const LANGUAGE_ALIASES: Record<string, string> = {
  bg: "bg", bulgarian: "bg", "български": "bg",
  en: "en", english: "en", "английски": "en",
  de: "de", german: "de", deutsch: "de", "немски": "de",
  ro: "ro", romanian: "ro", "română": "ro", romana: "ro", "румънски": "ro",
  mk: "mk", macedonian: "mk", "македонски": "mk",
  ru: "ru", russian: "ru", "русский": "ru", "руски": "ru",
  cs: "cs", cz: "cs", czech: "cs", "čeština": "cs", "чешки": "cs",
  tr: "tr", turkish: "tr", "türkçe": "tr", "турски": "tr",
  el: "el", greek: "el", "ελληνικά": "el", "гръцки": "el",
};

const inputClass = "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-neutral-600 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10";

function normalized(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function formatLanguages(values: string[], lang: ControlPlaneLang) {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of values) {
    for (const part of String(raw || "").split(/[,;/|]+/)) {
      const cleaned = normalized(part);
      if (!cleaned) continue;
      const code = LANGUAGE_ALIASES[cleaned] || cleaned;
      if (seen.has(code)) continue;
      seen.add(code);
      labels.push(LANGUAGE_LABELS[lang][code] || part.trim());
    }
  }
  return labels.join(", ");
}

function formatAddress(identity: ScanProfile["identity"]) {
  const parts: string[] = [];
  for (const raw of [identity.address, identity.city, identity.country]) {
    const value = String(raw || "").replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = normalized(value);
    if (parts.some((part) => normalized(part).includes(key) || key.includes(normalized(part)))) continue;
    parts.push(value);
  }
  return parts.join(", ");
}

function blueprintCount(blueprint?: FactoryBlueprint) {
  if (!blueprint) return 0;
  return [blueprint.rooms, blueprint.venues, blueprint.services, blueprint.policies, blueprint.operations, blueprint.amenities]
    .reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
}

function evidenceUrlLabel(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return rawUrl;
  }
}

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
  const readiness = intelligencePackage?.readiness;

  return (
    <section className="scanner-surface rounded-[2rem] border border-cyan-300/15 bg-neutral-900/85 p-5 shadow-[0_30px_100px_rgba(6,182,212,0.06)] backdrop-blur-xl sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/70">StayHub Intelligence</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-400">{copy.help}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="w-fit rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100">{copy.publicOnly}</span>
          <span className="w-fit rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">{copy.draft}</span>
        </div>
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
            className={`${inputClass} scanner-input mt-2`}
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
            <Metric label={copy.schema} value={intelligencePackage?.pipelineVersion || profile.schemaVersion} />
          </div>

          {intelligencePackage && readiness && (
            <Card title={copy.intelligence}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <LayerMetric label={copy.evidenceLayer} value={readiness.evidenceFactCount} />
                <LayerMetric label={copy.verified} value={readiness.verifiedFactCount ?? result?.verification?.verifiedFactCount ?? 0} />
                <LayerMetric label={copy.singleSource} value={readiness.singleSourceFactCount ?? result?.verification?.singleSourceFactCount ?? 0} />
                <LayerMetric label={copy.conflicts} value={result?.verification?.conflictGroupCount ?? readiness.conflictFactCount ?? 0} />
                <LayerMetric label={copy.hubCandidates} value={readiness.hubCandidateCount} />
                <LayerMetric label={copy.smartSetupCandidates} value={readiness.smartSetupCandidateCount} />
                <LayerMetric label={copy.designSignals} value={readiness.designSignalCount} />
                <LayerMetric label={copy.reviewRequired} value={readiness.reviewRequiredCount} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <LayerDescription title={copy.evidenceLayer} text={`${profile.source.pageCount} ${copy.scanned} · ${intelligencePackage.evidenceLayer.sourceUrls.length} ${copy.cited} · ${intelligencePackage.evidenceLayer.facts.length} ${copy.factsLabel}`} />
                <LayerDescription title={copy.profileLayer} text={profile.identity.hotelName || "—"} />
                <LayerDescription title={copy.designLayer} text={`${profile.brand.colors.length} colors · ${profile.brand.fonts.length} fonts · ${profile.brand.imageUrls.length} images`} />
                <LayerDescription title={copy.factoryLayer} text={`${blueprintCount(intelligencePackage.factoryBlueprint)} structured entities`} />
              </div>
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-violet-300/15 bg-violet-300/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-xs leading-5 text-neutral-400">{copy.handoffHelp}</p>
                <button type="button" onClick={openDesignStudio} className="shrink-0 rounded-2xl border border-violet-300/35 bg-violet-300/10 px-4 py-3 text-sm font-semibold text-violet-100 transition hover:border-violet-200/60">
                  {copy.openDesignStudio}
                </button>
              </div>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={copy.identity}>
              <Field label={copy.summary} value={profile.identity.summary} />
              <Field label={copy.address} value={formatAddress(profile.identity)} />
              <Field label={copy.phone} value={profile.contacts.phones.join(" · ")} />
              <Field label={copy.email} value={profile.contacts.emails.join(" · ")} />
              <SocialLinks label={copy.social} links={profile.contacts.socialLinks} />
            </Card>
            <Card title={copy.operations}>
              <Field label={copy.checkIn} value={profile.operations.checkIn} />
              <Field label={copy.checkOut} value={profile.operations.checkOut} />
              <Field label={copy.languages} value={formatLanguages(profile.operations.languages, lang)} />
              <Field label={copy.rooms} value={profile.hospitality.roomTypes.join(", ")} />
            </Card>
            <Card title={copy.hospitality}>
              <Field label={copy.amenities} value={profile.hospitality.amenities.join(", ")} />
              <Field label={copy.spa} value={profile.hospitality.spaServices.join(", ")} />
              <Field label={copy.venues} value={profile.hospitality.venues.map((venue) => venue.hours ? `${venue.name} (${venue.hours})` : venue.name).join(", ")} />
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
                  <FactCard key={`${fact.category}:${fact.subject || ""}:${fact.attribute || ""}:${fact.label}:${index}`} fact={fact} lang={lang} copy={copy} />
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

function FactCard({ fact, lang, copy }: { fact: ScanFact; lang: ControlPlaneLang; copy: typeof COPY.bg | typeof COPY.en }) {
  const status = fact.verification?.status || "UNSCORED";
  const statusLabel = status === "VERIFIED" ? copy.statusVerified
    : status === "SINGLE_SOURCE" ? copy.statusSingle
      : status === "CONFLICT" ? copy.statusConflict
        : copy.statusUnscored;
  const statusClass = status === "VERIFIED" ? "border-emerald-300/25 text-emerald-200"
    : status === "CONFLICT" ? "border-rose-300/30 text-rose-200"
      : status === "SINGLE_SOURCE" ? "border-amber-300/25 text-amber-200"
        : "border-white/10 text-neutral-500";
  const sourceUrls = fact.verification?.sourceUrls?.length ? fact.verification.sourceUrls : fact.sourceUrls;

  return (
    <div className={`scanner-evidence-card rounded-2xl border bg-black/20 p-4 ${status === "CONFLICT" ? "border-rose-300/20" : "border-white/5"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/60">{factCategoryLabel(fact.category, lang)}</p>
          <p className="mt-1 text-sm font-semibold text-neutral-200">{fact.label}</p>
          {(fact.subject || fact.attribute) && <p className="mt-1 text-[10px] text-neutral-600">{[fact.subject, fact.attribute].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span>
          <span className="text-[10px] text-neutral-600">{Math.round(fact.confidence * 100)}%</span>
        </div>
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-neutral-400">{fact.value}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-[10px] font-semibold text-neutral-500">
          {copy.evidenceSources} · {sourceUrls.length} {sourceUrls.length === 1 ? copy.sourcesOne : copy.sourcesMany}
        </summary>
        <div className="mt-2 space-y-1.5">
          {sourceUrls.map((sourceUrl) => (
            <a key={sourceUrl} href={sourceUrl} target="_blank" rel="noreferrer" className="block break-all text-[10px] text-cyan-300/75 underline decoration-cyan-300/30 underline-offset-2 hover:text-cyan-200">
              {evidenceUrlLabel(sourceUrl)}
            </a>
          ))}
        </div>
      </details>
    </div>
  );
}

function factCategoryLabel(category: string, lang: ControlPlaneLang) {
  const key = category.trim().toLowerCase() as keyof typeof FACT_CATEGORY_COPY.bg;
  return FACT_CATEGORY_COPY[lang][key] || category;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="scanner-subsection rounded-3xl border border-white/5 bg-black/15 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return <div><p className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">{label}</p><p className="mt-1 text-sm leading-6 text-neutral-300">{value}</p></div>;
}

function SocialLinks({ label, links }: { label: string; links: string[] }) {
  if (!links.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((link) => {
          let host = link;
          try { host = new URL(link).hostname.replace(/^www\./, ""); } catch { /* keep URL as label */ }
          return <a key={link} href={link} target="_blank" rel="noreferrer" className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.05] px-2.5 py-1.5 text-xs font-semibold text-cyan-100/80 transition hover:border-cyan-300/40">{host}</a>;
        })}
      </div>
    </div>
  );
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
  return <div className="scanner-metric rounded-2xl border border-white/5 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-neutral-600">{label}</p><p className="mt-2 break-words text-sm font-semibold text-neutral-200">{value}</p></div>;
}

function LayerMetric({ label, value }: { label: string; value: number }) {
  return <div className="scanner-layer-metric rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.03] p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/50">{label}</p><p className="mt-2 text-2xl font-semibold text-neutral-100">{value}</p></div>;
}

function LayerDescription({ title, text }: { title: string; text: string }) {
  return <div className="scanner-layer-description rounded-2xl border border-white/5 bg-black/20 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{title}</p><p className="mt-2 text-sm text-neutral-300">{text}</p></div>;
}
