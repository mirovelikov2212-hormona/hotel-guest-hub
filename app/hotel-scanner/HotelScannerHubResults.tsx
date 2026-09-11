"use client";

import { buildHotelScannerHubSections } from "@/lib/ai/hotel-scanner-hub-sections.mjs";
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
  lang: ControlPlaneLang;
};

const TITLES = {
  bg: { overview: "Най-важното за хотела", accommodation: "Настаняване", dining: "Ресторанти и барове", wellness: "SPA / Wellness / Medical", services: "Услуги и удобства", experiences: "Преживявания и активности", events: "Събития", offers: "Оферти и резервируеми услуги", contacts: "Контакти", policies: "Политики · кратко" },
  en: { overview: "Hotel essentials", accommodation: "Accommodation", dining: "Restaurants & bars", wellness: "SPA / Wellness / Medical", services: "Services & amenities", experiences: "Experiences & activities", events: "Events", offers: "Offers & bookable services", contacts: "Contacts", policies: "Policies · summary" },
} as const;

const ATTR = {
  bg: { name: "Име", description: "Описание", check_in: "Настаняване", check_out: "Освобождаване", language: "Езици", room_type: "Тип", capacity: "Капацитет", size: "Площ", bed: "Легло", view: "Гледка", meal_inclusion: "Хранене", price: "Цена", price_context: "Цени", hours: "Работно време", booking: "Резервация", external_access: "Достъп", access: "Достъп", dress_code: "Облекло", age_policy: "Възраст", session_duration: "Продължителност", recommended_stay: "Препоръчителен престой", amenity: "Удобство", facility: "Обект", service: "Услуга", treatment: "Процедура", venue: "Обект", experience: "Преживяване", activity: "Активност", attraction: "Какво да видите", event_space: "Зала / място", event_capacity: "Капацитет", event_service: "Възможности", offer: "Оферта", pet_policy: "Домашни любимци", pet_fee: "Такса за домашен любимец", smoking_policy: "Пушене", smoking_restriction: "Пушене", designated_smoking_area: "Зони за пушене", quiet_hours: "Тихи часове", cancellation_policy: "Анулация", payment_policy: "Плащане", parking: "Паркинг", wifi: "Wi‑Fi" },
  en: { name: "Name", description: "Description", check_in: "Check-in", check_out: "Check-out", language: "Languages", room_type: "Type", capacity: "Capacity", size: "Size", bed: "Bed", view: "View", meal_inclusion: "Meal plan", price: "Price", price_context: "Pricing", hours: "Hours", booking: "Booking", external_access: "Access", access: "Access", dress_code: "Dress code", age_policy: "Age", session_duration: "Duration", recommended_stay: "Recommended stay", amenity: "Amenity", facility: "Facility", service: "Service", treatment: "Treatment", venue: "Venue", experience: "Experience", activity: "Activity", attraction: "What to see", event_space: "Venue", event_capacity: "Capacity", event_service: "Capabilities", offer: "Offer", pet_policy: "Pets", pet_fee: "Pet fee", smoking_policy: "Smoking", smoking_restriction: "Smoking", designated_smoking_area: "Smoking areas", quiet_hours: "Quiet hours", cancellation_policy: "Cancellation", payment_policy: "Payment", parking: "Parking", wifi: "Wi‑Fi" },
} as const;

const POLICY_PRIORITY = [
  "quiet_hours", "smoking_policy", "smoking_restriction", "designated_smoking_area", "dress_code", "age_policy",
  "pet_policy", "cancellation_policy", "payment_policy", "parking",
];

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
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
    const key = digits.length >= 9 ? digits.slice(-9) : clean(value).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function SourceFooter({ urls, verification, lang }: { urls: string[]; verification?: VerificationStatus; lang: ControlPlaneLang }) {
  const sources = unique(urls);
  if (!sources.length) return null;
  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "#e2ecee" }}>
      <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "#5b7278" }}>
        {verification === "CONFLICT" && <span className="rounded-full border px-2 py-1 font-bold" style={{ borderColor: "#efb5b2", color: "#a61b16", background: "#fff7f6" }}>{lang === "bg" ? "ИЗИСКВА ПРЕГЛЕД" : "REVIEW REQUIRED"}</span>}
        {verification === "VERIFIED" && <span className="rounded-full border px-2 py-1 font-bold" style={{ borderColor: "#a9dfc7", color: "#087443", background: "#f3fcf7" }}>{lang === "bg" ? "ПРОВЕРЕНО" : "VERIFIED"}</span>}
        <details>
          <summary className="cursor-pointer font-semibold" style={{ color: "#0b6b78" }}>{lang === "bg" ? `Източници · ${sources.length}` : `Sources · ${sources.length}`}</summary>
          <div className="mt-2 space-y-1">
            {sources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-all underline" style={{ color: "#0b6b78" }}>{host(url)}</a>)}
          </div>
        </details>
      </div>
    </div>
  );
}

