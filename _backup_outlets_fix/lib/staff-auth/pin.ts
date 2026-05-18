import "server-only";
import crypto from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

export function hashPin(pin: string): string {
  const normalized = normalizePin(pin);
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(normalized, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const normalized = normalizePin(pin);

  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, nStr, rStr, pStr, salt, expectedHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  const derived = crypto.scryptSync(normalized, salt, KEYLEN, {
    N,
    r,
    p,
  });

  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== derived.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, derived);
}

function normalizePin(pin: string): string {
  return String(pin).trim();
}