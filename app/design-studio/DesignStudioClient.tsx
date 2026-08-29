"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import HubLivePreview from "./HubLivePreview";
import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligenceItem, HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";

const COPY = {
  bg: {
    eyebrow: "StayHub Design Intelligence",
    title: "Hub Design Studio",
    subtitle: "Професионална работна зона за превръщане на Hotel Intelligence Package в дизайн, съдържание и информационна архитектура на Hub-а.",
    draft: "DESIGN DRAFT · нищо не е публикувано",
    noPackage: "Няма подаден Hotel Intelligence Package.",
    noPackageHelp: "Сканирай хотелски сайт и използвай „Отвори в Design Studio“, за да подадеш review draft-а тук.",
    scanner: "Отвори AI Hotel Scanner",
    hotel: "Хотел",
    evidence: "Evidence Layer",
    profile: "Hotel Profile Layer",
    design: "Design Intelligence Layer",
    hubQueue: "Hub content candidates",
    setupQueue: "Smart Setup candidates",
    reviewQueue: "Review required",
    colors: "Бранд цветове",
    fonts: "Шрифтове",
    style: "Стилови сигнали",
    images: "Image references",
    logos: "Logo references",
    authorization: "Визуалните assets са reference-only до предоставяне/одобрение от хотела.",
    profileInfo: "Нормализиран профил",
    rooms: "Типове стаи",
    venues: "Обекти",
    amenities: "Удобства",
    policies: "Политики",
    contacts: "Контакти",
    socialProfiles: "Социални профили",
    source: "Източник",
    clear: "Изчисти черновата",
    next: "Live Hub preview-ът е design чернова. След review ще може изрично да се материализира към Hotel Factory, но не се публикува автоматично.",
    candidate: "кандидат",
    review: "review",
    workflow: "Работен поток и ownership",
    workflowHelp: "Design Studio оформя Hub-а. Hotel Factory държи оперативната истина, която реално захранва runtime-а.",
    designOwner: "Design Studio",
    designOwnerText: "Дизайн, цветове, типография, секции, подредба, Hub content selection и draft информация.",
    factoryOwner: "Hotel Factory",
    factoryOwnerText: "Реални venues, стаи, услуги, работни времена, контакти, departments, credentials и runtime настройки.",
    factoryAction: "Отвори Hotel Factory",
    factoryBoundary: "В този етап бутонът само отваря Factory. Автоматичният package materialization ще бъде отделно изрично действие.",
    stepScan: "1 · Scan",
    stepReview: "2 · Review",
    stepDesign: "3 · Design",
    stepFactory: "4 · Factory",
    stepSandbox: "5 · Sandbox",
    stepLive: "6 · Live",
    current: "текущо",
    locked: "изрично действие",
  },
  en: {
    eyebrow: "StayHub Design Intelligence",
    title: "Hub Design Studio",
    subtitle: "A professional workspace for turning a Hotel Intelligence Package into Hub design, content and information architecture.",
    draft: "DESIGN DRAFT · nothing is published",
    noPackage: "No Hotel Intelligence Package has been handed off.",
    noPackageHelp: "Scan a hotel website and use “Open in Design Studio” to hand the review draft to this workspace.",
    scanner: "Open AI Hotel Scanner",
    hotel: "Hotel",
    evidence: "Evidence Layer",
    profile: "Hotel Profile Layer",
    design: "Design Intelligence Layer",
    hubQueue: "Hub content candidates",
    setupQueue: "Smart Setup candidates",
    reviewQueue: "Review required",
    colors: "Brand colors",
    fonts: "Fonts",
    style: "Style signals",
    images: "Image references",
    logos: "Logo references",
    authorization: "Visual assets remain reference-only until supplied or approved by the hotel.",
    profileInfo: "Normalized profile",
    rooms: "Room types",
    venues: "Venues",
    amenities: "Amenities",
    policies: "Policies",
    contacts: "Contacts",
    socialProfiles: "Social profiles",
    source: "Source",
    clear: "Clear draft",
    next: "The Live Hub preview is a design draft. After review it can be explicitly materialized into Hotel Factory later, but nothing is published automatically.",
    candidate: "candidate",
    review: "review",
    workflow: "Workflow & ownership",
    workflowHelp: "Design Studio shapes the Hub. Hotel Factory owns the operational truth that powers runtime behavior.",
    designOwner: "Design Studio",
    designOwnerText: "Design, colors, typography, sections, ordering, Hub content selection and draft information.",
    factoryOwner: "Hotel Factory",
    factoryOwnerText: "Real venues, rooms, services, opening hours, contacts, departments, credentials and runtime settings.",
    factoryAction: "Open Hotel Factory",
    factoryBoundary: "At this stage the button only opens Factory. Automatic package materialization will remain a separate explicit action.",
    stepScan: "1 · Scan",
    stepReview: "2 · Review",
    stepDesign: "3 · Design",
    stepFactory: "4 · Factory",
    stepSandbox: "5 · Sandbox",
    stepLive: "6 · Live",
    current: "current",
    locked: "explicit action",
  },
} as const;

