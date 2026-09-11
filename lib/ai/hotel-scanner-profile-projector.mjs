function text(value, max = 500) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : normalized.slice(0, max);
}

function normalized(value) {
  return text(value).toLocaleLowerCase("en-US").replace(/[\s.,;:!?()[\]{}"'`]+/g, " ").trim();
}

function unique(values, max = 80) {
  const seen = new Set();
  const result = [];
  for (const raw of values || []) {
    const value = text(raw);
    const key = normalized(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

function phoneKey(raw) {
  const value = text(raw, 80);
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

function normalizePhones(values) {
  const byKey = new Map();
  for (const raw of values || []) {
    const value = text(raw, 80);
    const key = phoneKey(value);
    if (!value || !key) continue;
    const current = byKey.get(key);
    const score = (value.startsWith("+") ? 3 : 0) + (value.replace(/\D/g, "").length > 9 ? 2 : 0) + value.length / 1000;
    if (!current || score > current.score) byKey.set(key, { value, score });
  }
  return [...byKey.values()].map((entry) => entry.value).slice(0, 12);
}

const LANGUAGE_CODES = new Map([
  ["bg", "bg"], ["bulgarian", "bg"], ["български", "bg"],
  ["en", "en"], ["english", "en"], ["английски", "en"],
  ["de", "de"], ["german", "de"], ["deutsch", "de"], ["немски", "de"],
  ["ro", "ro"], ["romanian", "ro"], ["română", "ro"], ["romana", "ro"], ["румънски", "ro"],
  ["mk", "mk"], ["macedonian", "mk"], ["македонски", "mk"],
  ["ru", "ru"], ["russian", "ru"], ["русский", "ru"], ["руски", "ru"],
  ["cs", "cs"], ["cz", "cs"], ["czech", "cs"], ["čeština", "cs"], ["чешки", "cs"],
  ["tr", "tr"], ["turkish", "tr"], ["türkçe", "tr"], ["турски", "tr"],
  ["el", "el"], ["greek", "el"], ["ελληνικά", "el"], ["гръцки", "el"],
]);

function languageCode(value) {
  const raw = normalized(value);
  if (!raw) return "";
  if (LANGUAGE_CODES.has(raw)) return LANGUAGE_CODES.get(raw);
  for (const [label, code] of LANGUAGE_CODES.entries()) {
    if (raw === label || raw.startsWith(`${label} `) || raw.endsWith(` ${label}`)) return code;
  }
  return "";
}

function normalizeLanguages(values) {
  const seen = new Set();
  const result = [];
  for (const raw of values || []) {
    for (const part of String(raw || "").split(/[,;/|]+/)) {
      const code = languageCode(part);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      result.push(code);
    }
  }
  return result.slice(0, 20);
}

function verificationStatus(fact) {
  return String(fact?.verification?.status || "");
}

function acceptedFact(fact) {
  return verificationStatus(fact) !== "CONFLICT" && Number(fact?.confidence ?? 0) >= 0.8 && text(fact?.value);
}

function factsFor(profile, predicate, acceptedOnly = true) {
  return (Array.isArray(profile?.facts) ? profile.facts : []).filter((fact) => (!acceptedOnly || acceptedFact(fact)) && predicate(fact));
}

function attribute(fact) {
  return String(fact?.attribute || "").trim().toLowerCase();
}

function category(fact) {
  return String(fact?.category || "").trim().toLowerCase();
}

function subject(fact) {
  return text(fact?.subject, 160);
}

function value(fact) {
  return text(fact?.value, 500);
}

function label(fact) {
  return text(fact?.label, 160);
}

function subjectKey(fact) {
  return normalized(subject(fact) || "hotel");
}

function meaningfulSubject(fact) {
  const candidate = subject(fact);
  if (!candidate) return "";
  const key = normalized(candidate);
  if (["hotel", "resort", "property", "grand resort pavel banya"].includes(key)) return "";
  return candidate;
}

function entityName(fact) {
  const attr = attribute(fact);
  const namedSubject = meaningfulSubject(fact);
  if (namedSubject) return namedSubject;
  if (["amenity", "facility", "wifi", "parking"].includes(attr) && label(fact)) return label(fact);
  if (attr === "room_type" && label(fact) && /(?:room|стая|апартамент|studio|suite|тип)/iu.test(label(fact))) return value(fact);
  return value(fact);
}

function roomTypeName(fact) {
  const namedSubject = meaningfulSubject(fact);
  if (namedSubject) return namedSubject;
  const raw = value(fact);
  if (!raw || raw.length > 120 || /[;:.]|(?:with|със|с |featuring|подходящ|разполага)/iu.test(raw)) return "";
  return raw;
}

function hasConflict(profile, predicate) {
  return factsFor(profile, (fact) => verificationStatus(fact) === "CONFLICT" && predicate(fact), false).length > 0;
}

function venueTypeForFacts(facts) {
  const haystack = facts.map((fact) => `${text(fact.label)} ${value(fact)}`).join(" ").toLowerCase();
  if (/bar|бар/u.test(haystack)) return "bar";
  if (/restaurant|dining|ресторант|хран/u.test(haystack)) return "restaurant";
  if (/cafe|café|каф/u.test(haystack)) return "cafe";
  return "venue";
}

function projectVenues(profile) {
  const existing = Array.isArray(profile?.hospitality?.venues) ? profile.hospitality.venues : [];
  const allDiningFacts = factsFor(profile, (fact) => category(fact) === "dining", false);
  const acceptedDiningFacts = allDiningFacts.filter(acceptedFact);
  const byName = new Map();

  if (!allDiningFacts.length) {
    for (const venue of existing) {
      const name = text(venue?.name, 160);
      if (!name) continue;
      byName.set(normalized(name), {
        name,
        type: text(venue?.type, 80),
        hours: text(venue?.hours, 160),
        summary: text(venue?.summary, 320),
      });
    }
    return [...byName.values()].slice(0, 40);
  }

  const grouped = new Map();
  for (const fact of acceptedDiningFacts) {
    const attr = attribute(fact);
    let name = meaningfulSubject(fact);
    if (!name && attr === "venue") name = value(fact);
    if (!name) continue;
    const key = normalized(name);
    const bucket = grouped.get(key) || { name, facts: [] };
    bucket.facts.push(fact);
    grouped.set(key, bucket);
  }

  for (const [key, entry] of grouped.entries()) {
    const hours = entry.facts.find((fact) => attribute(fact) === "hours");
    const summary = entry.facts.find((fact) => ["description", "summary", "venue"].includes(attribute(fact)) && value(fact) !== entry.name);
    const hoursConflict = hasConflict(profile, (fact) => category(fact) === "dining" && attribute(fact) === "hours" && subjectKey(fact) === key);
    byName.set(key, {
      name: entry.name,
      type: venueTypeForFacts(entry.facts),
      hours: hoursConflict ? "" : (hours ? value(hours) : ""),
      summary: summary ? value(summary) : "",
    });
  }

  return [...byName.values()].slice(0, 40);
}

function resolveFinalUncertainties(profile) {
  const checkIn = text(profile?.operations?.checkIn);
  const checkOut = text(profile?.operations?.checkOut);
  const contacts = profile?.contacts || {};
  return unique((profile?.uncertainties || []).filter((raw) => {
    const note = normalized(raw);
    if (!note) return false;
    if (checkIn && checkOut && /(?:check in|check out|настаняв|освобождав|напускан)/iu.test(note)) return false;
    if ((contacts.emails || []).length && /(?:email|e mail|имейл|електронна поща)/iu.test(note) && /(?:missing|not clear|липс|не е ясно|не са ясно)/iu.test(note)) return false;
    if ((contacts.phones || []).length && /(?:phone|telephone|телефон)/iu.test(note) && /(?:missing|not clear|липс|не е ясно|не са ясно)/iu.test(note)) return false;
    return true;
  }), 40);
}

export function projectVerifiedHotelScanFacts(inputProfile) {
  const profile = JSON.parse(JSON.stringify(inputProfile || {}));
  profile.contacts ||= { phones: [], emails: [], socialLinks: [] };
  profile.operations ||= { checkIn: "", checkOut: "", languages: [] };
  profile.hospitality ||= { roomTypes: [], amenities: [], venues: [], spaServices: [], policies: [] };
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];
  profile.uncertainties = Array.isArray(profile.uncertainties) ? profile.uncertainties : [];

  const roomFacts = factsFor(profile, (fact) => category(fact) === "accommodation" && attribute(fact) === "room_type");
  const roomTypes = unique(roomFacts.map(roomTypeName).filter(Boolean), 40);
  const amenityFacts = factsFor(profile, (fact) => ["amenities", "parking"].includes(category(fact)) && ["amenity", "facility", "service", "wifi", "parking"].includes(attribute(fact)));
  const amenities = unique(amenityFacts.map(entityName).filter(Boolean), 60);
  const spaFacts = factsFor(profile, (fact) => category(fact) === "wellness" && ["service", "treatment", "amenity", "facility"].includes(attribute(fact)));
  const spaServices = unique(spaFacts.map((fact) => meaningfulSubject(fact) || label(fact) || value(fact)).filter(Boolean), 60);
  const allPolicyFacts = factsFor(profile, (fact) => category(fact) === "policy", false);
  const policies = allPolicyFacts.filter(acceptedFact).map((fact) => `${text(fact.label, 120)}: ${value(fact)}`);
  const languages = normalizeLanguages(factsFor(profile, (fact) => attribute(fact) === "language").map(value));
  const phones = factsFor(profile, (fact) => category(fact) === "contact" && attribute(fact) === "phone").map(value);
  const emails = factsFor(profile, (fact) => category(fact) === "contact" && attribute(fact) === "email").map(value);

  profile.contacts.phones = normalizePhones([...(profile.contacts.phones || []), ...phones]);
  profile.contacts.emails = unique([...(profile.contacts.emails || []), ...emails], 12);
  profile.contacts.socialLinks = unique(profile.contacts.socialLinks || [], 16);

  const coreLanguages = normalizeLanguages(profile.operations.languages || []);
  profile.operations.languages = languages.length ? languages : coreLanguages;
  if (roomFacts.length) profile.hospitality.roomTypes = roomTypes;
  else profile.hospitality.roomTypes = unique(profile.hospitality.roomTypes || [], 40);
  if (amenityFacts.length) profile.hospitality.amenities = amenities;
  else profile.hospitality.amenities = unique(profile.hospitality.amenities || [], 60);
  if (spaFacts.length) profile.hospitality.spaServices = spaServices;
  else profile.hospitality.spaServices = unique(profile.hospitality.spaServices || [], 60);

  if (allPolicyFacts.length) profile.hospitality.policies = unique(policies, 40);
  else profile.hospitality.policies = unique(profile.hospitality.policies || [], 40);

  if (hasConflict(profile, (fact) => category(fact) === "operations" && attribute(fact) === "check_in")) profile.operations.checkIn = "";
  if (hasConflict(profile, (fact) => category(fact) === "operations" && attribute(fact) === "check_out")) profile.operations.checkOut = "";

  profile.hospitality.venues = projectVenues(profile);
  profile.uncertainties = resolveFinalUncertainties(profile);
  return profile;
}

export function formatHotelScanAddress(identity = {}) {
  const parts = [];
  for (const raw of [identity.address, identity.city, identity.country]) {
    const value = text(raw, 300);
    if (!value) continue;
    const key = normalized(value);
    if (parts.some((part) => normalized(part).includes(key) || key.includes(normalized(part)))) continue;
    parts.push(value);
  }
  return parts.join(", ");
}
