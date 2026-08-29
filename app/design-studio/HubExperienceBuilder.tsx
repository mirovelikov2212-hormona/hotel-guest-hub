"use client";

import { useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import { buildHubDesignProposal, type HubDesignSection } from "@/lib/product-factory/hub-design-proposal";
import {
  buildHubExperienceBlueprint,
  evaluateHubExperienceDesign,
  type HubExperiencePreset,
  type HubInternalPage,
  type HubMessageDraft,
  type HubNavigationItem,
  type HubOfferDraft,
  type HubPromotionDraft,
} from "@/lib/product-factory/hub-experience-blueprint";

type BuilderPanel = "structure" | "pages" | "campaigns" | "navigation" | "style" | "qa";

const COPY = {
  bg: {
    eyebrow: "StayHub Experience Builder",
    title: "Hub Experience Builder V2",
    subtitle: "Проектирайте целия guest journey: начална страница, вътрешни страници, навигация, оферти, съобщения, банери и survey surfaces. Всичко остава design чернова до изричен Factory review.",
    draft: "EXPERIENCE DRAFT · НЕ Е ПУБЛИКУВАНО",
    structure: "Структура",
    pages: "Страници",
    campaigns: "Кампании",
    navigation: "Навигация",
    style: "Стил",
    qa: "Design QA",
    preview: "Live mobile journey",
    preset: "Experience preset",
    modules: "Home модули",
    sections: "Hub секции",
    show: "Показвай",
    hide: "Скрий",
    manualContent: "Draft Content Composer",
    manualHelp: "Добави информационна карта към съществуваща секция или създай design-only секция.",
    target: "Секция",
    newSection: "+ Нова секция",
    sectionTitle: "Име на секция",
    cardTitle: "Заглавие",
    cardBody: "Съдържание",
    addCard: "Добави карта",
    pagesHelp: "Вътрешните страници държат вторичната информация извън Home и правят Hub-а по-лесен за сканиране.",
    addPage: "Добави страница",
    pageTitle: "Име на страница",
    pageSubtitle: "Кратко описание",
    remove: "Премахни",
    previewPage: "Покажи",
    campaignsHelp: "Promo surfaces са контекстни и ненатрапчиви: максимум един floating banner, винаги dismissible и с frequency cap.",
    floatingBanner: "Плаващ банер",
    enabled: "Активен в черновата",
    promoTitle: "Заглавие на банера",
    promoBody: "Текст",
    cta: "CTA",
    placement: "Позиция",
    offers: "Оферти за престой",
    addOffer: "+ Нова оферта",
    discount: "Отстъпка / badge",
    validity: "Валидност",
    messages: "Съобщения",
    addMessage: "+ Ново съобщение",
    messageType: "Тип",
    channel: "Канал",
    consent: "Изисква marketing consent",
    navHelp: "Persistent bottom navigation: 3–5 top-level destinations. Действията остават извън tab bar-а.",
    search: "Search entry в навигацията",
    up: "Нагоре",
    down: "Надолу",
    styleHelp: "Брандът задава характера, но четимостта и контрастът имат предимство пред декоративните ефекти.",
    primary: "Основен цвят",
    secondary: "Втори цвят",
    background: "Фон",
    headingFont: "Шрифт заглавия",
    bodyFont: "Шрифт текст",
    qaHelp: "Автоматични guardrails по accessibility, navigation и interruption правила. Block означава, че design draft-ът не е готов за materialization.",
    qaPass: "PASS",
    qaWarn: "WARN",
    qaBlock: "BLOCK",
    home: "Начало",
    welcome: "Добре дошли",
    explore: "Какво търсите?",
    special: "Специално за Вас",
    inbox: "Съобщения",
    survey: "Как протича престоят Ви?",
    surveyBody: "Анкетата остава runtime-owned. Design Studio избира само presentation surface-а.",
    ai: "Попитайте StayHub AI",
    aiBody: "Хотелска информация и бърз път към точната услуга.",
    weather: "Времето днес",
    contact: "Свържете се с хотела",
    dismiss: "Затвори",
    designSample: "design sample",
    operationalBoundary: "Цени, реални отстъпки, срокове, recipients, push consent и operational destinations се потвърждават във Hotel Factory. Този builder не изпраща съобщения и не публикува оферти.",
    reset: "Върни AI blueprint",
  },
  en: {
    eyebrow: "StayHub Experience Builder",
    title: "Hub Experience Builder V2",
    subtitle: "Design the full guest journey: home, inner pages, navigation, offers, messages, banners and survey surfaces. Everything stays a design draft until explicit Factory review.",
    draft: "EXPERIENCE DRAFT · NOT PUBLISHED",
    structure: "Structure",
    pages: "Pages",
    campaigns: "Campaigns",
    navigation: "Navigation",
    style: "Style",
    qa: "Design QA",
    preview: "Live mobile journey",
    preset: "Experience preset",
    modules: "Home modules",
    sections: "Hub sections",
    show: "Show",
    hide: "Hide",
    manualContent: "Draft Content Composer",
    manualHelp: "Add an information card to an existing section or create a design-only section.",
    target: "Section",
    newSection: "+ New section",
    sectionTitle: "Section name",
    cardTitle: "Title",
    cardBody: "Content",
    addCard: "Add card",
    pagesHelp: "Inner pages keep secondary content off Home and make the Hub easier to scan.",
    addPage: "Add page",
    pageTitle: "Page name",
    pageSubtitle: "Short description",
    remove: "Remove",
    previewPage: "Preview",
    campaignsHelp: "Promo surfaces stay contextual and calm: one floating banner maximum, always dismissible and frequency-capped.",
    floatingBanner: "Floating banner",
    enabled: "Enabled in draft",
    promoTitle: "Banner title",
    promoBody: "Body",
    cta: "CTA",
    placement: "Placement",
    offers: "Stay offers",
    addOffer: "+ New offer",
    discount: "Discount / badge",
    validity: "Validity",
    messages: "Messages",
    addMessage: "+ New message",
    messageType: "Type",
    channel: "Channel",
    consent: "Requires marketing consent",
    navHelp: "Persistent bottom navigation: 3–5 top-level destinations. Actions stay out of the tab bar.",
    search: "Search entry in navigation",
    up: "Up",
    down: "Down",
    styleHelp: "Brand defines character, but readability and contrast take priority over decoration.",
    primary: "Primary color",
    secondary: "Secondary color",
    background: "Background",
    headingFont: "Heading font",
    bodyFont: "Body font",
    qaHelp: "Automatic accessibility, navigation and interruption guardrails. Block means the draft is not ready for materialization.",
    qaPass: "PASS",
    qaWarn: "WARN",
    qaBlock: "BLOCK",
    home: "Home",
    welcome: "Welcome",
    explore: "What are you looking for?",
    special: "Special for you",
    inbox: "Messages",
    survey: "How is your stay going?",
    surveyBody: "Survey logic remains runtime-owned. Design Studio chooses the presentation surface only.",
    ai: "Ask StayHub AI",
    aiBody: "Hotel information and a fast path to the exact service.",
    weather: "Weather today",
    contact: "Contact the hotel",
    dismiss: "Dismiss",
    designSample: "design sample",
    operationalBoundary: "Pricing, real discounts, validity, recipients, push consent and operational destinations are confirmed in Hotel Factory. This builder sends no messages and publishes no offers.",
    reset: "Reset AI blueprint",
  },
} as const;

const MODULE_LABELS: Record<string, { bg: string; en: string }> = {
  hero: { bg: "Hero / welcome", en: "Hero / welcome" },
  quick_actions: { bg: "Quick actions", en: "Quick actions" },
  offer_teaser: { bg: "Offer teaser", en: "Offer teaser" },
  message_teaser: { bg: "Messages teaser", en: "Messages teaser" },
  survey_card: { bg: "Анкета", en: "Survey" },
  ai_concierge: { bg: "AI Concierge", en: "AI Concierge" },
  weather: { bg: "Време", en: "Weather" },
  contact_strip: { bg: "Контакти", en: "Contact strip" },
};

const PRESET_LABELS: Record<HubExperiencePreset, string> = {
  boutique: "Boutique editorial",
  resort: "Resort discovery",
  family: "Family friendly",
  business: "Business efficient",
  minimal: "Minimal calm",
};

const NEW_SECTION = "__new_section__";

export default function HubExperienceBuilder({ pkg, lang }: { pkg: HotelIntelligencePackage; lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const proposal = useMemo(() => buildHubDesignProposal(pkg, lang), [pkg, lang]);
  const base = useMemo(() => buildHubExperienceBlueprint(pkg, lang), [pkg, lang]);
  const [panel, setPanel] = useState<BuilderPanel>("structure");
  const [preset, setPreset] = useState<HubExperiencePreset>(base.preset);
  const [primaryColor, setPrimaryColor] = useState(proposal.theme.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(proposal.theme.secondaryColor);
  const [backgroundColor, setBackgroundColor] = useState(proposal.theme.backgroundColor);
  const [headingFont, setHeadingFont] = useState(proposal.theme.headingFont);
  const [bodyFont, setBodyFont] = useState(proposal.theme.bodyFont);
  const [modules, setModules] = useState<string[]>(base.modules);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [manualSections, setManualSections] = useState<HubDesignSection[]>([]);
  const [extraItems, setExtraItems] = useState<Record<string, HubDesignSection["items"]>>({});
  const [pages, setPages] = useState<HubInternalPage[]>(base.pages);
  const [navigation, setNavigation] = useState<HubNavigationItem[]>(base.navigation);
  const [offers, setOffers] = useState<HubOfferDraft[]>(base.offers);
  const [messages, setMessages] = useState<HubMessageDraft[]>(base.messages);
  const [promotions, setPromotions] = useState<HubPromotionDraft[]>(base.promotions);
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [activeScreen, setActiveScreen] = useState("home");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [targetSection, setTargetSection] = useState(NEW_SECTION);
  const [draftSectionTitle, setDraftSectionTitle] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageSubtitle, setNewPageSubtitle] = useState("");

  const allSections = useMemo(() => {
    const generated = proposal.sections.map((section) => ({ ...section, items: [...section.items, ...(extraItems[section.id] || [])] }));
    return [...generated, ...manualSections];
  }, [proposal.sections, extraItems, manualSections]);
  const visibleSections = allSections.filter((section) => !hiddenSections.includes(section.id));
  const activePage = pages.find((page) => page.id === activeScreen);
  const qa = evaluateHubExperienceDesign({
    navigation,
    promotions,
    offers,
    messages,
    homeModuleCount: modules.length,
    primaryColor,
    backgroundColor,
    textColor: proposal.theme.textColor,
  });
  const blockers = qa.filter((item) => item.severity === "block").length;
  const warnings = qa.filter((item) => item.severity === "warn").length;

  function reset() {
    setPreset(base.preset);
    setPrimaryColor(proposal.theme.primaryColor);
    setSecondaryColor(proposal.theme.secondaryColor);
    setBackgroundColor(proposal.theme.backgroundColor);
    setHeadingFont(proposal.theme.headingFont);
    setBodyFont(proposal.theme.bodyFont);
    setModules(base.modules);
    setHiddenSections([]);
    setManualSections([]);
    setExtraItems({});
    setPages(base.pages);
    setNavigation(base.navigation);
    setOffers(base.offers);
    setMessages(base.messages);
    setPromotions(base.promotions);
    setSearchEnabled(true);
    setActiveScreen("home");
    setBannerDismissed(false);
  }

  function toggleModule(module: string) {
    setModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]);
  }

  function toggleSection(sectionId: string) {
    setHiddenSections((current) => current.includes(sectionId) ? current.filter((item) => item !== sectionId) : [...current, sectionId]);
  }

  function addDraftContent() {
    const label = draftLabel.trim();
    const value = draftBody.trim();
    if (!label || !value) return;
    const item = { id: `manual-item-${Date.now()}`, label, value, confidence: 0 };
    if (targetSection === NEW_SECTION) {
      const title = draftSectionTitle.trim();
      if (!title) return;
      const id = `manual-section-${Date.now()}`;
      setManualSections((current) => [...current, { id, category: "manual", title, items: [item], priority: 900 + current.length }]);
      setTargetSection(id);
      setDraftSectionTitle("");
    } else {
      setExtraItems((current) => ({ ...current, [targetSection]: [...(current[targetSection] || []), item] }));
    }
    setDraftLabel("");
    setDraftBody("");
  }

  function addPage() {
    const title = newPageTitle.trim();
    if (!title) return;
    const id = `page-custom-${Date.now()}`;
    setPages((current) => [...current, { id, kind: "custom", title, subtitle: newPageSubtitle.trim(), sectionIds: [], designDraft: true }]);
    setNewPageTitle("");
    setNewPageSubtitle("");
    setActiveScreen(id);
  }

  function addOffer() {
    setOffers((current) => [...current, {
      id: `offer-${Date.now()}`,
      title: lang === "bg" ? "Нова оферта" : "New offer",
      discountLabel: "-10%",
      body: lang === "bg" ? "Design чернова — потвърдете реалните условия във Factory." : "Design draft — confirm real terms in Factory.",
      validityLabel: lang === "bg" ? "Добавете валидност" : "Add validity",
      ctaLabel: lang === "bg" ? "Разгледай" : "Explore",
      designDraft: true,
    }]);
  }

  function addMessage() {
    setMessages((current) => [...current, {
      id: `message-${Date.now()}`,
      kind: "operational",
      channel: "in_app",
      title: lang === "bg" ? "Ново съобщение" : "New message",
      body: lang === "bg" ? "Design чернова за хотелско съобщение." : "Design draft for a hotel message.",
      marketingConsentRequired: false,
      timeSensitiveAllowed: false,
      designDraft: true,
    }]);
  }

  function moveNav(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= navigation.length) return;
    setNavigation((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  return (
    <section className="rounded-[2rem] border border-violet-300/20 bg-black/20 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">{copy.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-semibold text-neutral-100 sm:text-3xl">{copy.title}</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">{copy.draft}</span>
          <span className={`rounded-full border px-3 py-2 text-[10px] font-semibold uppercase ${blockers ? "border-rose-300/20 text-rose-200" : warnings ? "border-amber-300/20 text-amber-200" : "border-emerald-300/20 text-emerald-200"}`}>QA {blockers} block · {warnings} warn</span>
          <button type="button" onClick={reset} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs font-semibold text-neutral-400 hover:text-neutral-100">{copy.reset}</button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_450px]">
        <div className="min-w-0">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(["structure", "pages", "campaigns", "navigation", "style", "qa"] as BuilderPanel[]).map((id) => (
              <button key={id} type="button" onClick={() => setPanel(id)} className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-semibold transition ${panel === id ? "border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-100" : "border-white/5 bg-neutral-950/60 text-neutral-500 hover:text-neutral-200"}`}>{copy[id]}</button>
            ))}
          </div>

          <div className="mt-3 rounded-3xl border border-white/5 bg-neutral-950/70 p-4 sm:p-5">
            {panel === "structure" && <StructurePanel copy={copy} lang={lang} preset={preset} setPreset={setPreset} modules={modules} toggleModule={toggleModule} sections={allSections} hiddenSections={hiddenSections} toggleSection={toggleSection} targetSection={targetSection} setTargetSection={setTargetSection} draftSectionTitle={draftSectionTitle} setDraftSectionTitle={setDraftSectionTitle} draftLabel={draftLabel} setDraftLabel={setDraftLabel} draftBody={draftBody} setDraftBody={setDraftBody} addDraftContent={addDraftContent} />}
            {panel === "pages" && <PagesPanel copy={copy} pages={pages} sections={allSections} setPages={setPages} setActiveScreen={setActiveScreen} newPageTitle={newPageTitle} setNewPageTitle={setNewPageTitle} newPageSubtitle={newPageSubtitle} setNewPageSubtitle={setNewPageSubtitle} addPage={addPage} />}
            {panel === "campaigns" && <CampaignsPanel copy={copy} promotions={promotions} setPromotions={setPromotions} offers={offers} setOffers={setOffers} addOffer={addOffer} messages={messages} setMessages={setMessages} addMessage={addMessage} />}
            {panel === "navigation" && <NavigationPanel copy={copy} navigation={navigation} setNavigation={setNavigation} pages={pages} moveNav={moveNav} searchEnabled={searchEnabled} setSearchEnabled={setSearchEnabled} />}
            {panel === "style" && <StylePanel copy={copy} proposal={proposal} primaryColor={primaryColor} setPrimaryColor={setPrimaryColor} secondaryColor={secondaryColor} setSecondaryColor={setSecondaryColor} backgroundColor={backgroundColor} setBackgroundColor={setBackgroundColor} headingFont={headingFont} setHeadingFont={setHeadingFont} bodyFont={bodyFont} setBodyFont={setBodyFont} />}
            {panel === "qa" && <QaPanel copy={copy} checks={qa} />}
          </div>
          <p className="mt-3 rounded-2xl border border-amber-300/10 bg-amber-300/[0.025] p-4 text-xs leading-5 text-amber-100/65">{copy.operationalBoundary}</p>
        </div>

        <MobilePreview copy={copy} pkg={pkg} proposal={proposal} preset={preset} primaryColor={primaryColor} secondaryColor={secondaryColor} backgroundColor={backgroundColor} headingFont={headingFont} bodyFont={bodyFont} modules={modules} visibleSections={visibleSections} pages={pages} activePage={activePage} activeScreen={activeScreen} setActiveScreen={setActiveScreen} navigation={navigation} offers={offers} messages={messages} promotions={promotions} bannerDismissed={bannerDismissed} setBannerDismissed={setBannerDismissed} searchEnabled={searchEnabled} />
      </div>
    </section>
  );
}

function StructurePanel({ copy, lang, preset, setPreset, modules, toggleModule, sections, hiddenSections, toggleSection, targetSection, setTargetSection, draftSectionTitle, setDraftSectionTitle, draftLabel, setDraftLabel, draftBody, setDraftBody, addDraftContent }: any) {
  return <div className="space-y-6">
    <div><PanelTitle title={copy.structure} detail={copy.manualHelp} /><label className="mt-4 block text-xs text-neutral-500">{copy.preset}<select value={preset} onChange={(e) => setPreset(e.target.value as HubExperiencePreset)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200">{Object.entries(PRESET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <div><MiniTitle>{copy.modules}</MiniTitle><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.keys(MODULE_LABELS).map((module) => <ToggleCard key={module} label={MODULE_LABELS[module][lang]} active={modules.includes(module)} onClick={() => toggleModule(module)} />)}</div></div>
    <div><MiniTitle>{copy.sections}</MiniTitle><div className="mt-3 grid gap-2 sm:grid-cols-2">{sections.map((section: HubDesignSection) => <ToggleCard key={section.id} label={section.title} detail={`${section.items.length}`} active={!hiddenSections.includes(section.id)} onClick={() => toggleSection(section.id)} />)}</div></div>
    <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4"><MiniTitle>{copy.manualContent}</MiniTitle><p className="mt-2 text-xs leading-5 text-neutral-500">{copy.manualHelp}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><FieldSelect label={copy.target} value={targetSection} onChange={setTargetSection} options={[{ value: NEW_SECTION, label: copy.newSection }, ...sections.map((s: HubDesignSection) => ({ value: s.id, label: s.title }))]} />{targetSection === NEW_SECTION && <FieldInput label={copy.sectionTitle} value={draftSectionTitle} onChange={setDraftSectionTitle} />}<FieldInput label={copy.cardTitle} value={draftLabel} onChange={setDraftLabel} /><FieldInput label={copy.cardBody} value={draftBody} onChange={setDraftBody} /></div><button type="button" onClick={addDraftContent} className="mt-3 min-h-11 rounded-xl border border-cyan-300/20 px-4 text-xs font-semibold text-cyan-100">{copy.addCard}</button></div>
  </div>;
}

function PagesPanel({ copy, pages, sections, setPages, setActiveScreen, newPageTitle, setNewPageTitle, newPageSubtitle, setNewPageSubtitle, addPage }: any) {
  function togglePageSection(pageId: string, sectionId: string) { setPages((current: HubInternalPage[]) => current.map((page) => page.id === pageId ? { ...page, sectionIds: page.sectionIds.includes(sectionId) ? page.sectionIds.filter((id) => id !== sectionId) : [...page.sectionIds, sectionId] } : page)); }
  return <div><PanelTitle title={copy.pages} detail={copy.pagesHelp} /><div className="mt-4 space-y-3">{pages.map((page: HubInternalPage) => <div key={page.id} className="rounded-2xl border border-white/5 bg-black/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-neutral-200">{page.title}</p><p className="mt-1 text-xs text-neutral-500">{page.subtitle}</p></div><button type="button" onClick={() => setActiveScreen(page.id)} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs text-neutral-300">{copy.previewPage}</button></div>{page.kind !== "offers" && page.kind !== "messages" && <div className="mt-3 flex flex-wrap gap-2">{sections.map((section: HubDesignSection) => <button key={`${page.id}:${section.id}`} type="button" onClick={() => togglePageSection(page.id, section.id)} className={`min-h-11 rounded-xl border px-3 text-xs ${page.sectionIds.includes(section.id) ? "border-cyan-300/20 bg-cyan-300/[0.05] text-cyan-100" : "border-white/5 text-neutral-600"}`}>{section.title}</button>)}</div>}{page.kind === "custom" && <button type="button" onClick={() => setPages((current: HubInternalPage[]) => current.filter((item) => item.id !== page.id))} className="mt-3 min-h-11 text-xs text-rose-300/70">{copy.remove}</button>}</div>)}</div><div className="mt-5 rounded-2xl border border-violet-300/10 bg-violet-300/[0.025] p-4"><MiniTitle>{copy.addPage}</MiniTitle><div className="mt-3 grid gap-3 sm:grid-cols-2"><FieldInput label={copy.pageTitle} value={newPageTitle} onChange={setNewPageTitle} /><FieldInput label={copy.pageSubtitle} value={newPageSubtitle} onChange={setNewPageSubtitle} /></div><button type="button" onClick={addPage} className="mt-3 min-h-11 rounded-xl border border-violet-300/20 px-4 text-xs font-semibold text-violet-100">{copy.addPage}</button></div></div>;
}

function CampaignsPanel({ copy, promotions, setPromotions, offers, setOffers, addOffer, messages, setMessages, addMessage }: any) {
  const promo = promotions[0];
  return <div><PanelTitle title={copy.campaigns} detail={copy.campaignsHelp} />{promo && <div className="mt-4 rounded-2xl border border-amber-300/10 bg-amber-300/[0.025] p-4"><div className="flex items-center justify-between gap-3"><MiniTitle>{copy.floatingBanner}</MiniTitle><label className="flex items-center gap-2 text-xs text-neutral-400"><input type="checkbox" checked={promotions.length > 0} onChange={(e) => setPromotions(e.target.checked ? [promo] : [])} />{copy.enabled}</label></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><FieldInput label={copy.promoTitle} value={promo.title} onChange={(value) => setPromotions([{ ...promo, title: value }])} /><FieldInput label={copy.cta} value={promo.ctaLabel} onChange={(value) => setPromotions([{ ...promo, ctaLabel: value }])} /><FieldInput label={copy.promoBody} value={promo.body} onChange={(value) => setPromotions([{ ...promo, body: value }])} /><FieldSelect label={copy.placement} value={promo.placement} onChange={(value) => setPromotions([{ ...promo, placement: value }])} options={[{ value: "floating_bottom", label: "Floating bottom" }, { value: "top", label: "Top" }, { value: "inline", label: "Inline" }]} /></div></div>}
    <div className="mt-5"><div className="flex items-center justify-between"><MiniTitle>{copy.offers}</MiniTitle><button type="button" onClick={addOffer} className="min-h-11 text-xs font-semibold text-cyan-200">{copy.addOffer}</button></div><div className="mt-3 space-y-3">{offers.map((offer: HubOfferDraft, index: number) => <div key={offer.id} className="grid gap-3 rounded-2xl border border-white/5 bg-black/20 p-4 sm:grid-cols-2"><FieldInput label={copy.cardTitle} value={offer.title} onChange={(value) => setOffers((current: HubOfferDraft[]) => current.map((item) => item.id === offer.id ? { ...item, title: value } : item))} /><FieldInput label={copy.discount} value={offer.discountLabel} onChange={(value) => setOffers((current: HubOfferDraft[]) => current.map((item) => item.id === offer.id ? { ...item, discountLabel: value } : item))} /><FieldInput label={copy.cardBody} value={offer.body} onChange={(value) => setOffers((current: HubOfferDraft[]) => current.map((item) => item.id === offer.id ? { ...item, body: value } : item))} /><FieldInput label={copy.validity} value={offer.validityLabel} onChange={(value) => setOffers((current: HubOfferDraft[]) => current.map((item) => item.id === offer.id ? { ...item, validityLabel: value } : item))} />{index > 0 && <button type="button" onClick={() => setOffers((current: HubOfferDraft[]) => current.filter((item) => item.id !== offer.id))} className="min-h-11 text-left text-xs text-rose-300/70">{copy.remove}</button>}</div>)}</div></div>
    <div className="mt-5"><div className="flex items-center justify-between"><MiniTitle>{copy.messages}</MiniTitle><button type="button" onClick={addMessage} className="min-h-11 text-xs font-semibold text-cyan-200">{copy.addMessage}</button></div><div className="mt-3 space-y-3">{messages.map((message: HubMessageDraft) => <div key={message.id} className="rounded-2xl border border-white/5 bg-black/20 p-4"><div className="grid gap-3 sm:grid-cols-2"><FieldInput label={copy.cardTitle} value={message.title} onChange={(value) => setMessages((current: HubMessageDraft[]) => current.map((item) => item.id === message.id ? { ...item, title: value } : item))} /><FieldInput label={copy.cardBody} value={message.body} onChange={(value) => setMessages((current: HubMessageDraft[]) => current.map((item) => item.id === message.id ? { ...item, body: value } : item))} /><FieldSelect label={copy.messageType} value={message.kind} onChange={(value) => setMessages((current: HubMessageDraft[]) => current.map((item) => item.id === message.id ? { ...item, kind: value, marketingConsentRequired: value === "marketing" ? true : item.marketingConsentRequired } : item))} options={[{ value: "operational", label: "Operational" }, { value: "stay", label: "Stay" }, { value: "marketing", label: "Marketing" }]} /><FieldSelect label={copy.channel} value={message.channel} onChange={(value) => setMessages((current: HubMessageDraft[]) => current.map((item) => item.id === message.id ? { ...item, channel: value } : item))} options={[{ value: "in_app", label: "In-app" }, { value: "push", label: "Push" }]} /></div>{message.kind === "marketing" && message.channel === "push" && <label className="mt-3 flex items-center gap-2 text-xs text-amber-100/70"><input type="checkbox" checked={message.marketingConsentRequired} onChange={(e) => setMessages((current: HubMessageDraft[]) => current.map((item) => item.id === message.id ? { ...item, marketingConsentRequired: e.target.checked } : item))} />{copy.consent}</label>}</div>)}</div></div>
  </div>;
}

function NavigationPanel({ copy, navigation, setNavigation, pages, moveNav, searchEnabled, setSearchEnabled }: any) {
  return <div><PanelTitle title={copy.navigation} detail={copy.navHelp} /><label className="mt-4 flex min-h-11 items-center gap-3 rounded-2xl border border-white/5 bg-black/20 px-4 text-sm text-neutral-300"><input type="checkbox" checked={searchEnabled} onChange={(e) => setSearchEnabled(e.target.checked)} />{copy.search}</label><div className="mt-4 space-y-2">{navigation.map((item: HubNavigationItem, index: number) => <div key={item.id} className="grid gap-2 rounded-2xl border border-white/5 bg-black/20 p-3 sm:grid-cols-[1fr_1.3fr_auto]"><input value={item.label} onChange={(e) => setNavigation((current: HubNavigationItem[]) => current.map((nav) => nav.id === item.id ? { ...nav, label: e.target.value } : nav))} className="min-h-11 rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200" /><select value={item.pageId} onChange={(e) => setNavigation((current: HubNavigationItem[]) => current.map((nav) => nav.id === item.id ? { ...nav, pageId: e.target.value } : nav))} className="min-h-11 rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm text-neutral-200"><option value="home">{copy.home}</option>{pages.map((page: HubInternalPage) => <option key={`${item.id}:${page.id}`} value={page.id}>{page.title}</option>)}</select><div className="flex gap-1"><button type="button" aria-label={copy.up} onClick={() => moveNav(index, -1)} className="min-h-11 min-w-11 rounded-xl border border-white/10">↑</button><button type="button" aria-label={copy.down} onClick={() => moveNav(index, 1)} className="min-h-11 min-w-11 rounded-xl border border-white/10">↓</button></div></div>)}</div></div>;
}

function StylePanel({ copy, proposal, primaryColor, setPrimaryColor, secondaryColor, setSecondaryColor, backgroundColor, setBackgroundColor, headingFont, setHeadingFont, bodyFont, setBodyFont }: any) {
  return <div><PanelTitle title={copy.style} detail={copy.styleHelp} /><div className="mt-4 grid gap-4 sm:grid-cols-2"><ColorField label={copy.primary} value={primaryColor} onChange={setPrimaryColor} /><ColorField label={copy.secondary} value={secondaryColor} onChange={setSecondaryColor} /><ColorField label={copy.background} value={backgroundColor} onChange={setBackgroundColor} /><FieldSelect label={copy.headingFont} value={headingFont} onChange={setHeadingFont} options={proposal.availableFonts.map((font: string) => ({ value: font, label: font }))} /><FieldSelect label={copy.bodyFont} value={bodyFont} onChange={setBodyFont} options={proposal.availableFonts.map((font: string) => ({ value: font, label: font }))} /></div><div className="mt-5 flex flex-wrap gap-2">{proposal.availableColors.map((color: string) => <button key={color} type="button" onClick={() => setPrimaryColor(color)} className="min-h-11 rounded-xl border border-white/10 px-3 text-xs text-neutral-300"><span className="mr-2 inline-block h-4 w-4 rounded-full align-middle" style={{ backgroundColor: color }} />{color}</button>)}</div></div>;
}

function QaPanel({ copy, checks }: any) { return <div><PanelTitle title={copy.qa} detail={copy.qaHelp} /><div className="mt-4 space-y-2">{checks.map((check: any) => <div key={check.id} className={`rounded-2xl border p-4 ${check.severity === "pass" ? "border-emerald-300/10 bg-emerald-300/[0.025]" : check.severity === "warn" ? "border-amber-300/10 bg-amber-300/[0.025]" : "border-rose-300/15 bg-rose-300/[0.03]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-neutral-200">{check.title}</p><p className="mt-1 text-xs leading-5 text-neutral-500">{check.detail}</p></div><span className="text-[10px] font-bold uppercase tracking-[0.12em]">{check.severity === "pass" ? copy.qaPass : check.severity === "warn" ? copy.qaWarn : copy.qaBlock}</span></div></div>)}</div></div>; }

function MobilePreview({ copy, pkg, proposal, preset, primaryColor, secondaryColor, backgroundColor, headingFont, bodyFont, modules, visibleSections, pages, activePage, activeScreen, setActiveScreen, navigation, offers, messages, promotions, bannerDismissed, setBannerDismissed, searchEnabled }: any) {
  const floating = promotions.find((promo: HubPromotionDraft) => promo.placement === "floating_bottom");
  const pageSections = activePage ? visibleSections.filter((section: HubDesignSection) => activePage.sectionIds.includes(section.id)) : [];
  return <div className="2xl:sticky 2xl:top-4"><p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600">{copy.preview} · {PRESET_LABELS[preset as HubExperiencePreset]}</p><div className="mx-auto w-full max-w-[410px] overflow-hidden rounded-[2.5rem] border-[7px] border-neutral-800 bg-white shadow-[0_40px_100px_rgba(0,0,0,0.45)]"><div className="flex h-7 items-center justify-center bg-neutral-900"><div className="h-1.5 w-20 rounded-full bg-neutral-700" /></div><div className="relative flex h-[760px] flex-col overflow-hidden" style={{ backgroundColor, color: proposal.theme.textColor, fontFamily: `"${bodyFont}", system-ui, sans-serif` }}>
    <div className="flex-1 overflow-y-auto pb-28">
      {activeScreen === "home" ? <HomeScreen copy={copy} pkg={pkg} proposal={proposal} primaryColor={primaryColor} secondaryColor={secondaryColor} headingFont={headingFont} modules={modules} visibleSections={visibleSections} offers={offers} messages={messages} searchEnabled={searchEnabled} setActiveScreen={setActiveScreen} /> : activePage?.kind === "offers" ? <OffersScreen copy={copy} page={activePage} offers={offers} primaryColor={primaryColor} /> : activePage?.kind === "messages" ? <MessagesScreen copy={copy} page={activePage} messages={messages} primaryColor={primaryColor} /> : <ContentPage page={activePage} sections={pageSections} primaryColor={primaryColor} headingFont={headingFont} />}
    </div>
    {floating && !bannerDismissed && <div className="absolute bottom-[76px] left-3 right-3 rounded-2xl border border-black/5 bg-white/95 p-3 shadow-xl backdrop-blur-xl"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-neutral-900">{floating.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-neutral-500">{floating.body}</p><button type="button" className="mt-2 min-h-11 text-[10px] font-bold" style={{ color: primaryColor }}>{floating.ctaLabel}</button></div><button type="button" aria-label={copy.dismiss} onClick={() => setBannerDismissed(true)} className="min-h-11 min-w-11 rounded-full text-neutral-500">×</button></div></div>}
    <nav className="absolute inset-x-0 bottom-0 grid min-h-[72px] border-t border-black/5 bg-white/90 px-1 py-1 backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${navigation.length}, minmax(0,1fr))` }}>{navigation.map((item: HubNavigationItem) => { const active = item.pageId === activeScreen || (item.role === "home" && activeScreen === "home"); return <button key={item.id} type="button" onClick={() => { setActiveScreen(item.pageId); setBannerDismissed(false); }} className="min-h-11 rounded-xl px-1 text-[9px] font-semibold" style={{ color: active ? primaryColor : "#777" }}><span className="mx-auto mb-1 block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: active ? primaryColor : "transparent" }} />{item.label}</button>; })}</nav>
  </div></div></div>;
}

function HomeScreen({ copy, pkg, proposal, primaryColor, secondaryColor, headingFont, modules, visibleSections, offers, messages, searchEnabled, setActiveScreen }: any) {
  return <><div className="relative overflow-hidden px-5 pb-7 pt-5 text-white" style={{ background: `linear-gradient(145deg, ${secondaryColor}, ${primaryColor})` }}><div className="absolute -right-12 -top-12 h-36 w-36 rounded-full border border-white/15" /><div className="relative"><div className="flex items-center justify-between"><span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em]">StayHub</span><span className="text-[9px] uppercase tracking-[0.12em] opacity-65">Design preview</span></div><p className="mt-7 text-[10px] uppercase tracking-[0.16em] opacity-70">{copy.welcome}</p><h4 className="mt-1 text-[27px] leading-tight" style={{ fontFamily: `"${headingFont}", Georgia, serif` }}>{proposal.hotelName}</h4><p className="mt-3 line-clamp-3 text-[11px] leading-5 opacity-80">{pkg.hotelProfileLayer.identity.summary}</p></div></div><div className="space-y-4 px-4 pt-4">{searchEnabled && <button type="button" className="min-h-11 w-full rounded-2xl border border-black/5 bg-white px-4 text-left text-xs text-neutral-400 shadow-sm">⌕ {copy.explore}</button>}{modules.includes("quick_actions") && <div className="grid grid-cols-2 gap-2">{visibleSections.slice(0, 6).map((section: HubDesignSection, index: number) => <button key={section.id} type="button" className="min-h-[92px] rounded-2xl border border-black/5 bg-white p-3 text-left shadow-sm"><span className="flex h-7 w-7 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: index % 2 ? secondaryColor : primaryColor }}>{section.title.slice(0, 1)}</span><p className="mt-3 text-xs font-semibold text-neutral-800">{section.title}</p><p className="mt-1 line-clamp-1 text-[9px] text-neutral-400">{section.items[0]?.label}</p></button>)}</div>}{modules.includes("offer_teaser") && offers[0] && <button type="button" onClick={() => setActiveScreen("page-offers")} className="min-h-24 w-full rounded-2xl p-4 text-left text-white" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}><span className="rounded-full bg-white/15 px-2 py-1 text-[9px] font-bold">{offers[0].discountLabel}</span><p className="mt-3 text-sm font-semibold">{offers[0].title}</p><p className="mt-1 line-clamp-2 text-[10px] opacity-75">{offers[0].body}</p></button>}{modules.includes("message_teaser") && <button type="button" onClick={() => setActiveScreen("page-messages")} className="flex min-h-16 w-full items-center justify-between rounded-2xl border border-black/5 bg-white p-4 text-left"><div><p className="text-xs font-semibold text-neutral-800">{copy.inbox}</p><p className="mt-1 text-[10px] text-neutral-400">{messages[0]?.title}</p></div><span className="flex h-7 min-w-7 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: primaryColor }}>{messages.length}</span></button>}{modules.includes("survey_card") && <div className="rounded-2xl border border-black/5 bg-white p-4"><p className="text-xs font-semibold text-neutral-800">{copy.survey}</p><p className="mt-1 text-[10px] leading-4 text-neutral-400">{copy.surveyBody}</p><div className="mt-3 flex gap-2">{[1,2,3,4,5].map((n) => <span key={n} className="flex h-8 w-8 items-center justify-center rounded-full border border-black/5 text-[10px] text-neutral-500">{n}</span>)}</div></div>}{modules.includes("ai_concierge") && <div className="rounded-2xl border border-black/5 bg-white p-4"><p className="text-xs font-semibold text-neutral-800">{copy.ai}</p><p className="mt-1 text-[10px] text-neutral-400">{copy.aiBody}</p></div>}{modules.includes("weather") && <div className="rounded-2xl border border-black/5 bg-white p-4 text-xs text-neutral-700">☀ {copy.weather}</div>}{modules.includes("contact_strip") && <div className="rounded-2xl border border-black/5 bg-white p-4 text-xs text-neutral-700">☎ {copy.contact}</div>}</div></>;
}