export default function DesignStudioClient({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const [pkg, setPkg] = useState<HotelIntelligencePackage | null>(null);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(PACKAGE_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as HotelIntelligencePackage;
      if (parsed?.schemaVersion === "hotel-intelligence-v1") setPkg(parsed);
    } catch {
      window.sessionStorage.removeItem(PACKAGE_STORAGE_KEY);
    }
  }, []);

  function clearDraft() {
    window.sessionStorage.removeItem(PACKAGE_STORAGE_KEY);
    setPkg(null);
  }

  if (!pkg) {
    return (
      <section className="rounded-[2rem] border border-violet-300/15 bg-neutral-900/85 p-7 shadow-[0_30px_100px_rgba(139,92,246,0.06)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300/70">{copy.eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">{copy.title}</h2>
        <div className="mt-8 rounded-3xl border border-white/5 bg-black/20 p-6">
          <p className="text-lg font-semibold text-neutral-200">{copy.noPackage}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">{copy.noPackageHelp}</p>
          <Link href={`/hotel-scanner?lang=${lang}`} className="mt-5 inline-flex rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100">{copy.scanner}</Link>
        </div>
      </section>
    );
  }

  const profile = pkg.hotelProfileLayer;
  const design = pkg.designIntelligenceLayer;

  return (
    <section className="rounded-[2rem] border border-violet-300/15 bg-neutral-900/85 p-5 shadow-[0_30px_100px_rgba(139,92,246,0.06)] sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300/70">{copy.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">{copy.title}</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
        </div>
        <span className="w-fit rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">{copy.draft}</span>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label={copy.hotel} value={profile.identity.hotelName || "—"} />
        <Metric label={copy.evidence} value={String(pkg.readiness.evidenceFactCount)} />
        <Metric label={copy.hubQueue} value={String(pkg.readiness.hubCandidateCount)} />
        <Metric label={copy.design} value={String(pkg.readiness.designSignalCount)} />
        <Metric label={copy.reviewQueue} value={String(pkg.readiness.reviewRequiredCount)} />
      </div>

      <section className="mt-6 rounded-3xl border border-cyan-300/10 bg-cyan-300/[0.025] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100/80">{copy.workflow}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{copy.workflowHelp}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
            <StepBadge label={copy.stepScan} state="done" />
            <StepBadge label={copy.stepReview} state="done" />
            <StepBadge label={copy.stepDesign} state="current" note={copy.current} />
            <StepBadge label={copy.stepFactory} state="locked" note={copy.locked} />
            <StepBadge label={copy.stepSandbox} state="locked" />
            <StepBadge label={copy.stepLive} state="locked" />
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <OwnershipCard title={copy.designOwner} text={copy.designOwnerText} accent="violet" />
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100/80">{copy.factoryOwner}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-400">{copy.factoryOwnerText}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={`/hotel-factory/new?lang=${lang}`} className="inline-flex w-fit rounded-xl border border-emerald-300/25 bg-emerald-300/[0.06] px-3 py-2 text-xs font-semibold text-emerald-100">{copy.factoryAction}</Link>
              <p className="text-[11px] leading-5 text-neutral-600">{copy.factoryBoundary}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <HubLivePreview pkg={pkg} lang={lang} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <LayerCard title={copy.evidence} badge={`${pkg.evidenceLayer.sourceUrls.length} URLs`}>
          <p className="text-sm leading-6 text-neutral-400">{pkg.evidenceLayer.facts.length} evidence-backed facts</p>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
            {pkg.evidenceLayer.facts.slice(0, 12).map((item) => <QueueItem key={item.id} item={item} lang={lang} />)}
          </div>
        </LayerCard>

        <LayerCard title={copy.profile} badge="normalized">
          <Field label={copy.profileInfo} value={profile.identity.summary} />
          <Field label={copy.rooms} value={profile.hospitality.roomTypes.join(", ")} />
          <Field label={copy.venues} value={profile.hospitality.venues.map((venue) => venue.name).join(", ")} />
          <Field label={copy.amenities} value={profile.hospitality.amenities.join(", ")} />
          <Field label={copy.policies} value={profile.hospitality.policies.join(" · ")} />
          <Field label={copy.contacts} value={[...profile.contacts.phones, ...profile.contacts.emails].join(" · ")} />
          <SocialLinks label={copy.socialProfiles} links={profile.contacts.socialLinks} />
        </LayerCard>

        <LayerCard title={copy.design} badge={design.visualAssetPolicy}>
          <BrandPalette label={copy.colors} colors={design.colors} />
          <Field label={copy.fonts} value={design.fonts.join(", ")} />
          <Field label={copy.style} value={design.styleKeywords.join(", ")} />
          <Field label={copy.images} value={String(design.imageReferences.length)} />
          <Field label={copy.logos} value={String(design.logoReferences.length)} />
          <p className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100/70">{copy.authorization}</p>
        </LayerCard>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <QueueCard title={copy.hubQueue} items={pkg.routing.hub} lang={lang} />
        <QueueCard title={copy.setupQueue} items={pkg.routing.smartSetup} lang={lang} />
        <QueueCard title={copy.reviewQueue} items={pkg.routing.review} lang={lang} />
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-emerald-300/15 bg-emerald-300/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-100">{copy.next}</p>
          <p className="mt-1 text-xs text-neutral-500">{copy.source}: {pkg.source.canonicalUrl}</p>
        </div>
        <button type="button" onClick={clearDraft} className="shrink-0 rounded-2xl border border-white/10 px-4 py-3 text-xs font-semibold text-neutral-400 transition hover:border-white/20 hover:text-neutral-200">{copy.clear}</button>
      </div>
    </section>
  );
}

function StepBadge({ label, state, note }: { label: string; state: "done" | "current" | "locked"; note?: string }) {
  const className = state === "done"
    ? "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-100/70"
    : state === "current"
      ? "border-violet-300/25 bg-violet-300/[0.08] text-violet-100"
      : "border-white/5 bg-black/20 text-neutral-600";
  return <span className={`rounded-full border px-2.5 py-1.5 ${className}`}>{label}{note ? ` · ${note}` : ""}</span>;
}

function OwnershipCard({ title, text, accent }: { title: string; text: string; accent: "violet" }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent === "violet" ? "border-violet-300/15 bg-violet-300/[0.035]" : "border-white/5 bg-black/20"}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-100/80">{title}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-400">{text}</p>
    </div>
  );
}

