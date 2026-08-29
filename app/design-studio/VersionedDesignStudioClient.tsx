"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import {
  HUB_DESIGN_DRAFT_SCHEMA_VERSION,
  validateHubDesignDraftPayload,
  type HubDesignDraftPayload,
} from "@/lib/product-factory/hub-design-draft";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import { buildHubDesignProposal, type HubDesignSection } from "@/lib/product-factory/hub-design-proposal";
import {
  buildHubExperienceBlueprint,
  evaluateHubExperienceDesign,
  type HubExperiencePreset,
  type HubInternalPage,
  type HubMessageDraft,
  type HubModuleKind,
  type HubNavigationItem,
  type HubOfferDraft,
  type HubPromotionDraft,
  type HubSurveySurface,
} from "@/lib/product-factory/hub-experience-blueprint";

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";
const NEW_SECTION = "__new_section__";

type Panel = "structure" | "pages" | "campaigns" | "navigation" | "survey" | "style" | "versions" | "qa";
type EditableOffer = HubOfferDraft & { ctaDestination: string };
type EditablePromotion = HubPromotionDraft & { ctaDestination: string };
type RevisionMeta = {
  id: string;
  revisionNo: number;
  parentRevisionId: string | null;
  restoredFromRevisionId: string | null;
  status: "draft";
  payloadChecksum: string;
  createdAt: string;
};
type WorkspaceSnapshot = {
  workspace: {
    id: string;
    canonicalUrl: string;
    hotelName: string;
    currentRevisionId: string | null;
    updatedAt: string;
  };
  revisions: RevisionMeta[];
  currentPayload: HubDesignDraftPayload | null;
};
type DraftDiff = { changedPaths: string[]; changeCount: number; truncated: boolean };

const PRESETS: Record<HubExperiencePreset, string> = {
  boutique: "Boutique editorial",
  resort: "Resort discovery",
  family: "Family friendly",
  business: "Business efficient",
  minimal: "Minimal calm",
};

const MODULES: HubModuleKind[] = [
  "hero", "quick_actions", "content_grid", "content_list", "offer_teaser", "announcement",
  "floating_banner", "message_teaser", "survey_card", "ai_concierge", "weather", "contact_strip",
];

const COPY = {
  bg: {
    title: "Hub Experience Builder V3",
    subtitle: "Версионирана design чернова: всяко записване е immutable revision; restore създава нова revision. Нищо тук не активира хотел или campaign runtime.",
    noPackage: "Няма Hotel Intelligence Package.",
    noPackageHelp: "Сканирай хотелския сайт и отвори резултата в Design Studio.",
    scanner: "AI Hotel Scanner",
    save: "Запази revision",
    saving: "Записване…",
    reset: "Върни AI blueprint",
    clear: "Изчисти локалния пакет",
    structure: "Структура",
    pages: "Страници",
    campaigns: "Кампании",
    navigation: "Навигация",
    survey: "Анкета",
    style: "Стил",
    versions: "Версии",
    qa: "Design QA",
    preview: "Mobile preview",
    manual: "Ръчно съдържание",
    addCard: "Добави карта",
    addPage: "Добави страница",
    addOffer: "Добави оферта",
    addMessage: "Добави съобщение",
    compare: "Сравни с текущата",
    restore: "Restore като нова revision",
    current: "текуща",
    noVersions: "Още няма записана revision.",
    source: "Източник",
    destination: "CTA destination",
  },
  en: {
    title: "Hub Experience Builder V3",
    subtitle: "Versioned design draft: every save is an immutable revision; restore creates a new revision. Nothing here activates a hotel or campaign runtime.",
    noPackage: "No Hotel Intelligence Package is available.",
    noPackageHelp: "Scan the hotel website and open the result in Design Studio.",
    scanner: "AI Hotel Scanner",
    save: "Save revision",
    saving: "Saving…",
    reset: "Reset AI blueprint",
    clear: "Clear local package",
    structure: "Structure",
    pages: "Pages",
    campaigns: "Campaigns",
    navigation: "Navigation",
    survey: "Survey",
    style: "Style",
    versions: "Versions",
    qa: "Design QA",
    preview: "Mobile preview",
    manual: "Manual content",
    addCard: "Add card",
    addPage: "Add page",
    addOffer: "Add offer",
    addMessage: "Add message",
    compare: "Compare with current",
    restore: "Restore as new revision",
    current: "current",
    noVersions: "No revision has been saved yet.",
    source: "Source",
    destination: "CTA destination",
  },
} as const;

function destinationOptions(pages: HubInternalPage[]) {
  return [
    { value: "home", label: "Home" },
    ...pages.map((page) => ({ value: page.id, label: page.title || page.id })),
  ];
}

