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

const POLICY_ATTRIBUTES = new Set([
  "pet_policy", "pet_fee", "smoking_policy", "smoking_restriction", "smoking_penalty", "designated_smoking_area",
  "quiet_hours", "noise_policy", "noise_penalty", "cancellation_policy", "payment_policy",
  "food_beverage_policy", "room_cooking_policy", "room_cooking_penalty", "fire_safety_policy", "weapons_policy",
  "luggage_storage_policy", "luggage_access_policy",
]);
const CONTACT_ATTRIBUTES = new Set(["phone", "email", "social_profile", "address"]);
const ROOM_ATTRIBUTES = new Set(["room_type", "capacity", "size", "bed", "view", "meal_inclusion"]);
const DINING_ATTRIBUTES = new Set(["venue", "external_access", "dress_code"]);
const WELLNESS_ATTRIBUTES = new Set(["treatment", "session_duration", "recommended_stay"]);
const EXPERIENCE_ATTRIBUTES = new Set(["experience", "activity", "attraction", "experience_access", "experience_booking"]);
const STATIC_EVENT_FACILITY_ATTRIBUTES = new Set(["event_space", "event_capacity", "event_service"]);
const SERVICE_ATTRIBUTES = new Set(["service", "facility", "amenity"]);

const SERVICE_ENTITY_PATTERN = /(?:kids?\s*(?:corner|club)|children'?s?\s*(?:corner|club)|детски\s*(?:кът|клуб)|hairdress|barber|beauty\s*salon|pharmacy|drugstore|laundry|магазин|фризьор|бербер|салон|дрогерия|аптек|пералн|паркинг|parking|transfer|shuttle|conference|meeting\s*room|wedding\s*hall|конференц|зала)/iu;
const WELLNESS_ENTITY_PATTERN = /(?:\bspa\b|wellness|medical|therapy|treatment|massage|ritual|hammam|hydrotherapy|physiotherapy|kinesiotherapy|спа|уелнес|медиц|терап|масаж|ритуал|хамам|хидротерап|физиотерап|кинезитерап)/iu;

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

function verificationStatus(fact) {
  const value = String(fact?.verification?.status || "UNSCORED");
  return ["VERIFIED", "SINGLE_SOURCE", "CONFLICT"].includes(value) ? value : "UNSCORED";
}

function worstVerification(facts) {
  const statuses = new Set(facts.map(verificationStatus));
  if (statuses.has("CONFLICT")) return "CONFLICT";
  if (statuses.has("SINGLE_SOURCE")) return "SINGLE_SOURCE";
  if (statuses.has("UNSCORED")) return "UNSCORED";
  return "VERIFIED";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function hotelScannerHubSectionForFact(fact = {}) {
  const category = normalized(fact.category);
  const attribute = normalized(fact.attribute);
  const sources = sourceSignals(fact);
  const entityText = `${normalized(fact.subject)} ${normalized(fact.label)} ${normalized(fact.value)}`;
  const all = `${category} ${attribute} ${entityText} ${sources}`;

  // Strong semantic attributes win over broad AI categories. This prevents a
  // medical recommended stay from appearing under Accommodation and prevents
  // venue age limits from becoming hotel-wide policy topics.
  if (CONTACT_ATTRIBUTES.has(attribute) || category === "contact" || category === "location") return "contacts";
  if (WELLNESS_ATTRIBUTES.has(attribute) || category === "wellness" || WELLNESS_ENTITY_PATTERN.test(all)) return "wellness";
  if (POLICY_ATTRIBUTES.has(attribute)) return "policies";
  if (ROOM_ATTRIBUTES.has(attribute) || category === "accommodation" || category === "room") return "accommodation";
  if (category === "offers" || attribute === "offer" || /(?:offers?|packages?|promotion|оферт|пакет|промо)/iu.test(`${attribute} ${sources}`)) return "offers";

  // A conference hall / meeting room is a static facility. It belongs in the
  // hotel facilities/services inventory, not in the daily Events & Offers feed.
  if (STATIC_EVENT_FACILITY_ATTRIBUTES.has(attribute) || SERVICE_ENTITY_PATTERN.test(entityText)) return "services";

  if (category === "dining" || DINING_ATTRIBUTES.has(attribute) || /(?:gastronomy|restaurants?|dining|bars?)/iu.test(all)) return "dining";

  // Explicit activity/attraction semantics outrank a generic services category.
  if (EXPERIENCE_ATTRIBUTES.has(attribute) || category === "experiences" || /(?:experiences?|activities|things[-_ ]?to[-_ ]?do|attractions?|nearby|преживяв|активност|забележител)/iu.test(sources)) return "experiences";

  // True policy/FAQ pages can still contribute policy facts, but generic age or
  // dress-code facts stay with the venue/service they describe.
  if ((category === "policy" || category === "faq" || /(?:faq|policy|policies|rules|terms|conditions|политик|правил|услов)/iu.test(sources))
      && !["age_policy", "dress_code"].includes(attribute)) return "policies";

  if (category === "events") return "events";
  if (category === "services" || category === "amenities" || SERVICE_ATTRIBUTES.has(attribute) || /(?:\/services?(?:\/|$)|facilit|amenit|услуг|удобств)/iu.test(sources)) return "services";
  return "overview";
}

function entityKey(fact, section, index) {
  const subject = clean(fact.subject);
  if (section === "policies" || section === "contacts" || section === "overview") return "hotel";
  if (subject && normalized(subject) !== "hotel" && normalized(subject) !== "property" && normalized(subject) !== "resort") return subject;
  if (section === "accommodation" && normalized(fact.attribute) === "room_type") return clean(fact.value) || clean(fact.label) || `item-${index}`;
  if (["dining", "wellness", "services", "experiences", "events", "offers"].includes(section)) return clean(fact.label) || clean(fact.value) || `item-${index}`;
  return "hotel";
}

function finalizeItem(item) {
  const seenFacts = new Set();
  item.facts = item.facts.filter((fact) => {
    const key = `${normalized(fact.attribute)}|${normalized(fact.value)}`;
    if (seenFacts.has(key)) return false;
    seenFacts.add(key);
    return true;
  });
  item.sourceUrls = unique(item.facts.flatMap(factUrls));
  item.verification = worstVerification(item.facts);
  item.maxConfidence = item.facts.reduce((max, fact) => Math.max(max, Number(fact?.confidence || 0)), 0);
  return item;
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
      item = { key, name: key === "hotel" ? "" : key, facts: [], sourceUrls: [], verification: "UNSCORED", maxConfidence: 0 };
      itemMaps[section.key].set(key, item);
      section.items.push(item);
    }
    item.facts.push(fact);
  }

  return SECTION_ORDER
    .map((key) => {
      const section = sections[key];
      section.items = section.items.map(finalizeItem);
      section.sourceUrls = unique(section.items.flatMap((item) => item.sourceUrls));
      return section;
    })
    .filter((section) => section.facts.length > 0);
}

export { SECTION_ORDER as HOTEL_SCANNER_HUB_SECTION_ORDER };