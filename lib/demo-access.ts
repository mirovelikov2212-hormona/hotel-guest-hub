import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const DEMO_ACCESS_COOKIE_NAME = "stayhub_demo_access";

const DEMO_ACCESS_TOKEN_PURPOSE = "stayhub-demo-access-v1";

function getDemoAccessPin() {
  return String(process.env.DEMO_ACCESS_PIN ?? "").trim();
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function createDemoAccessToken(pin: string) {
  return createHmac("sha256", pin)
    .update(DEMO_ACCESS_TOKEN_PURPOSE)
    .digest("hex");
}

export function isDemoAccessConfigured() {
  return getDemoAccessPin().length > 0;
}

export function validateDemoAccessPin(inputPin: unknown) {
  const configuredPin = getDemoAccessPin();
  const submittedPin = String(inputPin ?? "").trim();

  if (!configuredPin || !submittedPin) return false;

  return safeEqual(submittedPin, configuredPin);
}

export function getDemoAccessCookieValue() {
  const configuredPin = getDemoAccessPin();

  if (!configuredPin) return "";

  return createDemoAccessToken(configuredPin);
}

export function hasValidDemoAccessCookie(cookieValue: unknown) {
  const expectedValue = getDemoAccessCookieValue();
  const receivedValue = String(cookieValue ?? "").trim();

  if (!expectedValue || !receivedValue) return false;

  return safeEqual(receivedValue, expectedValue);
}
