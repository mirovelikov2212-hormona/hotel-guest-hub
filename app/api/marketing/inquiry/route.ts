import { NextRequest, NextResponse } from "next/server";
import {
  createInquiryThrottle,
  deliverMarketingInquiry,
  isContactEmail,
  validateMarketingInquiry,
} from "@/lib/marketing-inquiry";
import { sendSmtpTextEmail } from "@/lib/server/smtp-text-email";

export const runtime = "nodejs";
export const maxDuration = 30;
const consumeAddressAttempt = createInquiryThrottle(20);
const consumeEmailAttempt = createInquiryThrottle(3);

function recipient() {
  // Use the owner's existing SMTP mailbox until a dedicated sales mailbox is configured.
  return (process.env.MARKETING_INQUIRY_EMAIL_TO || process.env.SMTP_USER || "").trim();
}

function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    && isContactEmail(recipient()));
}

function response(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return response({ available: mailConfigured() });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return response({ ok: false, error: "invalid_origin" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return response({ ok: false, error: "invalid_content_type" }, 415);
  }
  if (Number(request.headers.get("content-length") || 0) > 12000) {
    return response({ ok: false, error: "too_large" }, 413);
  }

  let input: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 12000) {
      return response({ ok: false, error: "too_large" }, 413);
    }
    input = JSON.parse(body);
  } catch {
    return response({ ok: false, error: "invalid_fields" }, 400);
  }

  const validation = validateMarketingInquiry(input);
  if (!validation.ok) return response({ ok: false, error: validation.error }, 400);
  if (!mailConfigured()) return response({ ok: false, error: "unavailable" }, 503);

  const address = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  if (!consumeAddressAttempt(address) || !consumeEmailAttempt(validation.inquiry.email.toLowerCase())) {
    return response({ ok: false, error: "rate_limited" }, 429);
  }

  const result = await deliverMarketingInquiry(validation.inquiry, body => sendSmtpTextEmail({
    to: recipient(),
    subject: `GOSTAYA | Запитване от ${validation.inquiry.hotel}`,
    body,
    fromName: "GOSTAYA",
  }));
  return result.ok
    ? response({ ok: true })
    : response({ ok: false, error: "delivery_failed" }, 502);
}
