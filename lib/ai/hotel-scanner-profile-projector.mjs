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
  if (digits.length >= 9) return digits.slice(-9);
  return digits;
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

  for (const venue of existing) {
    const name = text(venue?.name, 160);
    if (!name) continue;
    const normalizedName = normalized(name);
    const hasAnyFactForVenue = allDiningFacts.some((fact) => subjectKey(fact) === normalizedName || (attribute(fact) === "venue" && normalized(value(fact)) === normalizedName));
    const hoursConflict = allDiningFacts.some((fact) => verificationStatus(fact) === "CONFLICT" && attribute(fact) === "hours" && subjectKey(fact) === normalizedName);
    byName.set(normalizedName, {
      name,
      type: text(venue?.type, 80),
      hours: hoursConflict ? "" : text(venue?.hours, 160),
      summary: hasAnyFactForVenue ? "" : text(venue?.summary, 320),
    });
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
    const current = byName.get(key) || { name: entry.name, type: "", hours: "", summary: "" };
    const hours = entry.facts.find((fact) => attribute(fact) === "hours");
    const summary = entry.facts.find((fact) => ["description", "summary", "venue"].includes(attribute(fact)) && value(fact) !== entry.name);
    const hoursConflict = hasConflict(profile, (fact) => category(fact) === "dining" && attribute(fact) === "hours" && subjectKey(fact) === key);
    byName.set(key, {
      name: current.name || entry.name,
      type: current.type || venueTypeForFacts(entry.facts),
      hours: hoursConflict ? "" : (hours ? value(hours) : current.hours),
      summary: summary ? value(summary) : current.summary,
    });
  }

  return [...byName.values()].slice(0, 40);
}

export function projectVerifiedHotelScanFacts(inputProfile) {
  const profile = JSON.parse(JSON.stringify(inputProfile || {}));
  profile.contacts ||= { phones: [], emails: [], socialLinks: [] };
  profile.operations ||= { checkIn: "", checkOut: "", languages: [] };
  profile.hospitality ||= { roomTypes: [], amenities: [], venues: [], spaServices: [], policies: [] };
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];

  const roomTypes = factsFor(profile, (fact) => category(fact) === "accommodation" && attribute(fact) === "room_type").map(value);
  const amenities = factsFor(profile, (fact) => category(fact) === "amenities" && ["amenity", "facility", "service", "wifi"].includes(attribute(fact))).map(value);
  const spaServices = factsFor(profile, (fact) => category(fact) === "wellness" && ["service", "treatment", "amenity"].includes(attribute(fact))).map((fact) => meaningfulSubject(fact) || value(fact));
  const allPolicyFacts = factsFor(profile, (fact) => category(fact) === "policy", false);
  const policies = allPolicyFacts.filter(acceptedFact).map((fact) => `${text(fact.label, 120)}: ${value(fact)}`);
  const languages = factsFor(profile, (fact) => attribute(fact) === "language").map(value);
  const phones = factsFor(profile, (fact) => category(fact) === "contact" && attribute(fact) === "phone").map(value);
  const emails = factsFor(profile, (fact) => category(fact) === "contact" && attribute(fact) === "email").map(value);

  profile.contacts.phones = normalizePhones([...(profile.contacts.phones || []), ...phones]);
  profile.contacts.emails = unique([...(profile.contacts.emails || []), ...emails], 12);
  profile.contacts.socialLinks = unique(profile.contacts.socialLinks || [], 16);
  profile.operations.languages = unique([...(profile.operations.languages || []), ...languages], 16);
  profile.hospitality.roomTypes = unique([...(profile.hospitality.roomTypes || []), ...roomTypes], 40);
  profile.hospitality.amenities = unique([...(profile.hospitality.amenities || []), ...amenities], 60);
  profile.hospitality.spaServices = unique([...(profile.hospitality.spaServices || []), ...spaServices], 60);

  // Policy facts become authoritative whenever the evidence extractor found policy evidence.
  // This prevents an AI core-profile guess from surviving after a contradiction was found.
  if (allPolicyFacts.length) profile.hospitality.policies = unique(policies, 40);
  else profile.hospitality.policies = unique(profile.hospitality.policies || [], 40);

  if (hasConflict(profile, (fact) => category(fact) === "operations" && attribute(fact) === "check_in")) {
    profile.operations.checkIn = "";
  }
  if (hasConflict(profile, (fact) => category(fact) === "operations" && attribute(fact) === "check_out")) {
    profile.operations.checkOut = "";
  }

  profile.hospitality.venues = projectVenues(profile);
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
