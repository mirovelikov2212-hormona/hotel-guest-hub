import OpenAI from "openai";
import type { AiHistoryTurn, AiHotelCatalog, AiLang, AiRouterResult } from "@/lib/ai/types";

let client: OpenAI | null = null;

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("openai_api_key_missing");
  }
  if (!client) {
    client = new OpenAI({ apiKey, timeout: 20000, maxRetries: 1 });
  }
  return client;
}

function compact(value: string, max = 360) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function parseResult(value: string): AiRouterResult | null {
  try {
    const parsed = JSON.parse(value) as Partial<AiRouterResult>;
    const status = String(parsed.status || "");
    if (!["answer", "clarify", "not_found", "out_of_scope"].includes(status)) return null;
    return {
      status: status as AiRouterResult["status"],
      selected_ids: Array.isArray(parsed.selected_ids)
        ? parsed.selected_ids.map(String).filter(Boolean).slice(0, 6)
        : [],
      intent: String(parsed.intent || "unknown"),
      clarification: String(parsed.clarification || "").trim(),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
    };
  } catch {
    return null;
  }
}

export async function routeWithOpenAi(args: {
  question: string;
  lang: AiLang;
  catalog: AiHotelCatalog;
  history: AiHistoryTurn[];
}) {
  const openai = getClient();
  const model = String(process.env.OPENAI_HOTEL_MODEL || "gpt-5-mini").trim();
  const validIds = new Set(args.catalog.records.map((record) => record.id));
  const records = args.catalog.records.map((record) => ({
    id: record.id,
    kind: record.kind,
    titles: record.titles,
    aliases: record.aliases,
    intent_tags: record.intentTags,
    current_summary: compact(record.summaries[args.lang] || ""),
    current_hours: compact(record.hoursByLang?.[args.lang] || ""),
    current_options: (record.optionsByLang?.[args.lang] || []).map((item) => compact(item, 160)).slice(0, 12),
    current_path: record.pathByLang[args.lang] || [],
    target_department: record.targetDepartment || "",
    request_type: record.requestType || "",
    price: record.price || "",
    has_link: record.urls.length > 0,
  }));

  const startedAt = Date.now();
  const response = await openai.responses.create({
    model,
    store: false,
    max_output_tokens: 900,
    reasoning: { effort: "low" },
    instructions: [
      "You are the semantic router for a private hotel concierge.",
      "Use only the supplied HOTEL_CATALOG. Never use external facts and never browse.",
      "The user may write in Bulgarian, English, German, Romanian, Czech or Russian, with spelling or grammatical variations.",
      "Use the whole question and the recent conversation history. Resolve short follow-up questions from that history.",
      "Select only exact record IDs from HOTEL_CATALOG that contain the confirmed answer.",
      "Important distinctions: free transfer is not the same as taxi; match schedule is not match broadcast; animation program is not football schedule; outside bar is not lobby bar; games room is not conference room; Wi-Fi password is not a Wi-Fi problem; coffee capsules are not a coffee machine problem.",
      "For one specific request select one record. Select multiple records only when the user clearly asks for all options or a comparison.",
      "If the question asks whether something is free, available, included, allowed, required, reservable, or offered, select a record only when its supplied facts actually confirm the answer.",
      "If the question is genuinely ambiguous, return clarify and ask one short clarification question in the user's language.",
      "If the catalog does not confirm the requested fact, return not_found even when a related service exists.",
      "If unrelated to the hotel or the guest's stay, return out_of_scope.",
      "Do not invent facts, paths, prices, opening hours, conditions or links.",
    ].join("\n"),
    input: JSON.stringify({
      hotel: args.catalog.hotelName,
      language: args.lang,
      history: args.history.slice(-6),
      question: args.question,
      HOTEL_CATALOG: records,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "stayhub_hotel_router",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["answer", "clarify", "not_found", "out_of_scope"] },
            selected_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
            intent: { type: "string" },
            clarification: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["status", "selected_ids", "intent", "clarification", "confidence"],
        },
      },
    },
  });

  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason || "unknown";
    throw new Error(`openai_response_incomplete:${reason}`);
  }

  const outputText = String(response.output_text || "").trim();
  if (!outputText) {
    throw new Error("openai_response_empty");
  }

  const parsed = parseResult(outputText);
  if (!parsed) {
    throw new Error("openai_response_invalid_json");
  }

  parsed.selected_ids = parsed.selected_ids.filter((id) => validIds.has(id));
  if (parsed.status === "answer" && parsed.selected_ids.length === 0) {
    parsed.status = "not_found";
  }

  return {
    result: parsed,
    model,
    latencyMs: Date.now() - startedAt,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  };
}
