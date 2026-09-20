import "server-only";

import crypto from "node:crypto";

import { canonicalizeHotelIntakeUrl } from "@/lib/server/hotel-scanner-v2-site-map.mjs";

type InventoryAuthorityEnvelope = {
  version: "scanner-v3-authority-token-1";
  actorAdminId: string;
  requestedUrl: string;
  issuedAt: number;
  expiresAt: number;
  authority: Record<string, unknown>;
};

const TOKEN_TTL_MS = 15 * 60 * 1000;

function secret() {
  const value = String(process.env.STAFF_SESSION_SECRET || "").trim();
  if (!value) throw new Error("Missing STAFF_SESSION_SECRET");
  return value;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createHotelInventoryAuthorityTokenV3(input: {
  actorAdminId: string;
  requestedUrl: string;
  authority: Record<string, unknown>;
}) {
  const now = Date.now();
  const envelope: InventoryAuthorityEnvelope = {
    version: "scanner-v3-authority-token-1",
    actorAdminId: String(input.actorAdminId || "").trim(),
    requestedUrl: canonicalizeHotelIntakeUrl(input.requestedUrl || ""),
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
    authority: input.authority,
  };
  const payload = encodeJson(envelope);
  return `${payload}.${sign(payload)}`;
}

export function verifyHotelInventoryAuthorityTokenV3(input: {
  actorAdminId: string;
  requestedUrl: string;
  token: string;
}) {
  const token = String(input.token || "").trim();
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length) return null;
  const expected = sign(payload);
  if (!safeEqual(expected, signature)) return null;

  let envelope: InventoryAuthorityEnvelope;
  try {
    envelope = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as InventoryAuthorityEnvelope;
  } catch {
    return null;
  }

  if (envelope.version !== "scanner-v3-authority-token-1") return null;
  if (envelope.actorAdminId !== String(input.actorAdminId || "").trim()) return null;
  if (envelope.expiresAt < Date.now() || envelope.issuedAt > Date.now() + 30_000) return null;

  const expectedUrl = canonicalizeHotelIntakeUrl(input.requestedUrl || "");
  if (!expectedUrl || envelope.requestedUrl !== expectedUrl) return null;
  if (!envelope.authority || typeof envelope.authority !== "object") return null;

  return envelope.authority;
}
