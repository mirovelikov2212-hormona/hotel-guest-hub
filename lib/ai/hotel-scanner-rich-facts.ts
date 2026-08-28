import OpenAI from "openai";

import type { HotelScanEvidenceBundle } from "@/lib/server/factory-hotel-scanner";
import type { HotelScanFact } from "@/lib/ai/hotel-scanner";

let client: OpenAI | null = null;

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  if (!client) client = new OpenAI({ apiKey, timeout: 18_000, maxRetries: 0 });
  return client;
}

function clean(value: unknown, max = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function parseFacts(value: string, allowed: Set<string>): HotelScanFact[] {
  const parsed = JSON.parse(value) as { facts?: HotelScanFact[] };
  if (!parsed || !Array.isArray(parsed.facts)) return [];

  const seen = new Set<string>();
  const result: HotelScanFact[] = [];
  for (const raw of parsed.facts) {
    const category = clean(raw?.category, 80) || "hotel";
    const label = clean(raw?.label, 120);
    const factValue = clean(raw?.value, 500);
    const sourceUrls = [...new Set((Array.isArray(raw?.sourceUrls) ? raw.sourceUrls : [])
      .map((url) => String(url))
      .filter((url) => allowed.has(url)))].slice(0, 4);
    if (!label || !factValue || !sourceUrls.length) continue;
    const key = `${category.toLowerCase()}|${label.toLowerCase()}|${factValue.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      category,
      label,
      value: factValue,
      confidence: Math.max(0, Math.min(1, Number(raw?.confidence || 0))),
      sourceUrls,
    });
    if (result.length >= 28) break;
  }
  return result;
}

export async function extractRichHotelScanFactsWithOpenAi(evidence: HotelScanEvidenceBundle) {
  const openai = getClient();
  const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
  const allowedSourceUrls = evidence.pages.map((page) => page.url);
  const allowed = new Set(allowedSourceUrls);
  const inputPages = evidence.pages.map((page) => ({
    url: page.url,
    title: page.title,
    description: page.description,
    text: page.text.slice(0, 5_500),
  }));

  const response = await openai.responses.create({
    model,
    store: false,
    max_output_tokens: 2_200,
    reasoning: { effort: "none" },
    instructions: [
      "Extract a rich but precise set of evidence-backed hotel facts for a human review dashboard.",
      "Use ONLY WEBSITE_EVIDENCE. Never browse, infer from outside knowledge, or guess.",
      "Aim for 18-28 DISTINCT useful facts when the evidence supports them; return fewer only when evidence is genuinely sparse.",
      "Prefer specific operational and guest-useful facts over generic marketing language.",
      "Cover distinct categories when supported: identity, location, contact, operations, accommodation, dining, amenities, wellness, events, policies, sustainability, family, beach, parking, services.",
      "Split compound information into useful facts: e.g. restaurant hours and capacity should be separate facts when both are stated.",
      "Do not duplicate the same claim under different labels.",
      "Every fact MUST cite one or more exact URLs from ALLOWED_SOURCE_URLS.",
      "Confidence should reflect evidence clarity; use high confidence only for explicit statements.",
      "Keep labels and values concise; paraphrase instead of copying long website text.",
      "Return JSON only via the requested schema.",
    ].join("\n"),
    input: JSON.stringify({ ALLOWED_SOURCE_URLS: allowedSourceUrls, WEBSITE_EVIDENCE: inputPages }),
    text: {
      format: {
        type: "json_schema",
        name: "stayhub_hotel_scan_rich_facts",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            facts: {
              type: "array",
              minItems: 1,
              maxItems: 28,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  category: { type: "string" },
                  label: { type: "string" },
                  value: { type: "string" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  sourceUrls: {
                    type: "array",
                    items: { type: "string", enum: allowedSourceUrls },
                    minItems: 1,
                    maxItems: 4,
                  },
                },
                required: ["category", "label", "value", "confidence", "sourceUrls"],
              },
            },
          },
          required: ["facts"],
        },
      },
    },
  });

  if (response.status === "incomplete") return [];
  const outputText = String(response.output_text || "").trim();
  if (!outputText) return [];
  return parseFacts(outputText, allowed);
}
