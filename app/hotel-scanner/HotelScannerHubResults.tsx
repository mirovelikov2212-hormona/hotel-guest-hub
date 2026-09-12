"use client";

import { buildHotelScannerHubSections } from "@/lib/ai/hotel-scanner-hub-sections.mjs";
import { buildHotelScannerBridgeSnapshot } from "@/lib/ai/hotel-scanner-live-content.mjs";
import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type VerificationStatus = "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT" | "UNSCORED";

type HubFact = {
  category: string;
  subject?: string;
  attribute?: string;
  label: string;
  value: string;
  confidence: number;
  sourceUrls: string[];
  verification?: { status?: VerificationStatus; independentSourceCount?: number; sourceUrls?: string[] };
};

type HubItem = {
  key: string;
  name: string;
  facts: HubFact[];
  sourceUrls: string[];
  verification: VerificationStatus;
  maxConfidence: number;
};

type HubSection = {
  key: keyof typeof TITLES.bg;
  facts: HubFact[];
  items: HubItem[];
  sourceUrls: string[];
};

type Props = {
  facts: HubFact[];
  contacts: { phones: string[]; emails: string[]; socialLinks: string[] };
  address: string;
  scannedAt: string;
  lang: ControlPlaneLang;
};

const TITLES = {
  bg: {
    overview: "Най-важното за хотела",
    accommodation: "Настаняване",
    dining: "Ресторанти и барове",
    wellness: "SPA / Wellness / Medical",
    services: "Услуги и удобства",
    experiences: "Преживявания и активности",
    events: "Събития и оферти",
    offers: "Събития и оферти",
    contacts: "Контакти",
    policies: "Политики",
  },
  en: {
    overview: "Hotel essentials",
    accommodation: "Accommodation",
    dining: "Restaurants & bars",
    wellness: "SPA / Wellness / Medical",
    services: "Services & amenities",
    experiences: "Experiences & activities",
    events: "Events & offers",
    offers: "Events & offers",
    contacts: "Contacts",
    policies: "Policies",
  },
} as const;

const ATTR = {
  bg: {
    name: "Име", description: "Описание", check_in: "Настаняване", check_out: "Освобождаване", language: "Езици",
    room_type: "Тип", capacity: "Капацитет", size: "Площ", bed: "Легло", view: "Гледка", meal_inclusion: "Хранене",
    price: "Цена", price_context: "Цени", hours: "Работно време", booking: "Резервация", external_access: "Достъп",
    access: "Достъп", dress_code: "Облекло", age_policy: "Възраст", session_duration: "Продължителност",
    recommended_stay: "Препоръчителен престой", amenity: "Удобство", facility: "Обект", service: "Услуга",
    treatment: "Процедура", venue: "Обект", experience: "Преживяване", activity: "Активност", attraction: "Какво да видите",
    event_space: "Зала / място", event_capacity: "Капацитет", event_service: "Възможности", offer: "Оферта",
    pet_policy: "Домашни любимци", pet_fee: "Домашни любимци", smoking_policy: "Пушене", smoking_restriction: "Пушене",
    designated_smoking_area: "Пушене", quiet_hours: "Тихи часове", cancellation_policy: "Анулации", payment_policy: "Плащане",
    parking: "Паркинг", wifi: "Wi‑Fi",
  },
  en: {
    name: "Name", description: "Description", check_in: "Check-in", check_out: "Check-out", language: "Languages",
    room_type: "Type", capacity: "Capacity", size: "Size", bed: "Bed", view: "View", meal_inclusion: "Meal plan",
    price: "Price", price_context: "Pricing", hours: "Hours", booking: "Booking", external_access: "Access", access: "Access",
    dress_code: "Dress code", age_policy: "Age", session_duration: "Duration", recommended_stay: "Recommended stay",
    amenity: "Amenity", facility: "Facility", service: "Service", treatment: "Treatment", venue: "Venue",
    experience: "Experience", activity: "Activity", attraction: "What to see", event_space: "Venue", event_capacity: "Capacity",
    event_service: "Capabilities", offer: "Offer", pet_policy: "Pets", pet_fee: "Pets", smoking_policy: "Smoking",
    smoking_restriction: "Smoking", designated_smoking_area: "Smoking", quiet_hours: "Quiet hours", cancellation_policy: "Cancellation",
    payment_policy: "Payment", parking: "Parking", wifi: "Wi‑Fi",
  },
} as const;