function Item({ item, lang }: { item: HubItem; lang: ControlPlaneLang }) {
  const facts = item.facts.filter((fact, index, all) => all.findIndex((other) => clean(other.attribute) === clean(fact.attribute) && clean(other.value).toLowerCase() === clean(fact.value).toLowerCase()) === index);
  return (
    <article className="rounded-2xl border p-4" style={{ borderColor: "#c9dde2", background: "#ffffff" }}>
      {item.name && <h4 className="text-base font-bold" style={{ color: "#17343a" }}>{item.name}</h4>}
      <div className={item.name ? "mt-3 space-y-2.5" : "space-y-2.5"}>
        {facts.map((fact, index) => (
          <div key={`${fact.attribute}:${fact.value}:${index}`} className="grid gap-1 sm:grid-cols-[145px_1fr] sm:gap-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#526c72" }}>{attrLabel(fact, lang)}</span>
            <span className="break-words text-sm leading-6" style={{ color: "#17343a" }}>{fact.value}</span>
          </div>
        ))}
      </div>
      <SourceFooter urls={item.sourceUrls} verification={item.verification} lang={lang} />
    </article>
  );
}

function Policies({ section, lang }: { section: HubSection; lang: ControlPlaneLang }) {
  const uniqueFacts = section.facts.filter((fact, index, all) => all.findIndex((other) => clean(other.attribute) === clean(fact.attribute) && clean(other.value).toLowerCase() === clean(fact.value).toLowerCase()) === index);
  const selected = [...uniqueFacts]
    .sort((a, b) => {
      const ai = POLICY_PRIORITY.indexOf(clean(a.attribute));
      const bi = POLICY_PRIORITY.indexOf(clean(b.attribute));
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    })
    .slice(0, 6);
  const hasConflict = selected.some((fact) => fact.verification?.status === "CONFLICT");
  return (
    <section className="rounded-3xl border p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: "#17343a" }}>{TITLES[lang].policies}</h3>
        <span className="text-xs" style={{ color: "#687f84" }}>{lang === "bg" ? "Пълните правила могат да се добавят като PDF / вътрешна страница в Hub-а." : "Full rules can later be attached as PDF / an internal Hub page."}</span>
      </div>
      <div className="mt-4 grid gap-x-8 gap-y-3 lg:grid-cols-2">
        {selected.map((fact, index) => <div key={`${fact.attribute}:${index}`} className="grid gap-1 sm:grid-cols-[150px_1fr]"><span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#526c72" }}>{attrLabel(fact, lang)}</span><span className="text-sm leading-6" style={{ color: "#17343a" }}>{fact.value}</span></div>)}
      </div>
      <SourceFooter urls={section.sourceUrls} verification={hasConflict ? "CONFLICT" : undefined} lang={lang} />
    </section>
  );
}

export default function HotelScannerHubResults({ facts, contacts, address, lang }: Props) {
  const sections = buildHotelScannerHubSections(facts) as HubSection[];
  const renderedKeys = new Set(sections.map((section) => section.key));
  const policySection = sections.find((section) => section.key === "policies");
  const contentSections = sections.filter((section) => !["contacts", "policies"].includes(section.key));
  const phones = uniquePhones(contacts.phones);
  const emails = unique(contacts.emails);
  const socialLinks = unique(contacts.socialLinks);
  const hasContacts = Boolean(address || phones.length || emails.length || socialLinks.length);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}>
        <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#0b6b78" }}>{lang === "bg" ? "Hub-ready съдържание" : "Hub-ready content"}</p>
        <p className="mt-2 text-sm leading-6" style={{ color: "#526c72" }}>{lang === "bg" ? "Тук е само съдържанието, което има смисъл да влезе в мобилния Hub. Подробните доказателства и policy review остават отделен слой." : "Only content useful for the mobile Hub is shown here. Detailed evidence and policy review remain a separate layer."}</p>
      </div>

      {contentSections.map((section) => (
        <section key={section.key} className="rounded-3xl border p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}>
          <h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: "#17343a" }}>{TITLES[lang][section.key]}</h3>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {section.items.map((item) => <Item key={item.key} item={item} lang={lang} />)}
          </div>
        </section>
      ))}

      {!renderedKeys.has("experiences") && <section className="rounded-3xl border border-dashed p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}><h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: "#17343a" }}>{TITLES[lang].experiences}</h3><p className="mt-2 text-sm" style={{ color: "#526c72" }}>{lang === "bg" ? "Не е намерено Hub-ready съдържание за преживявания. Това е coverage gap, а не празна секция за публикуване." : "No Hub-ready experience content was found. This is a coverage gap, not a section to publish."}</p></section>}

      {hasContacts && (
        <section className="rounded-3xl border p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}>
          <h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: "#17343a" }}>{TITLES[lang].contacts}</h3>
          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "#c9dde2", background: "#ffffff", color: "#17343a" }}>
            <div className="grid gap-2 md:grid-cols-2">
              {address && <p className="text-sm"><strong>{lang === "bg" ? "Адрес:" : "Address:"}</strong> {address}</p>}
              {phones.length > 0 && <p className="text-sm"><strong>{lang === "bg" ? "Телефон:" : "Phone:"}</strong> {phones.join(" · ")}</p>}
              {emails.length > 0 && <p className="text-sm"><strong>{lang === "bg" ? "Имейл:" : "Email:"}</strong> {emails.join(" · ")}</p>}
            </div>
            {socialLinks.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{socialLinks.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-2 text-xs font-bold" style={{ borderColor: "#8fcbd3", background: "#e8f7f9", color: "#075d68" }}>{host(link)}</a>)}</div>}
          </div>
        </section>
      )}

      {policySection && <Policies section={policySection} lang={lang} />}
    </div>
  );
}
