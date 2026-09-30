import "server-only";

import net from "node:net";
import tls from "node:tls";

type SmtpResponse = {
  code: number;
  lines: string[];
};

type SmtpTextEmailInput = {
  to: string;
  subject: string;
  body: string;
  fromAddress?: string | null;
  fromName?: string | null;
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

function stripAddressBrackets(value: string) {
  return value.replace(/^<|>$/g, "").trim();
}

function encodeSubject(value: string) {
  const normalized = normalizeHeaderValue(value);
  if (/^[\x00-\x7F]*$/.test(normalized)) return normalized;
  return `=?UTF-8?B?${Buffer.from(normalized, "utf8").toString("base64")}?=`;
}

function formatFromAddress(address: string, name: string) {
  return `${encodeSubject(normalizeHeaderValue(name))} <${stripAddressBrackets(address)}>`;
}

function dotStuffData(value: string) {
  return value
    .replace(/\r?\n/g, CRLF)
    .split(CRLF)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join(CRLF);
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
      reject(new Error("SMTP_CONNECTION_TIMEOUT"));
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
      return match ? { code: Number(match[1]), lines } : null;
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
      reject(new Error("SMTP_RESPONSE_TIMEOUT"));
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("SMTP_CONNECTION_ENDED"));
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.once("end", onEnd);
  });
}

async function expectCode(
  responsePromise: Promise<SmtpResponse>,
  allowedCodes: number[],
  context: string,
) {
  const response = await responsePromise;
  if (!allowedCodes.includes(response.code)) {
    throw new Error(`SMTP_${context.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FAILED:${response.code}`);
  }
  return response;
}

async function command(
  socket: net.Socket | tls.TLSSocket,
  value: string,
  allowedCodes: number[],
  context: string,
) {
  socket.write(`${value}${CRLF}`);
  return expectCode(readSmtpResponse(socket), allowedCodes, context);
}

export async function sendSmtpTextEmail(input: SmtpTextEmailInput) {
  const host = readEnv("SMTP_HOST");
  const port = parsePort(readEnv("SMTP_PORT"), 465);
  const secure = parseBoolean(readEnv("SMTP_SECURE"), port === 465);
  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  const from =
    String(input.fromAddress || "").trim()
    || readEnv("CONTROL_PLANE_EMAIL_FROM")
    || readEnv("MONITORING_ALERT_EMAIL_FROM")
    || user;
  const fromName =
    String(input.fromName || "").trim()
    || readEnv("CONTROL_PLANE_EMAIL_FROM_NAME")
    || "GOSTAYA Security";
  const to = stripAddressBrackets(String(input.to || ""));

  if (!host || !user || !pass || !from || !to) {
    throw new Error("SMTP_EMAIL_NOT_CONFIGURED");
  }

  const message = [
    `From: ${formatFromAddress(from, fromName)}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "X-GOSTAYA-Security: control-plane-password-reset",
    "",
    input.body,
  ].join(CRLF);

  const socket = secure
    ? tls.connect({ host, port, servername: host, timeout: 15000 })
    : net.connect({ host, port, timeout: 15000 });

  try {
    await waitForSocketConnect(socket, secure);
    await expectCode(readSmtpResponse(socket), [220], "greeting");
    await command(socket, `EHLO ${readEnv("SMTP_EHLO_NAME") || "gostaya.com"}`, [250], "ehlo");
    await command(socket, "AUTH LOGIN", [334], "auth_login");
    await command(socket, Buffer.from(user, "utf8").toString("base64"), [334], "username");
    await command(socket, Buffer.from(pass, "utf8").toString("base64"), [235], "password");
    await command(socket, `MAIL FROM:<${stripAddressBrackets(from)}>`, [250], "mail_from");
    await command(socket, `RCPT TO:<${to}>`, [250, 251], "rcpt_to");
    await command(socket, "DATA", [354], "data");
    socket.write(`${dotStuffData(message)}${CRLF}.${CRLF}`);
    await expectCode(readSmtpResponse(socket), [250], "message");
    await command(socket, "QUIT", [221], "quit").catch(() => undefined);
  } finally {
    socket.end();
    socket.destroy();
  }
}