const POLICY_TOPICS: Record<string, { bg: string; en: string }> = {
  pet_policy: { bg: "Домашни любимци", en: "Pets" }, pet_fee: { bg: "Домашни любимци", en: "Pets" },
  smoking_policy: { bg: "Пушене", en: "Smoking" }, smoking_restriction: { bg: "Пушене", en: "Smoking" },
  smoking_penalty: { bg: "Пушене", en: "Smoking" }, designated_smoking_area: { bg: "Пушене", en: "Smoking" },
  quiet_hours: { bg: "Тихи часове", en: "Quiet hours" }, noise_policy: { bg: "Тихи часове / шум", en: "Quiet hours / noise" },
  noise_penalty: { bg: "Тихи часове / шум", en: "Quiet hours / noise" }, cancellation_policy: { bg: "Анулации", en: "Cancellation" },
  payment_policy: { bg: "Плащане", en: "Payment" }, age_policy: { bg: "Деца / възраст", en: "Children / age" },
  dress_code: { bg: "Облекло", en: "Dress code" }, food_beverage_policy: { bg: "Храна и напитки", en: "Food & beverage" },
  room_cooking_policy: { bg: "Приготвяне на храна", en: "In-room cooking" }, fire_safety_policy: { bg: "Пожарна безопасност", en: "Fire safety" },
  weapons_policy: { bg: "Сигурност", en: "Security" }, luggage_storage_policy: { bg: "Багаж", en: "Luggage" },
  luggage_access_policy: { bg: "Багаж", en: "Luggage" }, parking: { bg: "Паркинг", en: "Parking" },
};

