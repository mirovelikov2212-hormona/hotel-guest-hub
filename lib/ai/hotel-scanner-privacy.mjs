const BUSINESS_EMAIL_LOCAL_PARTS = new Set([
  "info", "contact", "contacts", "hello", "office", "hotel", "reception", "frontdesk", "frontoffice",
  "reservation", "reservations", "booking", "bookings", "sales", "events", "event", "spa", "wellness",
  "restaurant", "restaurants", "marketing", "conference", "conferences", "groups", "group", "guestrelations",
  "guestservice", "guestservices", "service", "services", "manager", "generalmanager", "gm",
]);

function text(value, max = 500) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : normalized.slice(0, max);
}

function compact(value) {
  return text(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
}

function emailParts(value) {
  const candidate = text(value, 200).replace(/^mailto:/iu, "").toLocaleLowerCase("en-US");
  const at = candidate.lastIndexOf("@");
  if (at <= 0 || at === candidate.length - 1) return null;
  return { candidate, localPart: candidate.slice(0, at), domain: candidate.slice(at + 1) };
}

export function isPrivacyMinimalHotelBusinessEmail(value) {
  const parsed = emailParts(value);
  if (!parsed) return false;
  const local = compact(parsed.localPart);
  if (!local) return false;
  if (BUSINESS_EMAIL_LOCAL_PARTS.has(local)) return true;

  const domainLabel = compact(parsed.domain.split(".")[0]);
  if (domainLabel.length >= 5 && local.length >= 5) {
    if (local === domainLabel || local.includes(domainLabel) || domainLabel.includes(local)) return true;
  }
  return false;
}

function isPropertyContactFact(fact) {
  const category = text(fact?.category, 80).toLocaleLowerCase("en-US");
  const attribute = text(fact?.attribute, 80).toLocaleLowerCase("en-US");
  const subject = text(fact?.subject, 160).toLocaleLowerCase("en-US");
  if (category !== "contact") return true;
  if (!["email", "phone", "social_profile"].includes(attribute)) return true;
  return !subject || ["hotel", "resort", "property"].includes(subject);
}

export function applyPrivacyMinimalHotelProjection(inputProfile) {
  const profile = JSON.parse(JSON.stringify(inputProfile || {}));
  profile.contacts ||= {};
  profile.contacts.emails = Array.isArray(profile.contacts.emails) ? profile.contacts.emails : [];
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];

  const filtered = [];
  profile.contacts.emails = profile.contacts.emails.filter((email) => {
    if (isPrivacyMinimalHotelBusinessEmail(email)) return true;
    filtered.push({ path: "contacts.emails", reason: "personal_or_non_business_email_not_projected", kind: "email" });
    return false;
  });

  profile.facts = profile.facts.filter((fact) => {
    if (!isPropertyContactFact(fact)) {
      filtered.push({ path: "facts", reason: "direct_person_contact_not_projected", kind: "contact" });
      return false;
    }
    if (text(fact?.category, 80).toLocaleLowerCase("en-US") === "contact"
        && text(fact?.attribute, 80).toLocaleLowerCase("en-US") === "email"
        && !isPrivacyMinimalHotelBusinessEmail(fact?.value)) {
      filtered.push({ path: "facts", reason: "personal_or_non_business_email_not_projected", kind: "email" });
      return false;
    }
    return true;
  });

  return {
    profile,
    filtered,
    policy: {
      schemaVersion: "hotel-scanner-privacy-v1",
      scope: "public_business_information_only",
      personalProfileEnrichment: false,
      directPersonContactProjection: false,
    },
  };
}
