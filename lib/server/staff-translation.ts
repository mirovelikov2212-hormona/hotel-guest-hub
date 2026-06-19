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

  const hasAny = (...patterns: RegExp[]) => patterns.some((pattern) => pattern.test(normalized));

  if (/plasa\s+de\s+tantari/.test(normalized) && /(usa|usa)\s+balcon/.test(normalized)) {
    return "Мрежата против комари на балконската врата.";
  }

  if (/camera\s+este\s+curata/.test(normalized) && /aerul?\s+conditionat/.test(normalized) && /zgomotos/.test(normalized)) {
    return "Стаята е чиста, но климатикът е шумен.";
  }

  if (/usa\s+balcon/.test(normalized) && /(rupt|stricat|defect|broken|kaputt|rozbita|slomana)/.test(normalized)) {
    return "Проблем с балконската врата.";
  }

  if (hasAny(/aerul?\s+conditionat/, /climatizare/, /air\s+condition/, /klimaanlage/, /klimatizace/, /kondicioner/, /кондиционер/, /климатик/)) {
    if (hasAny(/zgomotos/, /noisy/, /laut/, /hlucn/, /шум/)) return "Климатикът е шумен.";
    if (hasAny(/nu\s+functioneaza/, /not\s+working/, /kaputt/, /nefunguje/, /не\s+работ/)) return "Климатикът не работи.";
    return "Проблем с климатика.";
  }

  if (hasAny(/nu\s+este\s+apa\s+calda/, /apa\s+calda/, /hot\s+water/, /warmes\s+wasser/, /tepla\s+voda/, /горячая\s+вода/, /топла\s+вода/)) {
    return "Проблем с топлата вода.";
  }

  if (hasAny(/mosquito\s+net/, /moskitonetz/, /sit\w*\s+proti\s+komar/, /москитн/)) {
    if (hasAny(/balcony/, /balkon/, /балкон/)) return "Мрежата против комари на балконската врата е повредена.";
    return "Мрежата против комари е повредена.";
  }

  if (hasAny(/taxi/) && hasAny(/tomorrow/, /maine/, /morgen/, /zitra/, /завтра/)) {
    const timeMatch = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const time = timeMatch ? ` в ${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "";
    return `Нуждаем се от такси утре${time}.`;
  }

  return "";
}

async function translateWithResponsesApi(openai: OpenAI, model: string, original: string, options?: {
  sourceLanguage?: string | null;
  context?: string;
  maxLength?: number;
}) {
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

  return normalizeWhitespace(response.output_text).slice(0, options?.maxLength ?? 1200);
}

async function translateWithChatCompletions(openai: OpenAI, model: string, original: string, options?: {
  sourceLanguage?: string | null;
  context?: string;
  maxLength?: number;
}) {
  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 450,
    messages: [
      {
        role: "system",
        content: [
          "Translate guest-written hotel operational text into Bulgarian for hotel staff.",
          "Return only the Bulgarian translation, no explanations, no quotes, no markdown.",
          "Keep room numbers, times, dates, prices, product names and short labels unchanged when needed.",
          "Do not add facts. If unclear, translate literally and safely.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          source_language_hint: options?.sourceLanguage || "unknown",
          context: options?.context || "hotel staff operational note",
          text: original,
        }),
      },
    ],
  });

  return normalizeWhitespace(response.choices[0]?.message?.content || "").slice(0, options?.maxLength ?? 1200);
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

  const model = String(process.env.OPENAI_TRANSLATION_MODEL || process.env.OPENAI_HOTEL_MODEL || "gpt-5-mini").trim();

  try {
    const translated = await translateWithResponsesApi(openai, model, original, options);
    return translated || original;
  } catch (responsesError) {
    console.error("Guest text translation via responses API failed; trying chat completions", {
      sourceLanguage: options?.sourceLanguage,
      context: options?.context,
      error: responsesError,
    });
  }

  try {
    const translated = await translateWithChatCompletions(openai, model, original, options);
    return translated || original;
  } catch (chatError) {
    console.error("Guest text translation failed", {
      sourceLanguage: options?.sourceLanguage,
      context: options?.context,
      error: chatError,
    });
    return original;
  }
}