const BRAND = { ink: "#0D1B2A", accent: "#9B86BD", soft: "#F6F2FA", border: "#DED5E9", muted: "#667085", white: "#FFFFFF" };

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function normalized(value: unknown) { return clean(value).toLocaleLowerCase("en-US"); }
function attrLabel(fact: HubFact, lang: ControlPlaneLang) {
  const key = clean(fact.attribute) as keyof typeof ATTR.bg;
  return ATTR[lang][key] || fact.label || key;
}
function host(raw: string) { try { const u = new URL(raw); return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`; } catch { return raw; } }
function unique(values: string[]) { return [...new Set(values.map(clean).filter(Boolean))]; }
function uniquePhones(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const digits = value.replace(/\D/g, "");
    const key = digits.length >= 9 ? digits.slice(-9) : normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function itemName(item: HubItem, sectionKey: string) {
  if (clean(item.name)) return clean(item.name);
  const preferred = sectionKey === "accommodation" ? ["room_type"]
    : sectionKey === "dining" ? ["venue"]
      : sectionKey === "wellness" ? ["treatment", "service", "facility"]
        : ["service", "amenity", "experience", "activity", "attraction", "facility"];
  for (const attribute of preferred) {
    const match = item.facts.find((fact) => clean(fact.attribute) === attribute);
    if (match?.value) return clean(match.value);
  }
  return clean(item.facts[0]?.label) || clean(item.facts[0]?.value);
}

function sectionUrls(section?: HubSection) { return unique(section?.sourceUrls || []); }

function SourceFooter({ urls, lang }: { urls: string[]; lang: ControlPlaneLang }) {
  const sources = unique(urls);
  if (!sources.length) return null;
  return (
    <details className="mt-3 border-t pt-2 text-[11px]" style={{ borderColor: BRAND.border, color: BRAND.muted }}>
      <summary className="cursor-pointer font-semibold" style={{ color: BRAND.accent }}>
        {lang === "bg" ? `Източници · ${sources.length}` : `Sources · ${sources.length}`}
      </summary>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {sources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-all underline" style={{ color: BRAND.ink }}>{host(url)}</a>)}
      </div>
    </details>
  );
}

function SectionShell({ title, children, urls, lang }: { title: string; children: React.ReactNode; urls?: string[]; lang: ControlPlaneLang }) {
  return (
    <section className="scanner-hub-section rounded-2xl border p-4" style={{ borderColor: BRAND.border, background: BRAND.soft }}>
      <h3 className="text-sm font-black uppercase tracking-[0.12em]" style={{ color: BRAND.ink }}>{title}</h3>
      <div className="mt-3">{children}</div>
      <SourceFooter urls={urls || []} lang={lang} />
    </section>
  );
}

function Overview({ section, lang }: { section: HubSection; lang: ControlPlaneLang }) {
  const facts = section.facts
    .filter((fact, index, all) => all.findIndex((other) => clean(other.attribute) === clean(fact.attribute) && normalized(other.value) === normalized(fact.value)) === index)
    .filter((fact) => !["phone", "email", "social_profile", "address"].includes(clean(fact.attribute)))
    .slice(0, 7);
  return (
    <SectionShell title={TITLES[lang].overview} urls={sectionUrls(section)} lang={lang}>
      <div className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: BRAND.border }}>
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {facts.map((fact, index) => (
            <div key={`${fact.attribute}:${index}`} className="grid grid-cols-[120px_1fr] gap-3 text-sm">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: BRAND.muted }}>{attrLabel(fact, lang)}</span>
              <span className="leading-5" style={{ color: BRAND.ink }}>{fact.value}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function NameList({ section, lang }: { section: HubSection; lang: ControlPlaneLang }) {
  const names = unique(section.items.map((item) => itemName(item, section.key)).filter(Boolean));
  return (
    <SectionShell title={TITLES[lang][section.key]} urls={sectionUrls(section)} lang={lang}>
      <div className="flex flex-wrap gap-2">
        {names.map((name) => <span key={name} className="rounded-full border bg-white px-3 py-2 text-sm font-semibold" style={{ borderColor: BRAND.border, color: BRAND.ink }}>{name}</span>)}
      </div>
    </SectionShell>
  );
}

function CompactEntities({ section, lang }: { section: HubSection; lang: ControlPlaneLang }) {
  return (
    <SectionShell title={TITLES[lang][section.key]} urls={sectionUrls(section)} lang={lang}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {section.items.map((item) => {
          const name = itemName(item, section.key);
          const description = item.facts.find((fact) => clean(fact.attribute) === "description")?.value
            || item.facts.find((fact) => ["service", "experience", "activity", "attraction", "amenity"].includes(clean(fact.attribute)))?.value;
          return (
            <article key={item.key} className="rounded-xl border bg-white px-3 py-3" style={{ borderColor: BRAND.border }}>
              <p className="text-sm font-bold" style={{ color: BRAND.ink }}>{name}</p>
              {description && normalized(description) !== normalized(name) ? <p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: BRAND.muted }}>{description}</p> : null}
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}

function formatDateRange(startsOn: string, endsOn: string, lang: ControlPlaneLang) {
  if (!startsOn && !endsOn) return "";
  const format = (raw: string) => {
    if (!raw) return "";
    const [year, month, day] = raw.split("-");
    return lang === "bg" ? `${day}.${month}.${year}` : `${year}-${month}-${day}`;
  };
  if (startsOn && endsOn && startsOn !== endsOn) return `${format(startsOn)} – ${format(endsOn)}`;
  return format(startsOn || endsOn);
}

function LiveEventsOffers({ facts, scannedAt, lang }: { facts: HubFact[]; scannedAt: string; lang: ControlPlaneLang }) {
  const bridge = buildHotelScannerBridgeSnapshot(facts, scannedAt);
  const active = bridge.activeItems;
  if (!active.length) return null;
  return (
    <SectionShell title={TITLES[lang].events} urls={unique(active.flatMap((item) => item.sourceUrls))} lang={lang}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((item) => {
          const date = formatDateRange(item.startsOn, item.endsOn, lang);
          return (
            <article key={item.key} className="rounded-xl border bg-white px-3 py-3" style={{ borderColor: BRAND.border }}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold" style={{ color: BRAND.ink }}>{item.title}</p>
                <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase" style={{ background: "#F1EBF7", color: "#6F5A91" }}>
                  {item.kind === "events" ? (lang === "bg" ? "събитие" : "event") : (lang === "bg" ? "оферта" : "offer")}
                </span>
              </div>
              {date ? <p className="mt-2 text-xs font-semibold" style={{ color: BRAND.accent }}>{date}</p> : null}
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-5" style={{ color: BRAND.muted }}>
        {lang === "bg"
          ? "AI Scanner Bridge: активните и бъдещите записи са готови за дневно сравнение; изтеклите се скриват по дата, а липсващите се премахват само след успешно повторно сканиране на секцията."
          : "AI Scanner Bridge: active and scheduled records are ready for daily comparison; expired items hide by date and missing items are removed only after a successful section rescan."}
      </p>
    </SectionShell>
  );
}

function Policies({ section, lang }: { section: HubSection; lang: ControlPlaneLang }) {
  const topics = unique(section.facts.map((fact) => {
    const attribute = clean(fact.attribute);
    return POLICY_TOPICS[attribute]?.[lang] || attrLabel(fact, lang);
  }).filter(Boolean));
  if (!topics.length) return null;
  return (
    <SectionShell title={TITLES[lang].policies} urls={sectionUrls(section)} lang={lang}>
      <div className="flex flex-wrap gap-2">
        {topics.map((topic) => <span key={topic} className="rounded-full border bg-white px-3 py-2 text-sm font-semibold" style={{ borderColor: BRAND.border, color: BRAND.ink }}>{topic}</span>)}
      </div>
      <p className="mt-3 text-xs" style={{ color: BRAND.muted }}>
        {lang === "bg" ? "Показваме само какви политики има хотелът. Пълните правила се добавят по-късно като PDF или вътрешна страница в Hub-а." : "Only the available policy topics are shown. Full rules can later be attached as PDF or an internal Hub page."}
      </p>
    </SectionShell>
  );
}

export default function HotelScannerHubResults({ facts, contacts, address, scannedAt, lang }: Props) {
  const sections = buildHotelScannerHubSections(facts) as HubSection[];
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const phones = uniquePhones(contacts.phones);
  const emails = unique(contacts.emails);
  const socialLinks = unique(contacts.socialLinks);
  const hasContacts = Boolean(address || phones.length || emails.length || socialLinks.length);
  const general = byKey.get("overview");
  const accommodation = byKey.get("accommodation");
  const dining = byKey.get("dining");
  const wellness = byKey.get("wellness");
  const services = byKey.get("services");
  const experiences = byKey.get("experiences");
  const policies = byKey.get("policies");

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: BRAND.border, background: "#FFFFFF" }}>
        <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: BRAND.accent }}>{lang === "bg" ? "Hub-ready съдържание" : "Hub-ready content"}</p>
        <p className="mt-1 text-xs leading-5" style={{ color: BRAND.muted }}>{lang === "bg" ? "Компактен набор от най-важното за госта. Подробните менюта, правила и документи се добавят в Design Studio / Hub при onboarding." : "A compact set of guest-relevant content. Detailed menus, rules and documents are added in Design Studio / Hub during onboarding."}</p>
      </div>

      {general ? <Overview section={general} lang={lang} /> : null}
      {accommodation ? <NameList section={accommodation} lang={lang} /> : null}
      {dining ? <NameList section={dining} lang={lang} /> : null}
      {wellness ? <NameList section={wellness} lang={lang} /> : null}
      {services ? <CompactEntities section={services} lang={lang} /> : null}
      {experiences ? <CompactEntities section={experiences} lang={lang} /> : null}
      <LiveEventsOffers facts={facts} scannedAt={scannedAt} lang={lang} />

      {hasContacts ? (
        <SectionShell title={TITLES[lang].contacts} lang={lang}>
          <div className="rounded-xl border bg-white px-4 py-3" style={{ borderColor: BRAND.border, color: BRAND.ink }}>
            <div className="grid gap-2 md:grid-cols-2">
              {address && <p className="text-sm"><strong>{lang === "bg" ? "Адрес:" : "Address:"}</strong> {address}</p>}
              {phones.length > 0 && <p className="text-sm"><strong>{lang === "bg" ? "Телефон:" : "Phone:"}</strong> {phones.join(" · ")}</p>}
              {emails.length > 0 && <p className="text-sm"><strong>{lang === "bg" ? "Имейл:" : "Email:"}</strong> {emails.join(" · ")}</p>}
            </div>
            {socialLinks.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{socialLinks.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-2 text-xs font-bold" style={{ borderColor: BRAND.border, background: BRAND.soft, color: BRAND.ink }}>{host(link)}</a>)}</div> : null}
          </div>
        </SectionShell>
      ) : null}

      {policies ? <Policies section={policies} lang={lang} /> : null}
    </div>
  );
}
