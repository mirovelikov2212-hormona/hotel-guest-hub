const SECTION_ORDER = Object.freeze([
  "overview",
  "accommodation",
  "dining",
  "wellness",
  "services",
  "experiences",
  "events",
  "offers",
  "contacts",
  "policies",
]);

const POLICY_ATTRIBUTES = new Set(["pet_policy", "smoking_policy", "quiet_hours", "cancellation_policy", "payment_policy", "dress_code", "age_policy"]);
const CONTACT_ATTRIBUTES = new Set(["phone", "email", "social_profile", "address"]);
const ROOM_ATTRIBUTES = new Set(["room_type", "capacity", "size", "bed", "view", "meal_inclusion"]);
const DINING_ATTRIBUTES = new Set(["venue", "external_access"]);
const WELLNESS_ATTRIBUTES = new Set(["treatment", "session_duration", "recommended_stay"]);
const EXPERIENCE_ATTRIBUTES = new Set(["experience", "activity", "attraction", "experience_access", "experience_booking"]);
const EVENT_ATTRIBUTES = new Set(["event_space", "event_capacity", "event_service"]);

function clean(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return clean(value).toLocaleLowerCase("en-US");
}

function factUrls(fact) {
  const urls = fact?.verification?.sourceUrls?.length ? fact.verification.sourceUrls : fact?.sourceUrls;
  return Array.isArray(urls) ? urls.map(clean).filter(Boolean) : [];
}

function sourceSignals(fact) {
  return factUrls(fact).join(" ").toLocaleLowerCase("en-US");
}

export function hotelScannerHubSectionForFact(fact = {}) {
  const category = normalized(fact.category);
  const attribute = normalized(fact.attribute);
  const subject = normalized(fact.subject);
  const label = normalized(fact.label);
  const sources = sourceSignals(fact);
  const all = `${category} ${attribute} ${subject} ${label} ${sources}`;

  if (POLICY_ATTRIBUTES.has(attribute) || category === "policy" || category === "faq" || /(?:faq|policy|policies|rules|terms|conditions|политик|правил|услов)/iu.test(sources)) return "policies";
  if (CONTACT_ATTRIBUTES.has(attribute) || category === "contact" || category === "location") return "contacts";
  if (ROOM_ATTRIBUTES.has(attribute) || category === "accommodation" || category === "room") return "accommodation";
  if (EXPERIENCE_ATTRIBUTES.has(attribute) || category === "experiences" || /(?:experiences?|activities|things[-_ ]?to[-_ ]?do|attractions?|nearby|преживяв|активност|забележител)/iu.test(sources)) return "experiences";
  if (EVENT_ATTRIBUTES.has(attribute) || category === "events" || /(?:events?|meetings?|conference|weddings?|събит|конференц|сватб)/iu.test(sources)) return "events";
  if (category === "dining" || DINING_ATTRIBUTES.has(attribute) || /(?:gastronomy|restaurants?|dining|bars?)/iu.test(all)) return "dining";
  if (category === "wellness" || WELLNESS_ATTRIBUTES.has(attribute) || /(?:\bspa\b|wellness|medical|therapy|treatment|massage|спа|уелнес|медиц|терап|масаж)/iu.test(all)) return "wellness";
  if (category === "services" || category === "amenities" || ["service", "facility", "amenity"].includes(attribute) || /(?:\/services?(?:\/|$)|facilit|amenit|услуг|удобств)/iu.test(sources)) return "services";
  if (category === "offers" || attribute === "offer" || /(?:offers?|packages?|promotion|оферт|пакет|промо)/iu.test(all)) return "offers";
  return "overview";
}

function entityKey(fact, section, index) {
  const subject = clean(fact.subject);
  if (subject && normalized(subject) !== "hotel" && normalized(subject) !== "property" && normalized(subject) !== "resort") return subject;
  if (section === "accommodation" && normalized(fact.attribute) === "room_type") return clean(fact.value) || clean(fact.label) || `item-${index}`;
  if (["dining", "wellness", "services", "experiences", "events", "offers"].includes(section)) return clean(fact.label) || clean(fact.value) || `item-${index}`;
  return "hotel";
}

export function buildHotelScannerHubSections(facts = []) {
  const sections = Object.fromEntries(SECTION_ORDER.map((key) => [key, { key, facts: [], items: [] }]));
  const itemMaps = Object.fromEntries(SECTION_ORDER.map((key) => [key, new Map()]));

  for (const [index, fact] of (Array.isArray(facts) ? facts : []).entries()) {
    if (!fact || !clean(fact.value)) continue;
    const sectionKey = hotelScannerHubSectionForFact(fact);
    const section = sections[sectionKey] || sections.overview;
    section.facts.push(fact);
    const key = entityKey(fact, section.key, index);
    let item = itemMaps[section.key].get(key);
    if (!item) {
      item = { key, name: key === "hotel" ? "" : key, facts: [] };
      itemMaps[section.key].set(key, item);
      section.items.push(item);
    }
    item.facts.push(fact);
  }

  return SECTION_ORDER.map((key) => sections[key]).filter((section) => section.facts.length > 0);
}

export { SECTION_ORDER as HOTEL_SCANNER_HUB_SECTION_ORDER };
