import type { LangKey } from "@/lib/types";

export const AI_LANGS = ["bg", "en", "de", "ro", "cs", "ru"] as const;
export type AiLang = (typeof AI_LANGS)[number];

export type AiRecordKind = "service" | "venue" | "info" | "hotel";

export type LocalizedText = Partial<Record<AiLang, string>>;
export type LocalizedList = Partial<Record<AiLang, string[]>>;

export type AiCatalogRecord = {
  id: string;
  kind: AiRecordKind;
  active: boolean;
  aiVisible: boolean;
  titles: LocalizedText;
  summaries: LocalizedText;
  aliases: LocalizedList;
  intentTags: string[];
  pathByLang: Partial<Record<AiLang, string[]>>;
  urls: string[];
  targetDepartment?: string;
  requestType?: string;
  requestKind?: string;
  requiresBilling?: boolean;
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

export type AiRouterResult = {
  status: AiRouterStatus;
  selected_ids: string[];
  intent: string;
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
  confidence?: number;
  routerError?: string;
};

export function normalizeAiLang(value: LangKey | string | undefined): AiLang {
  const normalized = String(value || "en").trim().toLowerCase();
  if (normalized === "cz") return "cs";
  return (AI_LANGS as readonly string[]).includes(normalized)
    ? (normalized as AiLang)
    : "en";
}
