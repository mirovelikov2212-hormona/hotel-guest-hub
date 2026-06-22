import "server-only";

import net from "node:net";
import tls from "node:tls";

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { SystemEventSource, SystemEventSeverity } from "@/lib/server/system-events";

type CriticalAlertInput = {
  eventId?: string | null;
  createdAt?: string | null;
  hotelId?: string | null;
  severity: SystemEventSeverity;
  source: SystemEventSource;
  eventType: string;
  message: string;
  roomNumber?: string | null;
  departmentId?: string | null;
  requestId?: string | null;
  surveyId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type SmtpResponse = {
  code: number;
  lines: string[];
};

const DEFAULT_ALERT_COOLDOWN_MINUTES = 10;
const MAX_METADATA_EMAIL_CHARS = 4000;
const CRLF = "\r\n";
const inMemoryAlertCooldowns = new Map<string, number>();

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function isEnabled() {
  return readEnv("MONITORING_ALERTS_ENABLED").toLowerCase() === "true";
}

function parsePort(value: string, fallback: number) {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

function parseBoolean(value: string, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function parseCooldownMs() {
  const minutes = Number(readEnv("MONITORING_ALERT_COOLDOWN_MINUTES"));
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ALERT_COOLDOWN_MINUTES;
  return safeMinutes * 60 * 1000;
}

function formatDate(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeSubject(value: string) {
  const normalized = normalizeHeaderValue(value);
  if (/^[\x00-\x7F]*$/.test(normalized)) return normalized;
  return `=?UTF-8?B?${Buffer.from(normalized, "utf8").toString("base64")}?=`;
}

function stripAddressBrackets(value: string) {
  return value.replace(/^<|>$/g, "").trim();
}

function formatFromAddress(address: string) {
  const name = normalizeHeaderValue(readEnv("MONITORING_ALERT_EMAIL_FROM_NAME") || "StayHub Alerts");
  return `${encodeSubject(name)} <${stripAddressBrackets(address)}>`;
}

function buildAlertKey(input: CriticalAlertInput) {
  return [
    input.hotelId || "global",
    input.source || "unknown-source",
    input.eventType || "unknown-event",
    input.roomNumber || "no-room",
    input.departmentId || "no-department",
  ].join("|");
}

function shouldSkipByMemoryCooldown(key: string) {
  const now = Date.now();
  const cooldownMs = parseCooldownMs();
  const previous = inMemoryAlertCooldowns.get(key);

  if (previous && now - previous < cooldownMs) return true;

  inMemoryAlertCooldowns.set(key, now);
  return false;
}

async function shouldSkipByDatabaseCooldown(input: CriticalAlertInput) {
  if (!input.eventId) return false;

  const since = new Date(Date.now() - parseCooldownMs()).toISOString();
  let query = supabaseAdmin
    .from("system_events")
    .select("id", { count: "exact", head: true })
    .eq("severity", "critical")
    .eq("source", input.source)
    .eq("event_type", input.eventType)
    .gte("created_at", since);

  query = input.hotelId ? query.eq("hotel_id", input.hotelId) : query.is("hotel_id", null);
  query = input.roomNumber ? query.eq("room_number", input.roomNumber) : query.is("room_number", null);
  query = input.departmentId ? query.eq("department_id", input.departmentId) : query.is("department_id", null);

  const { count, error } = await query;
  if (error) {
    console.error("critical alert cooldown lookup failed", { eventType: input.eventType, error });
    return false;
  }

  return Number(count || 0) > 1;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...[truncated]`;
}

function formatMetadata(metadata?: Record<string, unknown> | null) {
  if (!metadata || !Object.keys(metadata).length) return "{}";

  try {
    return truncate(JSON.stringify(metadata, null, 2), MAX_METADATA_EMAIL_CHARS);
  } catch {
    return "{\"error\":\"metadata could not be serialized\"}";
  }
}

function buildSubject(input: CriticalAlertInput) {
  const hotel = input.hotelId ? input.hotelId.slice(0, 8) : "global";
  return `CRITICAL StayHub Alert — ${hotel} — ${input.eventType}`;
}

function buildTextBody(input: CriticalAlertInput) {
  return [
    "CRITICAL StayHub system alert",
    "",
    "A critical event was logged. This should mean a real system/code flow is broken and needs investigation.",
    "",
    `Event ID: ${input.eventId || "not saved"}`,
    `Created at: ${formatDate(input.createdAt)}`,
    `Hotel ID: ${input.hotelId || "n/a"}`,
    `Severity: ${input.severity}`,
    `Source: ${input.source}`,
    `Event type: ${input.eventType}`,
    `Room: ${input.roomNumber || "n/a"}`,
    `Department: ${input.departmentId || "n/a"}`,
    `Request ID: ${input.requestId || "n/a"}`,
    `Survey ID: ${input.surveyId || "n/a"}`,
    "",
    "Message:",
    input.message || "n/a",
    "",
    "Metadata:",
    formatMetadata(input.metadata),
    "",
    "Recommended first checks:",
    "1. Check Vercel deployment/runtime logs around the event time.",
    "2. Check Supabase public.system_events for this event ID/type.",
    "3. Check the related route/source before changing production code.",
    "",
    "This email is sent only for severity=critical. Warnings and validation issues remain only in Supabase.",
  ].join("\n");
}

function dotStuffData(value: string) {
  return value
    .replace(/\r?\n/g, CRLF)
    .split(CRLF)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join(CRLF);
}

function buildEmailMessage(input: CriticalAlertInput, from: string, to: string) {
  const subject = buildSubject(input);
  const body = buildTextBody(input);

  return [
    `From: ${formatFromAddress(from)}`,
    `To: ${stripAddressBrackets(to)}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "X-StayHub-Alert: critical",
    "",
    body,
  ].join(CRLF);
}

function waitForSocketConnect(socket: net.Socket | tls.TLSSocket, secure: boolean) {
  return new Promise<void>((resolve, reject) => {
    const successEvent = secure ? "secureConnect" : "connect";

    const cleanup = () => {
      socket.off(successEvent, onConnect);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new Error("SMTP connection timed out."));
    };

    socket.once(successEvent, onConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

function readSmtpResponse(socket: net.Socket | tls.TLSSocket) {
  return new Promise<SmtpResponse>((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
      socket.off("end", onEnd);
    };

    const parseResponse = () => {
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";
      const match = lastLine.match(/^(\d{3})\s/);
      if (!match) return null;
      return { code: Number(match[1]), lines };
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const response = parseResponse();
      if (!response) return;
      cleanup();
      resolve(response);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new Error("SMTP response timed out."));
    };

    const onEnd = () => {
      cleanup();
      reject(new Error("SMTP connection ended unexpectedly."));
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.once("end", onEnd);
  });
}

async function expectSmtpCode(responsePromise: Promise<SmtpResponse>, allowedCodes: number[], context: string) {
  const response = await responsePromise;
  if (!allowedCodes.includes(response.code)) {
    throw new Error(`SMTP ${context} failed: ${response.lines.join(" | ")}`);
  }
  return response;
}

async function sendCommand(socket: net.Socket | tls.TLSSocket, command: string, allowedCodes: number[], context: string) {
  socket.write(`${command}${CRLF}`);
  return expectSmtpCode(readSmtpResponse(socket), allowedCodes, context);
}

async function sendCriticalEmailViaSmtp(input: CriticalAlertInput) {
  const host = readEnv("SMTP_HOST");
  const port = parsePort(readEnv("SMTP_PORT"), 465);
  const secure = parseBoolean(readEnv("SMTP_SECURE"), port === 465);
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  const from = readEnv("MONITORING_ALERT_EMAIL_FROM") || user;
  const to = readEnv("MONITORING_ALERT_EMAIL_TO");

  if (!host || !user || !pass || !from || !to) {
    throw new Error("Critical alert email is not configured. Missing SMTP/MONITORING env variables.");
  }

  const socket = secure
    ? tls.connect({ host, port, servername: host, timeout: 15000 })
    : net.connect({ host, port, timeout: 15000 });

  try {
    await waitForSocketConnect(socket, secure);
    await expectSmtpCode(readSmtpResponse(socket), [220], "greeting");

    await sendCommand(socket, `EHLO ${readEnv("SMTP_EHLO_NAME") || "stayhub.app"}`, [250], "EHLO");
    await sendCommand(socket, "AUTH LOGIN", [334], "AUTH LOGIN");
    await sendCommand(socket, Buffer.from(user, "utf8").toString("base64"), [334], "SMTP username");
    await sendCommand(socket, Buffer.from(pass, "utf8").toString("base64"), [235], "SMTP password");
    await sendCommand(socket, `MAIL FROM:<${stripAddressBrackets(from)}>`, [250], "MAIL FROM");
    await sendCommand(socket, `RCPT TO:<${stripAddressBrackets(to)}>`, [250, 251], "RCPT TO");
    await sendCommand(socket, "DATA", [354], "DATA");

    socket.write(`${dotStuffData(buildEmailMessage(input, from, to))}${CRLF}.${CRLF}`);
    await expectSmtpCode(readSmtpResponse(socket), [250], "message body");
    await sendCommand(socket, "QUIT", [221], "QUIT").catch(() => undefined);
  } finally {
    socket.end();
    socket.destroy();
  }
}

export async function sendCriticalSystemEventAlert(input: CriticalAlertInput) {
  if (!isEnabled()) return;
  if (input.severity !== "critical") return;

  const key = buildAlertKey(input);
  if (shouldSkipByMemoryCooldown(key)) return;

  if (await shouldSkipByDatabaseCooldown(input)) return;

  try {
    await sendCriticalEmailViaSmtp(input);
  } catch (error) {
    console.error("critical system event email alert failed", {
      eventType: input.eventType,
      source: input.source,
      error,
    });
  }
}