function ContentPage({ page, sections, primaryColor, headingFont }: any) { if (!page) return null; return <div><PageHero page={page} headingFont={headingFont} /><div className="space-y-3 px-4 py-4">{sections.map((section: HubDesignSection) => <div key={section.id} className="rounded-2xl border border-black/5 bg-white p-4"><p className="text-sm font-semibold text-neutral-800">{section.title}</p><div className="mt-3 space-y-3">{section.items.slice(0, 5).map((item) => <div key={item.id} className="border-t border-black/5 pt-3 first:border-0 first:pt-0"><p className="text-[11px] font-semibold" style={{ color: primaryColor }}>{item.label}</p><p className="mt-1 text-[10px] leading-4 text-neutral-500">{item.value}</p></div>)}</div></div>)}</div></div>; }
function OffersScreen({ copy, page, offers, primaryColor }: any) { return <div><PageHero page={page} /><div className="space-y-3 px-4 py-4">{offers.map((offer: HubOfferDraft) => <div key={offer.id} className="rounded-2xl border border-black/5 bg-white p-4"><span className="rounded-full px-2 py-1 text-[9px] font-bold text-white" style={{ backgroundColor: primaryColor }}>{offer.discountLabel}</span><p className="mt-3 text-sm font-semibold text-neutral-800">{offer.title}</p><p className="mt-2 text-[10px] leading-4 text-neutral-500">{offer.body}</p><p className="mt-3 text-[9px] text-neutral-400">{offer.validityLabel}</p><button type="button" className="mt-3 min-h-11 text-xs font-bold" style={{ color: primaryColor }}>{offer.ctaLabel} →</button></div>)}</div></div>; }
function MessagesScreen({ page, messages, primaryColor }: any) { return <div><PageHero page={page} /><div className="space-y-2 px-4 py-4">{messages.map((message: HubMessageDraft, index: number) => <div key={message.id} className="rounded-2xl border border-black/5 bg-white p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: primaryColor }}>{message.kind} · {message.channel}</p><p className="mt-1 text-sm font-semibold text-neutral-800">{message.title}</p></div>{index === 0 && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: primaryColor }} />}</div><p className="mt-2 text-[10px] leading-4 text-neutral-500">{message.body}</p>{message.marketingConsentRequired && <p className="mt-2 text-[9px] text-amber-600">marketing consent required</p>}</div>)}</div></div>; }
function PageHero({ page, headingFont }: any) { return <div className="border-b border-black/5 bg-white px-5 pb-5 pt-6"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Internal page</p><h4 className="mt-2 text-2xl text-neutral-900" style={{ fontFamily: headingFont ? `"${headingFont}", Georgia, serif` : undefined }}>{page?.title}</h4><p className="mt-2 text-[11px] leading-5 text-neutral-500">{page?.subtitle}</p></div>; }

function PanelTitle({ title, detail }: { title: string; detail: string }) { return <div><h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-200">{title}</h4><p className="mt-2 text-sm leading-6 text-neutral-500">{detail}</p></div>; }
function MiniTitle({ children }: { children: React.ReactNode }) { return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{children}</p>; }
function ToggleCard({ label, detail, active, onClick }: { label: string; detail?: string; active: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex min-h-14 items-center justify-between rounded-2xl border p-3 text-left ${active ? "border-cyan-300/15 bg-cyan-300/[0.04]" : "border-white/5 bg-black/20 opacity-50"}`}><span className="text-xs font-semibold text-neutral-300">{label}</span><span className="text-[10px] text-neutral-600">{detail || (active ? "●" : "○")}</span></button>; }
function FieldInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm normal-case tracking-normal text-neutral-200 outline-none" /></label>; }
function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: any) => void; options: Array<{ value: string; label: string }> }) { return <label className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 text-sm normal-case tracking-normal text-neutral-200 outline-none">{options.map((option) => <option key={`${label}:${option.value}`} value={option.value}>{option.label}</option>)}</select></label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-[10px] uppercase tracking-[0.12em] text-neutral-600">{label}<div className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-neutral-900 p-1.5"><input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-10 cursor-pointer rounded-lg bg-transparent" /><span className="text-xs text-neutral-300">{value}</span></div></label>; }
