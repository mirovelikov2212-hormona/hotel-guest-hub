import "server-only";

import OpenAI from "openai";

let client: OpenAI | null = null;

function getOpenAiClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  if (!client) client = new OpenAI({ apiKey, timeout: 15000, maxRetries: 1 });
  return client;
}

export function hasBulgarianLetters(value: string) {
  return /[А-Яа-я]/.test(value || "");
}

function normalizeWhitespace(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function looksLikeNoTranslationNeeded(value: string) {
  const text = normalizeWhitespace(value);
  if (!text) return true;
  if (hasBulgarianLetters(text)) return true;
  if (/^[\d\s:.,/+\-€]+$/.test(text)) return true;
  return false;
}

function deterministicGuestTextTranslation(text: string) {
  const normalized = normalizeWhitespace(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/plasa\s+de\s+tantari/.test(normalized) && /(usa|ușa)\s+balcon/.test(normalized)) {
    return "Мрежата против комари на балконската врата.";
  }

  if (/usa\s+balcon/.test(normalized) && /(rupt|stricat|defect)/.test(normalized)) {
    return "Проблем с балконската врата.";
  }

  if (/aer\s+conditionat|climatizare/.test(normalized)) {
    return "Проблем с климатика.";
  }

  if (/nu\s+este\s+apa\s+calda|apa\s+calda/.test(normalized)) {
    return "Проблем с топлата вода.";
  }

  return "";
}

export async function translateGuestTextToBulgarian(
  value: unknown,
  options?: {
    sourceLanguage?: string | null;
    context?: string;
    maxLength?: number;
  },
) {
  const original = normalizeWhitespace(value).slice(0, options?.maxLength ?? 1200);
  if (!original) return "";
  if (looksLikeNoTranslationNeeded(original)) return original;

  const deterministic = deterministicGuestTextTranslation(original);
  if (deterministic) return deterministic;

  const openai = getOpenAiClient();
  if (!openai) return original;

  try {
    const model = String(process.env.OPENAI_TRANSLATION_MODEL || process.env.OPENAI_HOTEL_MODEL || "gpt-5-mini").trim();
    const response = await openai.responses.create({
      model,
      store: false,
      max_output_tokens: 450,
      reasoning: { effort: "low" },
      instructions: [
        "Translate guest-written hotel operational text into Bulgarian for hotel staff.",
        "Return only the Bulgarian translation, no explanations, no quotes, no markdown.",
        "Keep room numbers, times, dates, prices, product names, massage names and short labels unchanged when needed.",
        "Do not add facts. If the text is unclear, translate as literally and safely as possible.",
      ].join("\n"),
      input: JSON.stringify({
        source_language_hint: options?.sourceLanguage || "unknown",
        context: options?.context || "hotel staff operational note",
        text: original,
      }),
    });

    const translated = normalizeWhitespace(response.output_text).slice(0, options?.maxLength ?? 1200);
    return translated || original;
  } catch (error) {
    console.error("Guest text translation failed", {
      sourceLanguage: options?.sourceLanguage,
      context: options?.context,
      error,
    });
    return original;
  }
}
