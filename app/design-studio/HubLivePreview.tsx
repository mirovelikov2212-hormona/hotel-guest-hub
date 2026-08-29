"use client";

import { useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import { buildHubDesignProposal } from "@/lib/product-factory/hub-design-proposal";

const COPY = {
  bg: {
    title: "Live Hub Preview",
    subtitle: "Автоматично предложение от Hotel Intelligence Package. Всички промени са само локална design чернова.",
    theme: "Theme controls",
    primary: "Основен цвят",
    secondary: "Втори цвят",
    background: "Фон",
    headingFont: "Шрифт заглавия",
    bodyFont: "Шрифт текст",
    reset: "Върни AI предложението",
    preview: "Мобилен Hub preview",
    welcome: "Добре дошли",
    explore: "Какво търсите?",
    info: "Информация за хотела",
    confidence: "доказаност",
    noImage: "Hero изображение след одобрение от хотела",
    assetPolicy: "Снимки и лого не се използват автоматично",
    sections: "Hub секции",
    sectionCount: "секции",
    contentCount: "елемента",
    draft: "DESIGN PREVIEW",
  },
  en: {
    title: "Live Hub Preview",
    subtitle: "An automatic proposal from the Hotel Intelligence Package. All changes remain a local design draft.",
    theme: "Theme controls",
    primary: "Primary color",
    secondary: "Secondary color",
    background: "Background",
    headingFont: "Heading font",
    bodyFont: "Body font",
    reset: "Reset proposal",
    preview: "Mobile Hub preview",
    welcome: "Welcome",
    explore: "What are you looking for?",
    info: "Hotel information",
    confidence: "confidence",
    noImage: "Hero image after hotel approval",
    assetPolicy: "Images and logo are not used automatically",
    sections: "Hub sections",
    sectionCount: "sections",
    contentCount: "items",
    draft: "DESIGN PREVIEW",
  },
} as const;

export default function HubLivePreview({ pkg, lang }: { pkg: HotelIntelligencePackage; lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const proposal = useMemo(() => buildHubDesignProposal(pkg, lang), [pkg, lang]);
  const [primaryColor, setPrimaryColor] = useState(proposal.theme.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(proposal.theme.secondaryColor);
  const [backgroundColor, setBackgroundColor] = useState(proposal.theme.backgroundColor);
  const [headingFont, setHeadingFont] = useState(proposal.theme.headingFont);
  const [bodyFont, setBodyFont] = useState(proposal.theme.bodyFont);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);

  const visibleSections = proposal.sections.filter((section) => !hiddenSections.includes(section.id));
  const quickSections = proposal.quickActions
    .map((id) => visibleSections.find((section) => section.id === id))
    .filter((section): section is NonNullable<typeof section> => Boolean(section));

  function reset() {
    setPrimaryColor(proposal.theme.primaryColor);
    setSecondaryColor(proposal.theme.secondaryColor);
    setBackgroundColor(proposal.theme.backgroundColor);
    setHeadingFont(proposal.theme.headingFont);
    setBodyFont(proposal.theme.bodyFont);
    setHiddenSections([]);
  }

  function toggleSection(id: string) {
    setHiddenSections((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  return (
    <section className="rounded-[2rem] border border-violet-300/20 bg-black/20 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/70">Design Studio</p>
          <h3 className="mt-2 text-2xl font-semibold text-neutral-100">{copy.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.05] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-100/70">{copy.draft}</span>
          <button type="button" onClick={reset} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-neutral-400 transition hover:border-white/20 hover:text-neutral-200">{copy.reset}</button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-white/5 bg-neutral-950/70 p-5">
            <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{copy.theme}</h4>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <ColorControl label={copy.primary} value={primaryColor} options={proposal.availableColors} onChange={setPrimaryColor} />
              <ColorControl label={copy.secondary} value={secondaryColor} options={proposal.availableColors} onChange={setSecondaryColor} />
              <ColorControl label={copy.background} value={backgroundColor} options={proposal.availableColors} onChange={setBackgroundColor} />
              <SelectControl label={copy.headingFont} value={headingFont} options={proposal.availableFonts} onChange={setHeadingFont} />
              <SelectControl label={copy.bodyFont} value={bodyFont} options={proposal.availableFonts} onChange={setBodyFont} />
            </div>
          </section>

          <section className="rounded-3xl border border-white/5 bg-neutral-950/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-neutral-300">{copy.sections}</h4>
              <span className="text-xs text-neutral-600">{visibleSections.length} {copy.sectionCount}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {proposal.sections.map((section) => {
                const enabled = !hiddenSections.includes(section.id);
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${enabled ? "border-violet-300/15 bg-violet-300/[0.04]" : "border-white/5 bg-black/20 opacity-45"}`}
                  >
                    <span>
                      <span className="block text-xs font-semibold text-neutral-300">{section.title}</span>
                      <span className="mt-1 block text-[10px] text-neutral-600">{section.items.length} {copy.contentCount}</span>
                    </span>
                    <span className={`h-2.5 w-2.5 rounded-full ${enabled ? "bg-emerald-300" : "bg-neutral-700"}`} />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-amber-300/15 bg-amber-300/[0.03] p-4">
            <p className="text-xs leading-5 text-amber-100/70">{copy.assetPolicy}. {copy.noImage}.</p>
          </section>
        </div>

        <div>
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600">{copy.preview}</p>
          <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[2.3rem] border-[7px] border-neutral-800 bg-white shadow-[0_40px_100px_rgba(0,0,0,0.45)]">
            <div className="flex h-7 items-center justify-center bg-neutral-900">
              <div className="h-1.5 w-20 rounded-full bg-neutral-700" />
            </div>
            <div
              className="min-h-[690px] pb-7"
              style={{
                backgroundColor,
                color: proposal.theme.textColor,
                fontFamily: `"${bodyFont}", system-ui, sans-serif`,
              }}
            >
              <div
                className="relative overflow-hidden px-5 pb-7 pt-6"
                style={{
                  background: `linear-gradient(145deg, ${secondaryColor}, ${primaryColor})`,
                  color: "#FFFFFF",
                }}
              >
                <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border border-white/10" />
                <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-white/[0.05]" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em]">StayHub</span>
                    <span className="text-[9px] uppercase tracking-[0.13em] opacity-70">{copy.draft}</span>
                  </div>
                  <p className="mt-7 text-[11px] uppercase tracking-[0.16em] opacity-70">{copy.welcome}</p>
                  <h5
                    className="mt-1 text-[28px] leading-tight"
                    style={{ fontFamily: `"${headingFont}", Georgia, serif` }}
                  >
                    {proposal.hotelName}
                  </h5>
                  <p className="mt-3 max-w-[280px] text-xs leading-5 opacity-80">{pkg.hotelProfileLayer.identity.summary}</p>
                </div>
              </div>

              <div className="px-4 pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-50">{copy.explore}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {quickSections.map((section, index) => (
                    <div
                      key={section.id}
                      className="min-h-24 rounded-2xl border p-3 shadow-sm"
                      style={{
                        backgroundColor: proposal.theme.surfaceColor,
                        borderColor: `${primaryColor}30`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: index % 2 === 0 ? primaryColor : secondaryColor }}>
                          {section.title.slice(0, 1)}
                        </span>
                        <span className="text-[9px] opacity-35">{section.items.length}</span>
                      </div>
                      <p className="mt-3 text-xs font-semibold leading-4">{section.title}</p>
                      <p className="mt-1 line-clamp-2 text-[9px] leading-4 opacity-50">{section.items[0]?.label}</p>
                    </div>
                  ))}
                </div>

                {visibleSections.slice(6, 9).length > 0 && (
                  <div className="mt-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-50">{copy.info}</p>
                    <div className="mt-3 space-y-2">
                      {visibleSections.slice(6, 9).map((section) => (
                        <div key={`info:${section.id}`} className="rounded-2xl border p-3" style={{ backgroundColor: proposal.theme.surfaceColor, borderColor: `${secondaryColor}18` }}>
                          <p className="text-xs font-semibold">{section.title}</p>
                          <p className="mt-1 line-clamp-2 text-[9px] leading-4 opacity-50">{section.items[0]?.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-center gap-1.5 opacity-35">
                  {proposal.availableColors.slice(0, 6).map((color) => <span key={color} className="h-2 w-2 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ColorControl({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1" />
        <select value={options.includes(value) ? value : "custom"} onChange={(event) => { if (event.target.value !== "custom") onChange(event.target.value); }} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 outline-none">
          {!options.includes(value) && <option value="custom">{value}</option>}
          {options.map((color) => <option key={color} value={color}>{color}</option>)}
        </select>
      </div>
    </div>
  );
}

function SelectControl({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-600">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2.5 text-xs text-neutral-300 outline-none">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
