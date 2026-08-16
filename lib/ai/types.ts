import type { LangKey } from "@/lib/types";
import { canonicalizeLocaleTag } from "@/lib/i18n/locale-model.mjs";

export type AiLang = string;

export type AiRecordKind = "service" | "venue" | "info" | "hotel";

export type LocalizedText = Partial<Record<string, string>>;
export type LocalizedList = Partial<Record<string, string[]>>;

export type AiCatalogRecord = {
  id: string;
  kind: AiRecordKind;
  active: boolean;
  aiVisible: boolean;
  titles: LocalizedText;
  summaries: LocalizedText;
  aliases: LocalizedList;
  intentTags: string[];
  pathByLang: Partial<Record<string, string[]>>;
  urls: string[];
  targetDepartment?: string;
  requestType?: string;
  requestKind?: string;
  requiresBilling?: boolean;
  requiresReservation?: boolean;
  reservationType?: string;
  price?: string;
  currency?: string;
  hoursByLang?: LocalizedText;
  optionsByLang?: LocalizedList;
  sourceRef?: string;
};

export type AiHotelCatalog = {
  hotelId?: string;
  hotelSlug: string;
  hotelName: string;
  languages: AiLang[];
  records: AiCatalogRecord[];
  builtAt: number;
};

export type AiHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AiRouterStatus = "answer" | "clarify" | "not_found" | "out_of_scope";

export const AI_ANSWER_FIELDS = [
  "summary",
  "price",
  "hours",
  "reservation",
  "location",
  "options",
  "availability",
  "request",
  "links",
] as const;
export type AiAnswerField = (typeof AI_ANSWER_FIELDS)[number];

export type AiRouterResult = {
  status: AiRouterStatus;
  selected_ids: string[];
  intent: string;
  requested_fields: AiAnswerField[];
  clarification: string;
  confidence: number;
};

export type AiDiagnostics = {
  engine: "openai" | "deterministic" | "fallback";
  model?: string;
  fallbackUsed: boolean;
  matchedIds: string[];
  catalogCount: number;
  cacheHit: boolean;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  intent?: string;
  requestedFields?: AiAnswerField[];
  confidence?: number;
  routerError?: string;
};

export function normalizeAiLang(value: LangKey | string | undefined): AiLang {
  const raw = String(value || "").trim();
  if (raw.toLowerCase() === "cz") return "cs";
  return canonicalizeLocaleTag(raw) || "en";
}
