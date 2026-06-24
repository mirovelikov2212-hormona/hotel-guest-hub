import "server-only";

import net from "node:net";
import tls from "node:tls";

type SmtpResponse = {
  code: number;
  lines: string[];
};

export type SendReportEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName?: string;
  headers?: Record<string, string>;
};

export type SendReportEmailResult = {
  providerMessageId: string | null;
};

const CRLF = "\r\n";

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function parsePort(value: string, fallback: number) {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

function parseBoolean(value: string, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function normalizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeaderValue(value: string) {
  const normalized = normalizeHeaderValue(value);
  if (/^[\x00-\x7F]*$/.test(normalized)) return normalized;
  return `=?UTF-8?B?${Buffer.from(normalized, "utf8").toString("base64")}?=`;
}

function stripAddressBrackets(value: string) {
  return value.replace(/^<|>$/g, "").trim();
}

function formatFromAddress(address: string, fromName: string) {
  return `${encodeHeaderValue(fromName || "StayHub Reports")} <${stripAddressBrackets(address)}>`;
}

function dotStuffData(value: string) {
  return value
    .replace(/\r?\n/g, CRLF)
    .split(CRLF)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join(CRLF);
}

function safeBoundary() {
  return `stayhub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function buildEmailMessage(input: SendReportEmailInput, from: string) {
  const boundary = safeBoundary();
  const headers = input.headers || {};
  const reportHeaderValue = String(headers["X-StayHub-Report"] || headers["x-stayhub-report"] || "weekly");
  const extraHeaders = Object.entries(headers)
    .filter(([key]) => /^[A-Za-z0-9-]+$/.test(key) && key.toLowerCase() !== "x-stayhub-report")
    .map(([key, value]) => `${key}: ${normalizeHeaderValue(String(value))}`);

  return [
    `From: ${formatFromAddress(from, input.fromName || readEnv("REPORTING_EMAIL_FROM_NAME") || "StayHub Reports")}`,
    `To: ${stripAddressBrackets(input.to)}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `X-StayHub-Report: ${normalizeHeaderValue(reportHeaderValue)}`,
    ...extraHeaders,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    "",
    `--${boundary}--`,
    "",
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

export function getWeeklyReportRecipient() {
  return readEnv("REPORTING_WEEKLY_EMAIL_TO") || readEnv("MONITORING_ALERT_EMAIL_TO");
}

export async function sendReportEmailViaSmtp(input: SendReportEmailInput): Promise<SendReportEmailResult> {
  const host = readEnv("SMTP_HOST");
  const port = parsePort(readEnv("SMTP_PORT"), 465);
  const secure = parseBoolean(readEnv("SMTP_SECURE"), port === 465);
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  const from = readEnv("REPORTING_EMAIL_FROM") || readEnv("MONITORING_ALERT_EMAIL_FROM") || user;

  if (!host || !user || !pass || !from || !input.to) {
    throw new Error("Report email is not configured. Missing SMTP or reporting recipient env variables.");
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
    await sendCommand(socket, `RCPT TO:<${stripAddressBrackets(input.to)}>`, [250, 251], "RCPT TO");
    await sendCommand(socket, "DATA", [354], "DATA");

    socket.write(`${dotStuffData(buildEmailMessage(input, from))}${CRLF}.${CRLF}`);
    await expectSmtpCode(readSmtpResponse(socket), [250], "message body");
    await sendCommand(socket, "QUIT", [221], "QUIT").catch(() => undefined);

    return { providerMessageId: null };
  } finally {
    socket.end();
    socket.destroy();
  }
}
