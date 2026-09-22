import { NextRequest, NextResponse } from "next/server";

import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";
import {
  finalizeStaffStandardSourceDocumentUpload,
  listStaffStandardSourceDocuments,
  prepareStaffStandardSourceDocumentUpload,
} from "@/lib/server/staff-standard-authoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /^[A-Z0-9_]+(?::[A-Z0-9_,.-]+)?$/.test(message)
    ? message
    : "STAFF_STANDARD_SOURCE_DOCUMENT_FAILED";
}

function status(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("WRITES_DISABLED")) return 503;
  if (message.includes("IDENTITY_REQUIRED")) return 401;
  if (
    message.includes("MANAGER_REQUIRED")
    || message.includes("SCOPE_FORBIDDEN")
  ) return 403;
  if (message.includes("NOT_FOUND")) return 404;
  return 400;
}

export async function GET(req: NextRequest) {
  const hotelSlug = String(
    req.nextUrl.searchParams.get("hotelSlug") || "",
  ).trim().toLowerCase();
  const authoringId = String(
    req.nextUrl.searchParams.get("authoringId") || "",
  ).trim().toLowerCase();

  try {
    const documents = await listStaffStandardSourceDocuments({
      hotelSlug,
      authoringId,
    });
    return NextResponse.json(
      { ok: true, documents },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: status(error), headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "STAFF_STANDARD_SOURCE_DOCUMENT_BODY_REQUIRED" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const action = String(body.action || "").trim().toLowerCase();
    const hotelSlug = body.hotelSlug;

    if (action === "prepare") {
      const upload = await prepareStaffStandardSourceDocumentUpload({
        hotelSlug,
        authoringId: body.authoringId,
        originalName: body.originalName,
        mimeType: body.mimeType,
        fileSize: body.fileSize,
      });
      return NextResponse.json({ ok: true, upload }, { headers: NO_STORE_HEADERS });
    }

    if (action === "finalize") {
      const document = await finalizeStaffStandardSourceDocumentUpload({
        hotelSlug,
        authoringId: body.authoringId,
        documentId: body.documentId,
        storagePath: body.storagePath,
        originalName: body.originalName,
        mimeType: body.mimeType,
        fileSize: body.fileSize,
      });
      return NextResponse.json(
        { ok: true, document },
        { headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: false, error: "STAFF_STANDARD_SOURCE_DOCUMENT_ACTION_INVALID" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("staff standard source document action failed", error);
    return NextResponse.json(
      { ok: false, error: safeError(error) },
      { status: status(error), headers: NO_STORE_HEADERS },
    );
  }
}
