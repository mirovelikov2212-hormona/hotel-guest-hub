import "server-only";

import OpenAI from "openai";

export const GUEST_COMMUNICATION_LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"] as const;
export type GuestCommunicationLanguage = typeof GUEST_COMMUNICATION_LANGUAGES[number];

type TranslationResult = {
  titleI18n: Record<GuestCommunicationLanguage, string>;
  bodyI18n: Record<GuestCommunicationLanguage, string>;
};

let client: OpenAI | null = null;

function openAiClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("guest_communications_openai_key_missing");
  if (!client) client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });
  return client;
}

function clean(value: unknown, max: number) {
  const normalized = String(value || "").trim().replace(/\r\n/g, "\n");
  return normalized.length > 0 && normalized.length <= max ? normalized : "";
}

function parseTranslation(raw: string, sourceLanguage: GuestCommunicationLanguage, title: string, body: string): TranslationResult {
  const parsed = JSON.parse(raw) as {
    title?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };
  const titleI18n = {} as Record<GuestCommunicationLanguage, string>;
  const bodyI18n = {} as Record<GuestCommunicationLanguage, string>;

  for (const language of GUEST_COMMUNICATION_LANGUAGES) {
    const translatedTitle = clean(parsed.title?.[language], 120);
    const translatedBody = clean(parsed.body?.[language], 1000);
    if (!translatedTitle || !translatedBody) {
      throw new Error(`guest_communications_translation_incomplete:${language}`);
    }
    titleI18n[language] = translatedTitle;
    bodyI18n[language] = translatedBody;
  }

  // The source language is authoritative; never let the model rewrite the text
  // written and approved by hotel staff.
  titleI18n[sourceLanguage] = title;
  bodyI18n[sourceLanguage] = body;
  return { titleI18n, bodyI18n };
}

export async function translateGuestCommunication(input: {
  sourceLanguage: GuestCommunicationLanguage;
  title: string;
  body: string;
}): Promise<TranslationResult> {
  const title = clean(input.title, 120);
  const body = clean(input.body, 1000);
  if (!title || !body || !GUEST_COMMUNICATION_LANGUAGES.includes(input.sourceLanguage)) {
    throw new Error("guest_communications_translation_invalid_input");
  }

  const model = String(process.env.OPENAI_COMMUNICATIONS_MODEL || process.env.OPENAI_HOTEL_MODEL || "gpt-5-mini").trim();
  const response = await openAiClient().responses.create({
    model,
    store: false,
    max_output_tokens: 2200,
    reasoning: { effort: "low" },
    instructions: [
      "You translate operational hotel messages for current hotel guests.",
      "Translate the supplied TITLE and BODY into Bulgarian (bg), English (en), German (de), Romanian (ro), Czech (cs), and Russian (ru).",
      "Preserve meaning, dates, times, prices, names, locations, punctuation and urgency exactly. Do not add facts, offers, conditions or explanations.",
      "Use polite, concise hotel-guest language. For emergency text, preserve urgency without exaggeration.",
      "Return ONLY valid JSON in this exact shape: {\"title\":{\"bg\":\"...\",\"en\":\"...\",\"de\":\"...\",\"ro\":\"...\",\"cs\":\"...\",\"ru\":\"...\"},\"body\":{\"bg\":\"...\",\"en\":\"...\",\"de\":\"...\",\"ro\":\"...\",\"cs\":\"...\",\"ru\":\"...\"}}",
    ].join("\n"),
    input: JSON.stringify({
      source_language: input.sourceLanguage,
      title,
      body,
    }),
  });

  const output = String(response.output_text || "").trim();
  if (!output) throw new Error("guest_communications_translation_empty");
  return parseTranslation(output, input.sourceLanguage, title, body);
}
