const EMAIL_LABEL = /(?:^|\b)(?:e-?mail|email address|електронна поща|имейл)(?:\b|$)/iu;
const ADDRESS_LABEL = /(?:^|\b)(?:address|hotel address|postal address|адрес|адрес на хотела)(?:\b|$)/iu;
const EMAIL_SHAPE = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/iu;
const RESERVED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "invalid",
  "invalid.test",
  "test.invalid",
]);
const PLACEHOLDER_EMAIL_LOCAL_PARTS = new Set([
  "email",
  "your",
  "your-email",
  "youremail",
  "your.email",
  "name",
  "test",
  "example",
]);

function text(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalized(value) {
  return text(value).toLocaleLowerCase("en-US");
}

function emailContext(category, label) {
  return normalized(category) === "contact" && EMAIL_LABEL.test(text(label));
}

function addressContext(category, label) {
  const categoryKey = normalized(category);
  return (categoryKey === "location" || categoryKey === "identity") && ADDRESS_LABEL.test(text(label));
}

function placeholderProtectedEmail(value) {
  const key = normalized(value)
    .replace(/^mailto:/, "")
    .replace(/[<>]/g, "")
    .trim();
  return (
    /^\[?\s*email\s+protected\s*\]?$/iu.test(key)
    || /^\[?\s*e-?mail\s+protected\s*\]?$/iu.test(key)
    || /^\[?\s*имейл(?:ът)?\s+е\s+защитен\s*\]?$/iu.test(key)
    || key.includes("[email protected]")
  );
}

export function validateHotelIntelligenceValue(input = {}) {
  const category = text(input.category);
  const label = text(input.label);
  const value = text(input.value);

  if (!value) return { valid: false, kind: "empty", reason: "empty_value" };

  if (emailContext(category, label)) {
    if (placeholderProtectedEmail(value)) {
      return { valid: false, kind: "email", reason: "protected_email_placeholder" };
    }
    const candidate = value.replace(/^mailto:/iu, "").trim();
    if (/\s+(?:at|dot)\s+/iu.test(candidate) || /\s+\(at\)\s+/iu.test(candidate)) {
      return { valid: false, kind: "email", reason: "obfuscated_email" };
    }
    if (!EMAIL_SHAPE.test(candidate)) {
      return { valid: false, kind: "email", reason: "malformed_email" };
    }
    const [localPart, domain] = candidate.toLocaleLowerCase("en-US").split("@");
    if (RESERVED_EMAIL_DOMAINS.has(domain)) {
      return { valid: false, kind: "email", reason: "reserved_email_domain" };
    }
    if (PLACEHOLDER_EMAIL_LOCAL_PARTS.has(localPart)) {
      return { valid: false, kind: "email", reason: "placeholder_email_local_part" };
    }
    return { valid: true, kind: "email", reason: null, normalizedValue: candidate };
  }

  if (addressContext(category, label)) {
    const key = normalized(value).replace(/[.,;:!?]/g, "").trim();
    if (key.length < 6) return { valid: false, kind: "address", reason: "address_too_short" };
    if (/^(?:address|hotel address|postal address|your address|enter address|адрес|адрес на хотела|въведете адрес|няма адрес|n\/a|na|unknown|неизвестен)$/iu.test(key)) {
      return { valid: false, kind: "address", reason: "placeholder_address" };
    }
    return { valid: true, kind: "address", reason: null, normalizedValue: value };
  }

  return { valid: true, kind: "generic", reason: null, normalizedValue: value };
}

function invalidEntry(path, category, label, value, validation) {
  return {
    path,
    category,
    label,
    value: text(value),
    kind: validation.kind,
    reason: validation.reason,
  };
}

export function sanitizeHotelScanProfileValues(inputProfile) {
  const profile = JSON.parse(JSON.stringify(inputProfile || {}));
  profile.identity ||= {};
  profile.contacts ||= {};
  profile.contacts.emails = Array.isArray(profile.contacts.emails) ? profile.contacts.emails : [];
  profile.facts = Array.isArray(profile.facts) ? profile.facts : [];
  const invalidValues = [];

  const addressValidation = validateHotelIntelligenceValue({
    category: "location",
    label: "Address",
    value: profile.identity.address,
  });
  if (text(profile.identity.address) && !addressValidation.valid) {
    invalidValues.push(invalidEntry(
      "identity.address",
      "location",
      "Address",
      profile.identity.address,
      addressValidation,
    ));
    profile.identity.address = "";
  }

  const retainedEmails = [];
  for (const [index, email] of profile.contacts.emails.entries()) {
    const validation = validateHotelIntelligenceValue({ category: "contact", label: "Email", value: email });
    if (!validation.valid) {
      invalidValues.push(invalidEntry(`contacts.emails.${index}`, "contact", "Email", email, validation));
      continue;
    }
    retainedEmails.push(validation.normalizedValue || text(email));
  }
  profile.contacts.emails = [...new Set(retainedEmails)];

  for (const [index, fact] of profile.facts.entries()) {
    const validation = validateHotelIntelligenceValue(fact);
    if (!validation.valid) {
      invalidValues.push(invalidEntry(
        `facts.${index}`,
        text(fact?.category),
        text(fact?.label),
        fact?.value,
        validation,
      ));
    }
  }

  return { profile, invalidValues };
}

export function findInvalidHotelProfileValues(profile) {
  const invalidValues = [];
  if (!profile || typeof profile !== "object") return invalidValues;

  const address = profile.identity?.address;
  if (text(address)) {
    const validation = validateHotelIntelligenceValue({ category: "location", label: "Address", value: address });
    if (!validation.valid) invalidValues.push(invalidEntry("identity.address", "location", "Address", address, validation));
  }

  const emails = Array.isArray(profile.contacts?.emails) ? profile.contacts.emails : [];
  for (const [index, email] of emails.entries()) {
    const validation = validateHotelIntelligenceValue({ category: "contact", label: "Email", value: email });
    if (!validation.valid) invalidValues.push(invalidEntry(`contacts.emails.${index}`, "contact", "Email", email, validation));
  }
  return invalidValues;
}
