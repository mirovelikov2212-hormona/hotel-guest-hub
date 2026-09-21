"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type {
  HotelIntelligencePackage,
  HotelOnboardingSource,
  HotelOnboardingSourceCategory,
} from "@/lib/product-factory/hotel-intelligence-package";

type QuickPreview = {
  ok?: boolean;
  mode?: "quick_preview";
  runtimeMs?: number;
  sourcePackage?: HotelIntelligencePackage;
  onboardingSources?: HotelOnboardingSource[];
  contacts?: {
    phones?: string[];
    emails?: string[];
    addresses?: string[];
    website?: string;
  };
  info?: {
    checkIn?: string;
    checkOut?: string;
    parking?: string;
  };
  error?: string;
};

const PACKAGE_STORAGE_KEY = "stayhub:hotel-intelligence-package:v1";

const CATEGORY_ORDER: HotelOnboardingSourceCategory[] = [
  "accommodation",
  "gastronomy",
  "wellness",
  "services",
  "experiences",
  "events",
  "offers",
  "policies",
  "contacts",
  "documents",
];

const COPY = {
  bg: {
    title: "Hotel Intake",
    help: "Въведи официалния хотелски сайт. Scanner-ът подрежда полезните публични страници и документи като onboarding index, без да се опитва да решава вместо нас какво точно влиза в Hub-а.",
    url: "Официален хотелски сайт",
    start: "Намери източниците",
    starting: "Сканиране…",
    preview: "Onboarding източници",
    previewHelp: "Отваряй нужните страници при ръчния onboarding. Същият списък се пренася и в Design Studio.",
    failed: "Scanner-ът не успя да извлече данните.",
    designStudio: "Отвори в Design Studio",
    found: "Намерени",
    open: "Отвори",
    page: "Страница",
    document: "Документ",
    contacts: "Контакти",
    info: "Инфо",
    brandDesign: "Бранд дизайн",
    brandHelp: "Потвърдените роли идват от реално видимата начална страница. Допълнителните CSS сигнали са само за справка.",
    confirmedBrand: "Потвърден Brand Kit",
    additionalCss: "Допълнителни CSS сигнали",
    referenceOnly: "Само за справка — не влияят автоматично на Design Studio.",
    noConfirmedColors: "Няма потвърдени цветови роли от rendered homepage.",
    colors: "Цветове",
    fonts: "Шрифтове",
    headingFont: "Заглавия",
    bodyFont: "Основен текст",
    buttonFont: "Бутони",
    buttonRadius: "Радиус на бутоните",
    cardRadius: "Радиус на картите",
    phone: "Телефон",
    address: "Адрес",
    website: "Web",
    checkIn: "Check-in",
    checkOut: "Check-out",
    parking: "Паркинг",
    notFound: "Не е открито",
  },
  en: {
    title: "Hotel Intake",
    help: "Enter the official hotel website. The Scanner organizes useful public pages and documents into an onboarding index without trying to decide what must go into the Hub.",
    url: "Official hotel website",
    start: "Find sources",
    starting: "Scanning…",
    preview: "Onboarding sources",
    previewHelp: "Open the relevant pages during manual onboarding. The same source list is handed to Design Studio.",
    failed: "The Scanner could not extract the data.",
    designStudio: "Open in Design Studio",
    found: "Found",
    open: "Open",
    page: "Page",
    document: "Document",
    contacts: "Contacts",
    info: "Info",
    brandDesign: "Brand design",
    brandHelp: "Confirmed roles come from the visibly rendered homepage. Additional CSS signals are reference-only.",
    confirmedBrand: "Confirmed Brand Kit",
    additionalCss: "Additional CSS signals",
    referenceOnly: "Reference only — they do not automatically influence Design Studio.",
    noConfirmedColors: "No confirmed color roles from the rendered homepage.",
    colors: "Colors",
    fonts: "Fonts",
    headingFont: "Heading font",
    bodyFont: "Body font",
    buttonFont: "Button font",
    buttonRadius: "Button radius",
    cardRadius: "Card radius",
    phone: "Phone",
    address: "Address",
    website: "Web",
    checkIn: "Check-in",
    checkOut: "Check-out",
    parking: "Parking",
    notFound: "Not found",
  },
} as const;