function LayerCard({ title, badge, children }: { title: string; badge: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/5 bg-black/15 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{title}</h3>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-neutral-600">{badge}</span>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function QueueCard({ title, items, lang }: { title: string; items: HotelIntelligenceItem[]; lang: ControlPlaneLang }) {
  return (
    <section className="rounded-3xl border border-white/5 bg-black/15 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{title}</h3>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-neutral-500">{items.length}</span>
      </div>
      <div className="mt-4 max-h-96 space-y-2 overflow-auto pr-1">
        {items.slice(0, 20).map((item) => <QueueItem key={`${title}:${item.id}`} item={item} lang={lang} />)}
      </div>
    </section>
  );
}

function QueueItem({ item, lang }: { item: HotelIntelligenceItem; lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-neutral-300">{item.label}</p>
        <span className={`rounded-full border px-2 py-1 text-[9px] ${item.status === "review_required" ? "border-amber-300/20 text-amber-200/70" : "border-emerald-300/15 text-emerald-200/60"}`}>
          {item.status === "review_required" ? copy.review : copy.candidate}
        </span>
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-5 text-neutral-500">{item.value}</p>
    </div>
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
          return <a key={link} href={link} target="_blank" rel="noreferrer" className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100/75 transition hover:border-cyan-300/30">{host}</a>;
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
            <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: color }} />
            <span className="font-mono text-[11px] uppercase">{color}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/5 bg-black/20 p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">{label}</p><p className="mt-2 break-words text-sm font-semibold text-neutral-200">{value}</p></div>;
}