function withOfferDestination(offer: HubOfferDraft): EditableOffer {
  const candidate = offer as EditableOffer;
  return { ...offer, ctaDestination: candidate.ctaDestination || "page-services" };
}

function withPromotionDestination(promo: HubPromotionDraft): EditablePromotion {
  const candidate = promo as EditablePromotion;
  return { ...promo, ctaDestination: candidate.ctaDestination || "page-services" };
}

export default function VersionedDesignStudioClient({ lang }: { lang: ControlPlaneLang }) {
  const language: "bg" | "en" = lang === "en" ? "en" : "bg";
  const copy = COPY[language];
  const [pkg, setPkg] = useState<HotelIntelligencePackage | null>(null);
  const [panel, setPanel] = useState<Panel>("structure");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [diff, setDiff] = useState<DraftDiff | null>(null);
  const [activeScreen, setActiveScreen] = useState("home");

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

  const proposal = useMemo(() => pkg ? buildHubDesignProposal(pkg, language) : null, [pkg, language]);
  const generated = useMemo(() => pkg ? buildHubExperienceBlueprint(pkg, language) : null, [pkg, language]);

  const [preset, setPreset] = useState<HubExperiencePreset>("boutique");
  const [primaryColor, setPrimaryColor] = useState("#43B5A1");
  const [secondaryColor, setSecondaryColor] = useState("#202627");
  const [backgroundColor, setBackgroundColor] = useState("#F7F7F5");
  const [headingFont, setHeadingFont] = useState("system-ui");
  const [bodyFont, setBodyFont] = useState("system-ui");
  const [modules, setModules] = useState<HubModuleKind[]>([]);
  const [hiddenSectionIds, setHiddenSectionIds] = useState<string[]>([]);
  const [manualSections, setManualSections] = useState<HubDesignSection[]>([]);
  const [extraItems, setExtraItems] = useState<Record<string, HubDesignSection["items"]>>({});
  const [pages, setPages] = useState<HubInternalPage[]>([]);
  const [navigation, setNavigation] = useState<HubNavigationItem[]>([]);
  const [offers, setOffers] = useState<EditableOffer[]>([]);
  const [messages, setMessages] = useState<HubMessageDraft[]>([]);
  const [promotions, setPromotions] = useState<EditablePromotion[]>([]);
  const [promotionEnabled, setPromotionEnabled] = useState(true);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [survey, setSurvey] = useState<HubSurveySurface>({ enabled: true, placement: "home", presentation: "card", runtimeOwned: true });

  const [targetSection, setTargetSection] = useState(NEW_SECTION);
  const [manualSectionTitle, setManualSectionTitle] = useState("");
  const [manualLabel, setManualLabel] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [newPageTitle, setNewPageTitle] = useState("");

  function applyGeneratedBlueprint() {
    if (!proposal || !generated) return;
    setPreset(generated.preset);
    setPrimaryColor(proposal.theme.primaryColor);
    setSecondaryColor(proposal.theme.secondaryColor);
    setBackgroundColor(proposal.theme.backgroundColor);
    setHeadingFont(proposal.theme.headingFont);
    setBodyFont(proposal.theme.bodyFont);
    setModules(generated.modules);
    setHiddenSectionIds([]);
    setManualSections([]);
    setExtraItems({});
    setPages(generated.pages);
    setNavigation(generated.navigation);
    setOffers(generated.offers.map(withOfferDestination));
    setMessages(generated.messages);
    setPromotions(generated.promotions.map(withPromotionDestination));
    setPromotionEnabled(true);
    setSearchEnabled(true);
    setSurvey(generated.survey);
    setActiveScreen("home");
  }

  function applyPayload(payload: HubDesignDraftPayload) {
    const a = payload.authoring;
    setPreset(a.preset);
    setPrimaryColor(a.theme.primaryColor);
    setSecondaryColor(a.theme.secondaryColor);
    setBackgroundColor(a.theme.backgroundColor);
    setHeadingFont(a.theme.headingFont);
    setBodyFont(a.theme.bodyFont);
    setModules(a.modules);
    setHiddenSectionIds(a.hiddenSectionIds);
    setManualSections(a.manualSections);
    setExtraItems(a.extraItems);
    setPages(a.pages);
    setNavigation(a.navigation);
    setOffers(a.offers.map(withOfferDestination));
    setMessages(a.messages);
    setPromotions(a.promotions.map(withPromotionDestination));
    setPromotionEnabled(a.promotionEnabled);
    setSearchEnabled(a.searchEnabled);
    setSurvey(a.survey);
    setActiveScreen("home");
  }

  async function loadWorkspace(sourcePkg: HotelIntelligencePackage, applyCurrent: boolean) {
    const response = await fetch(`/api/control-plane/design-studio/drafts?canonicalUrl=${encodeURIComponent(sourcePkg.source.canonicalUrl)}`, {
      cache: "no-store",
    });
    const body = await response.json() as { ok?: boolean; snapshot?: WorkspaceSnapshot | null; error?: string };
    if (!response.ok || !body.ok) throw new Error(body.error || "draft_load_failed");
    setSnapshot(body.snapshot || null);
    if (applyCurrent) {
      if (body.snapshot?.currentPayload) applyPayload(body.snapshot.currentPayload);
      else applyGeneratedBlueprint();
    }
    return body.snapshot || null;
  }

  useEffect(() => {
    if (!pkg || !proposal || !generated) return;
    setError("");
    void loadWorkspace(pkg, true).catch((reason) => {
      applyGeneratedBlueprint();
      setError(reason instanceof Error ? reason.message : String(reason));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg?.source.canonicalUrl, proposal?.hotelName, generated?.schemaVersion]);

  const allSections = useMemo(() => {
    if (!proposal) return manualSections;
    const generatedSections = proposal.sections.map((section) => ({
      ...section,
      items: [...section.items, ...(extraItems[section.id] || [])],
    }));
    return [...generatedSections, ...manualSections];
  }, [proposal, manualSections, extraItems]);
  const visibleSections = allSections.filter((section) => !hiddenSectionIds.includes(section.id));
  const activePage = pages.find((page) => page.id === activeScreen);

  const experience = useMemo(() => {
    if (!generated) return null;
    return {
      ...generated,
      preset,
      sections: allSections,
      pages,
      navigation,
      modules,
      promotions: promotionEnabled ? promotions : [],
      offers,
      messages,
      survey,
    };
  }, [generated, preset, allSections, pages, navigation, modules, promotionEnabled, promotions, offers, messages, survey]);

  const payload = useMemo<HubDesignDraftPayload | null>(() => {
    if (!pkg || !proposal || !experience) return null;
    return {
      schemaVersion: HUB_DESIGN_DRAFT_SCHEMA_VERSION,
      source: {
        canonicalUrl: pkg.source.canonicalUrl,
        hotelName: proposal.hotelName || pkg.hotelProfileLayer.identity.hotelName || "Hotel",
        packageSchemaVersion: "hotel-intelligence-v1",
      },
      authoring: {
        preset,
        theme: { primaryColor, secondaryColor, backgroundColor, headingFont, bodyFont },
        modules,
        hiddenSectionIds,
        manualSections,
        extraItems,
        pages,
        navigation,
        offers,
        messages,
        promotions,
        promotionEnabled,
        searchEnabled,
        survey,
      },
      experience,
      policies: {
        assetPolicy: "hotel_authorization_required",
        materializationPolicy: "explicit_review_required",
        runtimeCampaignSend: false,
        liveActivation: false,
      },
    };
  }, [pkg, proposal, experience, preset, primaryColor, secondaryColor, backgroundColor, headingFont, bodyFont, modules, hiddenSectionIds, manualSections, extraItems, pages, navigation, offers, messages, promotions, promotionEnabled, searchEnabled, survey]);

  const validation = useMemo(() => payload ? validateHubDesignDraftPayload(payload) : { ok: false, errors: ["NO_PAYLOAD"], warnings: [] }, [payload]);
  const qa = useMemo(() => proposal ? evaluateHubExperienceDesign({
    navigation,
    promotions: promotionEnabled ? promotions : [],
    offers,
    messages,
    homeModuleCount: modules.length,
    primaryColor,
    backgroundColor,
    textColor: proposal.theme.textColor,
  }) : [], [proposal, navigation, promotionEnabled, promotions, offers, messages, modules.length, primaryColor, backgroundColor]);

  async function saveRevision() {
    if (!pkg || !payload || !validation.ok) return;
    setBusy(true); setError(""); setNotice(""); setDiff(null);
    try {
      const response = await fetch("/api/control-plane/design-studio/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          sourcePackage: pkg,
          payload,
          parentRevisionId: snapshot?.workspace.currentRevisionId || null,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; revision?: { revisionNo?: number } };
      if (!response.ok || !body.ok) throw new Error(body.error || "draft_save_failed");
      await loadWorkspace(pkg, false);
      setNotice(language === "bg" ? `Записана revision ${body.revision?.revisionNo || ""}.` : `Saved revision ${body.revision?.revisionNo || ""}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      if (String(reason).includes("revision_conflict")) await loadWorkspace(pkg, false).catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function restoreRevision(revisionId: string) {
    if (!pkg || !snapshot?.workspace.currentRevisionId) return;
    setBusy(true); setError(""); setNotice(""); setDiff(null);
    try {
      const response = await fetch("/api/control-plane/design-studio/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore",
          workspaceId: snapshot.workspace.id,
          sourceRevisionId: revisionId,
          expectedCurrentRevisionId: snapshot.workspace.currentRevisionId,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; revision?: { revisionNo?: number } };
      if (!response.ok || !body.ok) throw new Error(body.error || "draft_restore_failed");
      await loadWorkspace(pkg, true);
      setNotice(language === "bg" ? `Restore е записан като нова revision ${body.revision?.revisionNo || ""}.` : `Restore saved as new revision ${body.revision?.revisionNo || ""}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function compareRevision(revisionId: string) {
    if (!snapshot?.workspace.currentRevisionId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const params = new URLSearchParams({
        workspaceId: snapshot.workspace.id,
        leftRevisionId: revisionId,
        rightRevisionId: snapshot.workspace.currentRevisionId,
      });
      const response = await fetch(`/api/control-plane/design-studio/drafts?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as { ok?: boolean; error?: string; diff?: DraftDiff };
      if (!response.ok || !body.ok || !body.diff) throw new Error(body.error || "draft_compare_failed");
      setDiff(body.diff);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  function addManualCard() {
    const label = manualLabel.trim();
    const value = manualBody.trim();
    if (!label || !value) return;
    const item = { id: `manual-item-${Date.now()}`, label, value, confidence: 0 };
    if (targetSection === NEW_SECTION) {
      const title = manualSectionTitle.trim();
      if (!title) return;
      const id = `manual-section-${Date.now()}`;
      setManualSections((current) => [...current, { id, category: "manual", title, items: [item], priority: 900 + current.length }]);
      setTargetSection(id);
      setManualSectionTitle("");
    } else {
      setExtraItems((current) => ({ ...current, [targetSection]: [...(current[targetSection] || []), item] }));
    }
    setManualLabel(""); setManualBody("");
  }

  function addPage() {
    const title = newPageTitle.trim();
    if (!title) return;
    const id = `page-custom-${Date.now()}`;
    setPages((current) => [...current, { id, kind: "custom", title, subtitle: "", sectionIds: [], designDraft: true }]);
    setNewPageTitle(""); setActiveScreen(id);
  }

  function moveNavigation(index: number, delta: -1 | 1) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= navigation.length) return;
    setNavigation((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function clearPackage() {
    window.sessionStorage.removeItem(PACKAGE_STORAGE_KEY);
    setPkg(null); setSnapshot(null); setDiff(null);
  }

  if (!pkg || !proposal || !generated) {
    return <section className="rounded-[2rem] border border-white/10 bg-neutral-900/80 p-7"><h2 className="text-2xl font-semibold">{copy.noPackage}</h2><p className="mt-2 text-sm text-neutral-400">{copy.noPackageHelp}</p><Link href={`/hotel-scanner?lang=${lang}`} className="mt-5 inline-flex rounded-xl border border-cyan-300/20 px-4 py-3 text-sm text-cyan-100">{copy.scanner}</Link></section>;
  }

  const pageSectionChoices = visibleSections;
  const currentRevisionId = snapshot?.workspace.currentRevisionId || null;
  const currentRevision = snapshot?.revisions.find((revision) => revision.id === currentRevisionId);
  const destinations = destinationOptions(pages);

  return (
    <section className="rounded-[2rem] border border-violet-300/15 bg-neutral-900/85 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300/70">StayHub Design Intelligence</p><h2 className="mt-2 text-3xl font-semibold">{copy.title}</h2><p className="mt-2 text-sm leading-6 text-neutral-400">{copy.subtitle}</p><p className="mt-2 text-xs text-neutral-600">{copy.source}: {pkg.source.canonicalUrl}</p></div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-amber-300/20 px-3 py-2 text-[10px] font-semibold uppercase text-amber-100">DRAFT · {currentRevision ? `r${currentRevision.revisionNo}` : "unsaved"}</span>
          <button type="button" onClick={saveRevision} disabled={busy || !validation.ok} className="min-h-11 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.06] px-4 text-xs font-semibold text-emerald-100 disabled:opacity-40">{busy ? copy.saving : copy.save}</button>
          <button type="button" onClick={applyGeneratedBlueprint} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs text-neutral-400">{copy.reset}</button>
        </div>
      </div>

      {(notice || error) && <div className={`mt-4 rounded-2xl border p-3 text-xs ${error ? "border-rose-300/20 text-rose-200" : "border-emerald-300/20 text-emerald-200"}`}>{error || notice}</div>}

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
        {(["structure", "pages", "campaigns", "navigation", "survey", "style", "versions", "qa"] as Panel[]).map((id) => <button key={id} type="button" onClick={() => setPanel(id)} className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-semibold ${panel === id ? "border-violet-300/30 bg-violet-300/[0.08] text-violet-100" : "border-white/5 text-neutral-500"}`}>{copy[id]}</button>)}
      </div>

      <div className="mt-4 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-3xl border border-white/5 bg-neutral-950/70 p-4 sm:p-5">
          {panel === "structure" && <div className="space-y-6">
            <Select label="Preset" value={preset} onChange={(value) => setPreset(value as HubExperiencePreset)} options={Object.entries(PRESETS).map(([value, label]) => ({ value, label }))} />
            <div><SectionTitle>Home modules</SectionTitle><div className="mt-3 grid gap-2 sm:grid-cols-2">{MODULES.map((module) => <Toggle key={module} label={module} active={modules.includes(module)} onClick={() => setModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module])} />)}</div></div>
            <div><SectionTitle>Hub sections</SectionTitle><div className="mt-3 grid gap-2 sm:grid-cols-2">{allSections.map((section) => <Toggle key={section.id} label={`${section.title} · ${section.items.length}`} active={!hiddenSectionIds.includes(section.id)} onClick={() => setHiddenSectionIds((current) => current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id])} />)}</div></div>
            <div className="rounded-2xl border border-cyan-300/10 p-4"><SectionTitle>{copy.manual}</SectionTitle><div className="mt-3 grid gap-3 sm:grid-cols-2"><Select label="Section" value={targetSection} onChange={setTargetSection} options={[{ value: NEW_SECTION, label: "+ New section" }, ...allSections.map((section) => ({ value: section.id, label: section.title }))]} />{targetSection === NEW_SECTION && <Input label="Section title" value={manualSectionTitle} onChange={setManualSectionTitle} />}<Input label="Card title" value={manualLabel} onChange={setManualLabel} /><Input label="Card body" value={manualBody} onChange={setManualBody} /></div><button type="button" onClick={addManualCard} className="mt-3 min-h-11 rounded-xl border border-cyan-300/20 px-4 text-xs text-cyan-100">{copy.addCard}</button></div>
          </div>}

          {panel === "pages" && <div className="space-y-4"><SectionTitle>{copy.pages}</SectionTitle>{pages.map((page) => <div key={page.id} className="rounded-2xl border border-white/5 p-4"><div className="grid gap-3 sm:grid-cols-2"><Input label="Title" value={page.title} onChange={(value) => setPages((current) => current.map((item) => item.id === page.id ? { ...item, title: value } : item))} /><Input label="Subtitle" value={page.subtitle} onChange={(value) => setPages((current) => current.map((item) => item.id === page.id ? { ...item, subtitle: value } : item))} /></div>{page.kind !== "offers" && page.kind !== "messages" && <div className="mt-3 flex flex-wrap gap-2">{pageSectionChoices.map((section) => <button key={`${page.id}:${section.id}`} type="button" onClick={() => setPages((current) => current.map((item) => item.id === page.id ? { ...item, sectionIds: item.sectionIds.includes(section.id) ? item.sectionIds.filter((id) => id !== section.id) : [...item.sectionIds, section.id] } : item))} className={`min-h-11 rounded-xl border px-3 text-xs ${page.sectionIds.includes(section.id) ? "border-cyan-300/20 text-cyan-100" : "border-white/5 text-neutral-600"}`}>{section.title}</button>)}</div>}<button type="button" onClick={() => setActiveScreen(page.id)} className="mt-3 text-xs text-violet-200">Preview</button>{page.kind === "custom" && <button type="button" onClick={() => setPages((current) => current.filter((item) => item.id !== page.id))} className="ml-4 mt-3 text-xs text-rose-300">Remove</button>}</div>)}<div className="flex gap-2"><input value={newPageTitle} onChange={(event) => setNewPageTitle(event.target.value)} className="min-h-11 flex-1 rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm" placeholder="Custom page" /><button type="button" onClick={addPage} className="rounded-xl border border-violet-300/20 px-4 text-xs text-violet-100">{copy.addPage}</button></div></div>}

          {panel === "campaigns" && <div className="space-y-6"><SectionTitle>{copy.campaigns}</SectionTitle>{promotions.map((promo) => <div key={promo.id} className="rounded-2xl border border-amber-300/10 p-4"><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={promotionEnabled} onChange={(event) => setPromotionEnabled(event.target.checked)} />Promotion enabled in draft</label><div className="grid gap-3 sm:grid-cols-2"><Input label="Title" value={promo.title} onChange={(value) => setPromotions((current) => current.map((item) => item.id === promo.id ? { ...item, title: value } : item))} /><Input label="Body" value={promo.body} onChange={(value) => setPromotions((current) => current.map((item) => item.id === promo.id ? { ...item, body: value } : item))} /><Input label="CTA" value={promo.ctaLabel} onChange={(value) => setPromotions((current) => current.map((item) => item.id === promo.id ? { ...item, ctaLabel: value } : item))} /><Select label={copy.destination} value={promo.ctaDestination} onChange={(value) => setPromotions((current) => current.map((item) => item.id === promo.id ? { ...item, ctaDestination: value } : item))} options={destinations} /></div></div>)}
            <div><div className="flex items-center justify-between"><SectionTitle>Offers</SectionTitle><button type="button" onClick={() => setOffers((current) => [...current, { id: `offer-${Date.now()}`, title: "New offer", discountLabel: "-10%", body: "Design draft", validityLabel: "Confirm in Factory", ctaLabel: "Explore", ctaDestination: "page-services", designDraft: true }])} className="text-xs text-cyan-200">{copy.addOffer}</button></div><div className="mt-3 space-y-3">{offers.map((offer) => <div key={offer.id} className="grid gap-3 rounded-2xl border border-white/5 p-4 sm:grid-cols-2"><Input label="Title" value={offer.title} onChange={(value) => setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, title: value } : item))} /><Input label="Badge" value={offer.discountLabel} onChange={(value) => setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, discountLabel: value } : item))} /><Input label="Body" value={offer.body} onChange={(value) => setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, body: value } : item))} /><Input label="Validity" value={offer.validityLabel} onChange={(value) => setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, validityLabel: value } : item))} /><Input label="CTA" value={offer.ctaLabel} onChange={(value) => setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, ctaLabel: value } : item))} /><Select label={copy.destination} value={offer.ctaDestination} onChange={(value) => setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, ctaDestination: value } : item))} options={destinations} /></div>)}</div></div>
            <div><div className="flex items-center justify-between"><SectionTitle>Messages</SectionTitle><button type="button" onClick={() => setMessages((current) => [...current, { id: `message-${Date.now()}`, kind: "operational", channel: "in_app", title: "New message", body: "Design draft", marketingConsentRequired: false, timeSensitiveAllowed: false, designDraft: true }])} className="text-xs text-cyan-200">{copy.addMessage}</button></div><div className="mt-3 space-y-3">{messages.map((message) => <div key={message.id} className="grid gap-3 rounded-2xl border border-white/5 p-4 sm:grid-cols-2"><Input label="Title" value={message.title} onChange={(value) => setMessages((current) => current.map((item) => item.id === message.id ? { ...item, title: value } : item))} /><Input label="Body" value={message.body} onChange={(value) => setMessages((current) => current.map((item) => item.id === message.id ? { ...item, body: value } : item))} /><Select label="Kind" value={message.kind} onChange={(value) => setMessages((current) => current.map((item) => item.id === message.id ? { ...item, kind: value as HubMessageDraft["kind"], marketingConsentRequired: value === "marketing" ? true : item.marketingConsentRequired } : item))} options={[{ value: "operational", label: "Operational" }, { value: "stay", label: "Stay" }, { value: "marketing", label: "Marketing" }]} /><Select label="Channel" value={message.channel} onChange={(value) => setMessages((current) => current.map((item) => item.id === message.id ? { ...item, channel: value as HubMessageDraft["channel"] } : item))} options={[{ value: "in_app", label: "In-app" }, { value: "push", label: "Push" }]} />{message.kind === "marketing" && <label className="flex min-h-11 items-center gap-2 text-xs text-amber-100"><input type="checkbox" checked={message.marketingConsentRequired} onChange={(event) => setMessages((current) => current.map((item) => item.id === message.id ? { ...item, marketingConsentRequired: event.target.checked } : item))} />Marketing consent required</label>}</div>)}</div></div>
          </div>}

          {panel === "navigation" && <div className="space-y-3"><SectionTitle>{copy.navigation}</SectionTitle><label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/5 px-3 text-xs"><input type="checkbox" checked={searchEnabled} onChange={(event) => setSearchEnabled(event.target.checked)} />Search enabled</label>{navigation.map((item, index) => <div key={item.id} className="grid gap-2 rounded-2xl border border-white/5 p-3 sm:grid-cols-[1fr_1fr_auto]"><input value={item.label} onChange={(event) => setNavigation((current) => current.map((nav) => nav.id === item.id ? { ...nav, label: event.target.value } : nav))} className="min-h-11 rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm" /><select value={item.pageId} onChange={(event) => setNavigation((current) => current.map((nav) => nav.id === item.id ? { ...nav, pageId: event.target.value } : nav))} className="min-h-11 rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm">{destinations.map((option) => <option key={`${item.id}:${option.value}`} value={option.value}>{option.label}</option>)}</select><div className="flex gap-1"><button type="button" onClick={() => moveNavigation(index, -1)} className="min-h-11 min-w-11 rounded-xl border border-white/10">↑</button><button type="button" onClick={() => moveNavigation(index, 1)} className="min-h-11 min-w-11 rounded-xl border border-white/10">↓</button></div></div>)}</div>}

          {panel === "survey" && <div className="space-y-4"><SectionTitle>{copy.survey}</SectionTitle><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={survey.enabled} onChange={(event) => setSurvey((current) => ({ ...current, enabled: event.target.checked }))} />Enabled presentation surface</label><Select label="Placement" value={survey.placement} onChange={(value) => setSurvey((current) => ({ ...current, placement: value as HubSurveySurface["placement"] }))} options={[{ value: "home", label: "Home" }, { value: "messages", label: "Messages" }, { value: "stay", label: "Stay" }]} /><Select label="Presentation" value={survey.presentation} onChange={(value) => setSurvey((current) => ({ ...current, presentation: value as HubSurveySurface["presentation"] }))} options={[{ value: "card", label: "Card" }, { value: "compact", label: "Compact" }]} /><p className="text-xs text-neutral-500">runtimeOwned = true · business logic remains runtime-owned.</p></div>}

          {panel === "style" && <div className="grid gap-4 sm:grid-cols-2"><Color label="Primary" value={primaryColor} onChange={setPrimaryColor} /><Color label="Secondary" value={secondaryColor} onChange={setSecondaryColor} /><Color label="Background" value={backgroundColor} onChange={setBackgroundColor} /><Select label="Heading font" value={headingFont} onChange={setHeadingFont} options={proposal.availableFonts.map((font) => ({ value: font, label: font }))} /><Select label="Body font" value={bodyFont} onChange={setBodyFont} options={proposal.availableFonts.map((font) => ({ value: font, label: font }))} /></div>}

          {panel === "versions" && <div className="space-y-3"><SectionTitle>{copy.versions}</SectionTitle>{!snapshot?.revisions.length && <p className="text-sm text-neutral-500">{copy.noVersions}</p>}{snapshot?.revisions.map((revision) => { const isCurrent = revision.id === currentRevisionId; return <div key={revision.id} className={`rounded-2xl border p-4 ${isCurrent ? "border-emerald-300/20" : "border-white/5"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Revision {revision.revisionNo} {isCurrent ? `· ${copy.current}` : ""}</p><p className="mt-1 text-[10px] text-neutral-600">{new Date(revision.createdAt).toLocaleString()} · {revision.payloadChecksum.slice(0, 12)}</p>{revision.restoredFromRevisionId && <p className="mt-1 text-[10px] text-violet-300/70">restored from {revision.restoredFromRevisionId.slice(0, 8)}</p>}</div>{!isCurrent && currentRevisionId && <div className="flex gap-2"><button type="button" onClick={() => compareRevision(revision.id)} disabled={busy} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs">{copy.compare}</button><button type="button" onClick={() => restoreRevision(revision.id)} disabled={busy} className="min-h-11 rounded-xl border border-violet-300/20 px-3 text-xs text-violet-100">{copy.restore}</button></div>}</div></div>; })}{diff && <div className="rounded-2xl border border-cyan-300/15 p-4"><p className="text-sm font-semibold">{diff.changeCount} changed paths{diff.truncated ? " +" : ""}</p><div className="mt-2 max-h-64 overflow-auto">{diff.changedPaths.map((path) => <p key={path} className="font-mono text-[10px] leading-5 text-cyan-100/70">{path}</p>)}</div></div>}</div>}

          {panel === "qa" && <div className="space-y-3"><SectionTitle>{copy.qa}</SectionTitle><div className={`rounded-2xl border p-4 ${validation.ok ? "border-emerald-300/20" : "border-rose-300/20"}`}><p className="text-sm font-semibold">Draft contract: {validation.ok ? "PASS" : "BLOCK"}</p>{validation.errors.map((item) => <p key={item} className="mt-1 text-xs text-rose-200">{item}</p>)}{validation.warnings.map((item) => <p key={item} className="mt-1 text-xs text-amber-200">{item}</p>)}</div>{qa.map((check) => <div key={check.id} className="rounded-2xl border border-white/5 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{check.title}</p><p className="mt-1 text-xs text-neutral-500">{check.detail}</p></div><span className="text-[10px] font-bold uppercase">{check.severity}</span></div></div>)}</div>}
        </div>

        <div className="2xl:sticky 2xl:top-4"><p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600">{copy.preview} · {PRESETS[preset]}</p><div className="mx-auto max-w-[400px] overflow-hidden rounded-[2.4rem] border-[7px] border-neutral-800 bg-white"><div className="h-[720px] overflow-y-auto pb-24" style={{ backgroundColor, color: proposal.theme.textColor, fontFamily: `\"${bodyFont}\",system-ui` }}>{activeScreen === "home" ? <><div className="p-6 text-white" style={{ background: `linear-gradient(145deg, ${secondaryColor}, ${primaryColor})` }}><p className="text-[10px] uppercase opacity-70">StayHub</p><h3 className="mt-2 text-2xl" style={{ fontFamily: `\"${headingFont}\",serif` }}>{proposal.hotelName}</h3><p className="mt-2 text-[11px] leading-5 opacity-80">{pkg.hotelProfileLayer.identity.summary}</p></div><div className="space-y-3 p-4">{searchEnabled && <div className="rounded-2xl border border-black/5 bg-white p-3 text-xs text-neutral-400">⌕ Search</div>}{visibleSections.slice(0, 6).map((section) => <div key={section.id} className="rounded-2xl border border-black/5 bg-white p-4"><p className="text-sm font-semibold text-neutral-800">{section.title}</p><p className="mt-2 text-[10px] text-neutral-500">{section.items[0]?.value}</p></div>)}{survey.enabled && survey.placement === "home" && <div className="rounded-2xl border border-black/5 bg-white p-4 text-xs text-neutral-700">Survey · {survey.presentation}</div>}</div></> : activePage?.kind === "offers" ? <div className="space-y-3 p-4">{offers.map((offer) => <div key={offer.id} className="rounded-2xl border border-black/5 bg-white p-4 text-neutral-800"><p className="text-xs font-bold" style={{ color: primaryColor }}>{offer.discountLabel}</p><p className="mt-2 font-semibold">{offer.title}</p><p className="mt-2 text-[10px] text-neutral-500">{offer.body}</p><p className="mt-3 text-[10px]">{offer.ctaLabel} → {offer.ctaDestination}</p></div>)}</div> : activePage?.kind === "messages" ? <div className="space-y-3 p-4">{messages.map((message) => <div key={message.id} className="rounded-2xl border border-black/5 bg-white p-4 text-neutral-800"><p className="text-[10px] uppercase" style={{ color: primaryColor }}>{message.kind} · {message.channel}</p><p className="mt-2 font-semibold">{message.title}</p><p className="mt-2 text-[10px] text-neutral-500">{message.body}</p></div>)}</div> : <div className="space-y-3 p-4"><h3 className="text-xl font-semibold text-neutral-800">{activePage?.title}</h3>{visibleSections.filter((section) => activePage?.sectionIds.includes(section.id)).map((section) => <div key={section.id} className="rounded-2xl border border-black/5 bg-white p-4 text-neutral-800"><p className="font-semibold">{section.title}</p><p className="mt-2 text-[10px] text-neutral-500">{section.items[0]?.value}</p></div>)}</div>}</div><nav className="grid min-h-[72px] border-t border-black/5 bg-white" style={{ gridTemplateColumns: `repeat(${Math.max(1, navigation.length)}, minmax(0,1fr))` }}>{navigation.map((item) => <button key={item.id} type="button" onClick={() => setActiveScreen(item.pageId)} className="min-h-11 px-1 text-[9px] font-semibold" style={{ color: item.pageId === activeScreen || (item.role === "home" && activeScreen === "home") ? primaryColor : "#777" }}>{item.label}</button>)}</nav></div></div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 p-4"><p className="text-xs text-neutral-500">assetPolicy=hotel_authorization_required · materialization=explicit_review_required · runtimeCampaignSend=false · liveActivation=false</p><button type="button" onClick={clearPackage} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs text-neutral-500">{copy.clear}</button></div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) { return <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">{children}</p>; }
function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`min-h-14 rounded-2xl border p-3 text-left text-xs ${active ? "border-cyan-300/15 text-neutral-200" : "border-white/5 text-neutral-600 opacity-60"}`}>{label}</button>; }
function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-[10px] uppercase tracking-[0.1em] text-neutral-600">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm normal-case tracking-normal text-neutral-200" /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) { return <label className="text-[10px] uppercase tracking-[0.1em] text-neutral-600">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm normal-case tracking-normal text-neutral-200">{options.map((option) => <option key={`${label}:${option.value}`} value={option.value}>{option.label}</option>)}</select></label>; }
function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-[10px] uppercase tracking-[0.1em] text-neutral-600">{label}<div className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-neutral-900 p-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /><span className="text-xs text-neutral-300">{value}</span></div></label>; }