const CATEGORY_LABELS: Record<HotelOnboardingSourceCategory, { bg: string; en: string }> = {
  accommodation: { bg: "Настаняване", en: "Accommodation" },
  gastronomy: { bg: "Ресторанти и барове", en: "Restaurants & bars" },
  wellness: { bg: "SPA / Wellness", en: "SPA / Wellness" },
  services: { bg: "Услуги", en: "Services" },
  experiences: { bg: "Преживявания / Activities", en: "Experiences / Activities" },
  events: { bg: "Събития", en: "Events" },
  offers: { bg: "Оферти", en: "Offers" },
  policies: { bg: "Политики / FAQ", en: "Policies / FAQ" },
  contacts: { bg: "Контактна страница", en: "Contact page" },
  documents: { bg: "Документи / PDF", en: "Documents / PDF" },
};

const BRAND_ROLE_LABELS: Record<string, { bg: string; en: string }> = {
  primary: { bg: "Основен", en: "Primary" },
  secondary: { bg: "Вторичен", en: "Secondary" },
  accent: { bg: "Акцент", en: "Accent" },
  page_background: { bg: "Фон на страницата", en: "Page background" },
  surface: { bg: "Карти / surface", en: "Cards / surface" },
  text: { bg: "Основен текст", en: "Text" },
  muted_text: { bg: "Вторичен текст", en: "Muted text" },
  button_background: { bg: "Фон на бутон", en: "Button background" },
  button_text: { bg: "Текст на бутон", en: "Button text" },
  link: { bg: "Линкове", en: "Links" },
  header_background: { bg: "Header фон", en: "Header background" },
  hero_background: { bg: "Hero фон", en: "Hero background" },
};


