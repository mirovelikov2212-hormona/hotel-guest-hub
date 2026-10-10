import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  createInquiryThrottle,
  deliverMarketingInquiry,
  validateMarketingInquiry,
} from "../../lib/marketing-inquiry.ts";

const valid = {
  name: "Hotel manager", hotel: "Example Hotel", email: "manager@example.com",
  message: "Please present the platform.", language: "bg", consent: true, website: "",
};

test("inquiries require contact details and explicit contact consent", () => {
  assert.equal(validateMarketingInquiry(valid).ok, true);
  for (const change of [{ consent: false }, { email: "not-an-email" }, { hotel: "" }, { name: "" }, { language: "invalid" }]) {
    assert.equal(validateMarketingInquiry({ ...valid, ...change }).ok, false);
  }
});

test("optional message, input limits, honeypot and header injection are handled", () => {
  assert.equal(validateMarketingInquiry({ ...valid, message: "" }).ok, true);
  for (const change of [{ website: "https://spam.example" }, { message: "x".repeat(2001) }, { hotel: "Hotel\r\nBcc: stranger@example.com" }]) {
    assert.equal(validateMarketingInquiry({ ...valid, ...change }).ok, false);
  }
});

test("delivery success waits for mail acceptance and errors never become success", async () => {
  const parsed = validateMarketingInquiry(valid);
  let body = "";
  assert.deepEqual(await deliverMarketingInquiry(parsed.inquiry, async value => { body = value; }), { ok: true });
  assert.match(body, /manager@example\.com/);
  assert.match(body, /Example Hotel/);
  assert.deepEqual(await deliverMarketingInquiry(parsed.inquiry, async () => { throw new Error("SMTP_UNAVAILABLE"); }), { ok: false });
});

test("repeated submissions are throttled and the window expires", () => {
  const throttle = createInquiryThrottle();
  assert.equal(throttle("visitor", 1000), true);
  assert.equal(throttle("visitor", 1000), true);
  assert.equal(throttle("visitor", 1000), true);
  assert.equal(throttle("visitor", 1000), false);
  assert.equal(throttle("other", 1000), true);
  assert.equal(throttle("visitor", 601000), true);
});

function loadRoute({ send = async () => {}, configured = true } = {}) {
  const code = ts.transpileModule(readFileSync(new URL("../../app/api/marketing/inquiry/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const context = {
    exports, Buffer, URL, process: { env: configured ? { SMTP_HOST: "smtp.example.com", SMTP_USER: "owner@example.com", SMTP_PASS: "test-only" } : {} },
    require: name => {
      if (name === "next/server") return { NextResponse: { json: (data, init) => Response.json(data, init) } };
      if (name === "@/lib/marketing-inquiry") return { createInquiryThrottle, deliverMarketingInquiry, isContactEmail: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), validateMarketingInquiry };
      if (name === "@/lib/server/smtp-text-email") return { sendSmtpTextEmail: send };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(code, context);
  return exports;
}

function request(body = valid, origin = "https://conference.example.com") {
  return new Request("https://conference.example.com/api/marketing/inquiry", {
    method: "POST", headers: { "Origin": origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("route rejects foreign origins and malformed input before sending mail", async () => {
  let sent = 0;
  const route = loadRoute({ send: async () => { sent += 1; } });
  assert.equal((await route.POST(request(valid, "https://foreign.example.com"))).status, 403);
  assert.equal((await route.POST(request({ ...valid, consent: false }))).status, 400);
  assert.equal((await route.POST(request({ ...valid, message: "x".repeat(13000) }))).status, 413);
  assert.equal(sent, 0);
});

test("route uses owner mailbox and returns success only on accepted email", async () => {
  let delivered;
  const route = loadRoute({ send: async input => { delivered = input; } });
  const response = await route.POST(request());
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(delivered.to, "owner@example.com");
  assert.match(delivered.body, /manager@example\.com/);
  const failed = loadRoute({ send: async () => { throw new Error("transport error"); } });
  assert.equal((await failed.POST(request())).status, 502);
  const unavailable = loadRoute({ configured: false });
  assert.equal((await unavailable.POST(request())).status, 503);
  assert.deepEqual(await unavailable.GET().json(), { available: false });
});
