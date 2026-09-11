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

type Props = {
  facts: HubFact[];
  contacts: { phones: string[]; emails: string[]; socialLinks: string[] };
  address: string;
  lang: ControlPlaneLang;
};

const TITLES = {
  bg: { overview: "Обща информация", accommodation: "Настаняване", dining: "Ресторанти и барове", wellness: "SPA / Wellness / Medical", services: "Услуги и удобства", experiences: "Преживявания и активности", events: "Събития", offers: "Оферти и резервации", contacts: "Контакти", policies: "Политики" },
  en: { overview: "General information", accommodation: "Accommodation", dining: "Restaurants & bars", wellness: "SPA / Wellness / Medical", services: "Services & amenities", experiences: "Experiences & activities", events: "Events", offers: "Offers & booking", contacts: "Contacts", policies: "Policies" },
} as const;

const ATTR = {
  bg: { room_type: "Тип", capacity: "Капацитет", size: "Площ", bed: "Легло", view: "Гледка", meal_inclusion: "Хранене", price: "Цена", hours: "Работно време", booking: "Резервация", external_access: "Достъп", dress_code: "Облекло", age_policy: "Възраст", session_duration: "Продължителност", recommended_stay: "Препоръчителен престой", phone: "Телефон", email: "Имейл", social_profile: "Социален профил", address: "Адрес" },
  en: { room_type: "Type", capacity: "Capacity", size: "Size", bed: "Bed", view: "View", meal_inclusion: "Meal plan", price: "Price", hours: "Hours", booking: "Booking", external_access: "Access", dress_code: "Dress code", age_policy: "Age", session_duration: "Duration", recommended_stay: "Recommended stay", phone: "Phone", email: "Email", social_profile: "Social profile", address: "Address" },
} as const;

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function attrLabel(fact: HubFact, lang: ControlPlaneLang) {
  const key = clean(fact.attribute) as keyof typeof ATTR.bg;
  return ATTR[lang][key] || fact.label || key;
}
function urls(fact: HubFact) { return fact.verification?.sourceUrls?.length ? fact.verification.sourceUrls : fact.sourceUrls; }
function host(raw: string) { try { const u = new URL(raw); return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`; } catch { return raw; } }

function EvidenceMeta({ fact, lang }: { fact: HubFact; lang: ControlPlaneLang }) {
  const status = fact.verification?.status || "UNSCORED";
  const pages = urls(fact).length;
  const independent = fact.verification?.independentSourceCount;
  const statusText = lang === "bg"
    ? status === "VERIFIED" ? "ПРОВЕРЕН" : status === "CONFLICT" ? "КОНФЛИКТ" : status === "SINGLE_SOURCE" ? "1 НЕЗАВИСИМ ИЗТОЧНИК" : "НЕОЦЕНЕН"
    : status === "VERIFIED" ? "VERIFIED" : status === "CONFLICT" ? "CONFLICT" : status === "SINGLE_SOURCE" ? "1 INDEPENDENT SOURCE" : "UNSCORED";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: "#5b7278" }}>
      <span className="font-bold" style={{ color: status === "CONFLICT" ? "#b42318" : status === "VERIFIED" ? "#087443" : "#7a5b00" }}>{statusText}</span>
      <span>{Math.round(fact.confidence * 100)}% AI confidence</span>
      {typeof independent === "number" && <span>{independent} {lang === "bg" ? "независими източника" : "independent sources"}</span>}
      <span>{pages} {lang === "bg" ? "публични страници" : "public pages"}</span>
    </div>
  );
}

function Item({ item, lang }: { item: { key: string; name: string; facts: HubFact[] }; lang: ControlPlaneLang }) {
  const seen = new Set<string>();
  const facts = item.facts.filter((fact) => {
    const key = `${clean(fact.attribute).toLowerCase()}|${clean(fact.value).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return (
    <article className="rounded-2xl border p-4" style={{ borderColor: "#c9dde2", background: "#ffffff" }}>
      {item.name && <h4 className="text-base font-bold" style={{ color: "#17343a" }}>{item.name}</h4>}
      <div className={item.name ? "mt-3 space-y-3" : "space-y-3"}>
        {facts.map((fact, index) => (
          <div key={`${fact.attribute}:${fact.value}:${index}`}>
            <div className="grid gap-1 sm:grid-cols-[150px_1fr] sm:gap-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#526c72" }}>{attrLabel(fact, lang)}</span>
              <span className="break-words text-sm leading-6" style={{ color: "#17343a" }}>{fact.value}</span>
            </div>
            <EvidenceMeta fact={fact} lang={lang} />
            {urls(fact).length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] font-semibold" style={{ color: "#0b6b78" }}>{lang === "bg" ? "Доказателства" : "Evidence"}</summary>
                <div className="mt-1 space-y-1">
                  {urls(fact).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-all text-[10px] underline" style={{ color: "#0b6b78" }}>{host(url)}</a>)}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

export default function HotelScannerHubResults({ facts, contacts, address, lang }: Props) {
  const sections = buildHotelScannerHubSections(facts) as Array<{ key: keyof typeof TITLES.bg; facts: HubFact[]; items: Array<{ key: string; name: string; facts: HubFact[] }> }>;
  const contactSection = sections.find((section) => section.key === "contacts");
  const hasContactProfile = Boolean(address || contacts.phones.length || contacts.emails.length || contacts.socialLinks.length);
  const renderedKeys = new Set(sections.map((section) => section.key));

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}>
        <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: "#0b6b78" }}>{lang === "bg" ? "Hub-ready съдържание" : "Hub-ready content"}</p>
        <p className="mt-2 text-sm leading-6" style={{ color: "#526c72" }}>{lang === "bg" ? "Информацията е групирана така, както ще се използва в мобилния хотелски Hub и Design Studio." : "Content is grouped as it will be used in the mobile hotel Hub and Design Studio."}</p>
      </div>

      {sections.filter((section) => section.key !== "contacts").map((section) => (
        <section key={section.key} className="rounded-3xl border p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}>
          <h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: "#17343a" }}>{TITLES[lang][section.key]}</h3>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {section.items.map((item) => <Item key={item.key} item={item} lang={lang} />)}
          </div>
        </section>
      ))}

      {(hasContactProfile || contactSection) && (
        <section className="rounded-3xl border p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}>
          <h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: "#17343a" }}>{TITLES[lang].contacts}</h3>
          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "#c9dde2", background: "#ffffff", color: "#17343a" }}>
            {address && <p className="text-sm"><strong>{lang === "bg" ? "Адрес:" : "Address:"}</strong> {address}</p>}
            {contacts.phones.length > 0 && <p className="mt-2 text-sm"><strong>{lang === "bg" ? "Телефон:" : "Phone:"}</strong> {contacts.phones.join(" · ")}</p>}
            {contacts.emails.length > 0 && <p className="mt-2 text-sm"><strong>{lang === "bg" ? "Имейл:" : "Email:"}</strong> {contacts.emails.join(" · ")}</p>}
            {contacts.socialLinks.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{contacts.socialLinks.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-2 text-xs font-bold" style={{ borderColor: "#8fcbd3", background: "#e8f7f9", color: "#075d68" }}>{host(link)}</a>)}</div>}
            {contactSection?.items.map((item) => <div key={item.key} className="mt-4"><Item item={item} lang={lang} /></div>)}
          </div>
        </section>
      )}

      {!renderedKeys.has("experiences") && <section className="rounded-3xl border border-dashed p-5" style={{ borderColor: "#c9dde2", background: "#f8fbfc" }}><h3 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: "#17343a" }}>{TITLES[lang].experiences}</h3><p className="mt-2 text-sm" style={{ color: "#526c72" }}>{lang === "bg" ? "Не са намерени доказуеми преживявания в сканираните публични страници — това остава видим gap за review." : "No evidence-backed experiences were found in the scanned public pages — this remains a visible review gap."}</p></section>}
    </div>
  );
}
