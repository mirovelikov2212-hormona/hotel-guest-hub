import "server-only";

import crypto from "crypto";

import { normalizeCanonicalHotelSourceUrl } from "@/lib/product-factory/hub-design-draft";

export function buildHubDesignSourceKey(canonicalUrl: string) {
  const normalized = normalizeCanonicalHotelSourceUrl(canonicalUrl);
  return crypto.createHash("sha256").update("stayhub:hub-design-source:v1:" + normalized).digest("hex");
}
