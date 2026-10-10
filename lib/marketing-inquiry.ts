export type MarketingLanguage = "bg" | "en" | "de";

export type MarketingInquiry = {
  name: string;
  hotel: string;
  email: string;
  message: string;
  language: MarketingLanguage;
};

type ValidationResult =
  | { ok: true; inquiry: MarketingInquiry }
  | { ok: false; error: "invalid_fields" | "spam" };

export function isContactEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

export function validateMarketingInquiry(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_fields" };
  }

  const input = value as Record<string, unknown>;
  if (typeof input.website !== "string" || input.website.trim()) {
    return { ok: false, error: "spam" };
  }

  function text(key: string, limit: number) {
    const field = input[key];
    if (typeof field !== "string") return null;
    const result = field.trim();
    return result.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)
      ? result
      : null;
  }

  const name = text("name", 100);
  const hotel = text("hotel", 160);
  const email = text("email", 254);
  const message = text("message", 2000);
  const language = input.language;

  if (!name || !hotel || !email || !isContactEmail(email) || message === null
    || /[\r\n]/.test(name + hotel + email)
    || input.consent !== true
    || !["bg", "en", "de"].includes(String(language))) {
    return { ok: false, error: "invalid_fields" };
  }

  return {
    ok: true,
    inquiry: { name, hotel, email, message, language: language as MarketingLanguage },
  };
}

export function formatMarketingInquiry(inquiry: MarketingInquiry): string {
  return [
    "Ново запитване от демонстрационния сайт на GOSTAYA",
    "",
    `Име: ${inquiry.name}`,
    `Хотел / организация: ${inquiry.hotel}`,
    `Имейл за отговор: ${inquiry.email}`,
    `Език на сайта: ${inquiry.language}`,
    "",
    "Съобщение:",
    inquiry.message || "Желая повече информация и представяне на GOSTAYA за моя хотел.",
    "",
    "Контактните данни са предоставени за отговор по това запитване.",
  ].join("\n");
}

/** Report success only after the mail transport accepts the inquiry. */
export async function deliverMarketingInquiry(
  inquiry: MarketingInquiry,
  send: (body: string) => Promise<void>,
): Promise<{ ok: boolean }> {
  try {
    await send(formatMarketingInquiry(inquiry));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Per-instance throttling supplements the honeypot and same-origin check. */
export function createInquiryThrottle(maxAttempts = 3) {
  const attempts = new Map<string, { count: number; expires: number }>();
  const windowMs = 10 * 60 * 1000;
  return (key: string, now = Date.now()) => {
    for (const [address, bucket] of attempts) {
      if (bucket.expires <= now) attempts.delete(address);
    }
    const existing = attempts.get(key);
    if (existing) {
      if (existing.count >= maxAttempts) return false;
      existing.count += 1;
      return true;
    }
    if (attempts.size >= 1000) return false;
    attempts.set(key, { count: 1, expires: now + windowMs });
    return true;
  };
}