function formatDuration(ms?: number) {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${Math.round(ms / 1000)} s`;
}

export default function HotelScannerV2WorkflowClient({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const [url, setUrl] = useState("https://pavelbanyagrand.com/");
  const [starting, setStarting] = useState(false);
  const [quickPreview, setQuickPreview] = useState<QuickPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startScan() {
    if (!url.trim() || starting) return;
    setStarting(true);
    setQuickPreview(null);
    setError(null);

    try {
      const response = await fetch("/api/control-plane/hotel-scanner/scan-v2-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), lang }),
      });
      const body = (await response.json().catch(() => ({}))) as QuickPreview;
      if (!response.ok || !body.ok || !body.sourcePackage) {
        setError(body.error || "scanner_intake_failed");
        return;
      }
      setQuickPreview(body);
    } catch {
      setError("network_error");
    } finally {
      setStarting(false);
    }
  }

  const groupedSources = useMemo(() => {
    const groups = new Map<HotelOnboardingSourceCategory, HotelOnboardingSource[]>();
    for (const source of quickPreview?.onboardingSources || quickPreview?.sourcePackage?.onboardingSources || []) {
      const group = groups.get(source.category) || [];
      group.push(source);
      groups.set(source.category, group);
    }
    return CATEGORY_ORDER
      .map((category) => ({ category, sources: groups.get(category) || [] }))
      .filter((group) => group.sources.length);
  }, [quickPreview]);

  const hasContacts = Boolean(
    quickPreview?.contacts?.phones?.length
    || quickPreview?.contacts?.emails?.length
    || quickPreview?.contacts?.addresses?.length
  );
  const hasInfo = Boolean(quickPreview?.info?.checkIn || quickPreview?.info?.checkOut || quickPreview?.info?.parking);
  const designSignals = quickPreview?.sourcePackage?.designIntelligenceLayer;
  const brandKit = designSignals?.brandKit;
  const confirmedBrandRoles = (brandKit?.colorRoles || []).filter((signal) =>
    signal.confidence >= 0.8 && /rendered|visible/iu.test(String(signal.evidence || "")));
  const confirmedColorSet = new Set(confirmedBrandRoles.map((signal) => signal.color.toLowerCase()));
  const additionalCssColors = (designSignals?.colors || [])
    .filter((color) => !confirmedColorSet.has(color.toLowerCase()))
    .slice(0, 12);
  const confirmedFonts = [...new Set([
    brandKit?.typography?.headingFont,
    brandKit?.typography?.bodyFont,
    brandKit?.typography?.buttonFont,
  ].filter((font): font is string => Boolean(font)))];
  const confirmedFontSet = new Set(confirmedFonts.map((font) => font.toLowerCase()));
  const additionalCssFonts = (designSignals?.fonts || [])
    .filter((font) => !confirmedFontSet.has(font.toLowerCase()))
    .slice(0, 8);
  const hasBrandKit = Boolean(
    confirmedBrandRoles.length
    || confirmedFonts.length
    || additionalCssColors.length
    || additionalCssFonts.length
  );

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
              disabled={starting}
              className="v2-input mt-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void startScan()}
            disabled={starting || !url.trim()}
            className="v2-button min-w-56"
          >
            {starting ? copy.starting : copy.start}
          </button>
        </div>
      </section>

      {error ? (
        <section className="v2-panel p-5 sm:p-6">
          <span className="v2-pill v2-pill-bad">FAILED</span>
          <p className="v2-muted mt-3 text-sm">{copy.failed}</p>
          <p className="mt-2 font-mono text-sm">{error}</p>
        </section>
      ) : null}

      {quickPreview ? (
        <section className="v2-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="v2-section-title text-xl">{copy.preview}</h2>
              <p className="v2-muted mt-1 max-w-4xl text-sm leading-6">{copy.previewHelp}</p>
            </div>
            {quickPreview.runtimeMs ? (
              <span className="v2-pill v2-pill-good">{formatDuration(quickPreview.runtimeMs)}</span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {groupedSources.map(({ category, sources }) => (
              <article key={category} className="v2-card-soft p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold">{CATEGORY_LABELS[category][lang]}</h3>
                  <span className="v2-pill v2-pill-info">{sources.length}</span>
                </div>
                <div className="mt-4 space-y-2">
                  {sources.map((source) => (
                    <div key={source.id + source.url} className="v2-card p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{source.title}</p>
                          <p className="v2-muted mt-1 text-[11px]">
                            {source.kind === "document" ? copy.document : copy.page}
                          </p>
                        </div>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="v2-source-link shrink-0 text-xs font-semibold"
                        >
                          {copy.open} ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}

            {hasBrandKit ? (
              <article className="v2-card-soft p-4 lg:col-span-2">
                <div>
                  <h3 className="font-bold">{copy.brandDesign}</h3>
                  <p className="v2-muted mt-1 text-sm">{copy.brandHelp}</p>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em]">{copy.confirmedBrand}</p>
                  {confirmedBrandRoles.length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {confirmedBrandRoles.map((signal) => (
                        <div key={signal.role + signal.color} className="v2-card flex items-center gap-3 p-3">
                          <span
                            className="h-10 w-10 shrink-0 rounded-xl border border-black/10"
                            style={{ backgroundColor: signal.color }}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold">
                              {BRAND_ROLE_LABELS[signal.role]?.[lang] || signal.role}
                            </p>
                            <p className="v2-muted mt-1 font-mono text-[11px]">{signal.color}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="v2-muted mt-3 text-sm">{copy.noConfirmedColors}</p>
                  )}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="v2-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]">{copy.fonts}</p>
                    <div className="mt-3 space-y-2 text-sm">
                      {brandKit?.typography?.headingFont ? <p><strong>{copy.headingFont}:</strong> {brandKit.typography.headingFont}</p> : null}
                      {brandKit?.typography?.bodyFont ? <p><strong>{copy.bodyFont}:</strong> {brandKit.typography.bodyFont}</p> : null}
                      {brandKit?.typography?.buttonFont ? <p><strong>{copy.buttonFont}:</strong> {brandKit.typography.buttonFont}</p> : null}
                    </div>
                  </div>
                  <div className="v2-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]">UI</p>
                    <div className="mt-3 space-y-2 text-sm">
                      {brandKit?.visualCues?.buttonRadius ? <p><strong>{copy.buttonRadius}:</strong> {brandKit.visualCues.buttonRadius}</p> : null}
                      {brandKit?.visualCues?.cardRadius ? <p><strong>{copy.cardRadius}:</strong> {brandKit.visualCues.cardRadius}</p> : null}
                    </div>
                  </div>
                </div>

                {(additionalCssColors.length || additionalCssFonts.length) ? (
                  <div className="mt-5 border-t border-black/5 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]">{copy.additionalCss}</p>
                    <p className="v2-muted mt-1 text-xs">{copy.referenceOnly}</p>
                    {additionalCssColors.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {additionalCssColors.map((color) => (
                          <div key={color} className="v2-card flex items-center gap-2 px-3 py-2">
                            <span className="h-6 w-6 rounded-lg border border-black/10" style={{ backgroundColor: color }} />
                            <span className="font-mono text-[11px]">{color}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {additionalCssFonts.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {additionalCssFonts.map((font) => (
                          <span key={font} className="v2-card px-3 py-2 text-xs">{font}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ) : null}

            <article className="v2-card-soft p-4">
              <h3 className="font-bold">{copy.contacts}</h3>
              <p className="v2-muted mt-1 text-sm">{hasContacts ? copy.found : copy.notFound}</p>
              {hasContacts ? (
                <div className="mt-4 space-y-2 text-sm">
                  {(quickPreview.contacts?.phones || []).map((phone) => (
                    <p key={`phone:${phone}`}><strong>{copy.phone}:</strong> {phone}</p>
                  ))}
                  {(quickPreview.contacts?.emails || []).map((email) => (
                    <p key={`email:${email}`}><strong>Email:</strong> {email}</p>
                  ))}
                  {(quickPreview.contacts?.addresses || []).map((address) => (
                    <p key={`address:${address}`}><strong>{copy.address}:</strong> {address}</p>
                  ))}
                  {quickPreview.contacts?.website ? (
                    <p className="break-all"><strong>{copy.website}:</strong> {quickPreview.contacts.website}</p>
                  ) : null}
                </div>
              ) : null}
            </article>

            <article className="v2-card-soft p-4">
              <h3 className="font-bold">{copy.info}</h3>
              <p className="v2-muted mt-1 text-sm">{hasInfo ? copy.found : copy.notFound}</p>
              {hasInfo ? (
                <div className="mt-4 space-y-3 text-sm">
                  {quickPreview.info?.checkIn ? <p><strong>{copy.checkIn}:</strong> {quickPreview.info.checkIn}</p> : null}
                  {quickPreview.info?.checkOut ? <p><strong>{copy.checkOut}:</strong> {quickPreview.info.checkOut}</p> : null}
                  {quickPreview.info?.parking ? <p><strong>{copy.parking}:</strong> {quickPreview.info.parking}</p> : null}
                </div>
              ) : null}
            </article>
          </div>

          {quickPreview.sourcePackage ? (
            <div className="mt-5">
              <Link
                href={`/design-studio?lang=${lang}&preview=quick`}
                onClick={() => window.sessionStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(quickPreview.sourcePackage))}
                className="v2-button inline-flex text-sm"
              >
                {copy.designStudio}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
