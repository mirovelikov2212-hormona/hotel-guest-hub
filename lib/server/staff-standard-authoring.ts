import "server-only";

import crypto from "crypto";

import {
  requireStaffDevelopmentIdentity,
} from "@/lib/server/staff-development-identity";
import {
  assertStaffDevelopmentWriteEnabled,
} from "@/lib/server/staff-development-persistence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  deriveStaffTrainingPlan,
  normalizeHotelStaffStandard,
} from "@/lib/staff-development/hotel-standard-model.mjs";

const SOURCE_BUCKET = "staff-development-sources";
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_TEXT_LENGTH = 200_000;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,119}$/;
const DEPARTMENT_RE = /^[a-z][a-z0-9_-]{0,62}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MIME_EXTENSION = new Map([
  ["application/pdf", "pdf"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["text/plain", "txt"],
]);

type JsonObject = Record<string, unknown>;
type StandardScope = "hotel" | "department";

type DevelopmentIdentity = {
  hotelId: string;
  staffUserId: string;
  staffUserRole: string;
  operationalRole: string;
  departmentId: string | null;
};

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function uuid(value: unknown, code: string) {
  const id = clean(value).toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function standardKey(value: unknown) {
  const key = clean(value).toLowerCase();
  if (!KEY_RE.test(key)) throw new Error("STAFF_STANDARD_AUTHORING_KEY_INVALID");
  return key;
}

function normalizeStandardScope(value: unknown): StandardScope {
  const scope = clean(value).toLowerCase();
  if (scope !== "hotel" && scope !== "department") {
    throw new Error("STAFF_STANDARD_AUTHORING_SCOPE_INVALID");
  }
  return scope;
}

function normalizeDepartmentCodes(
  scope: StandardScope,
  value: unknown,
) {
  const raw = value === undefined || value === null ? [] : value;
  if (!Array.isArray(raw) || raw.length > 40) {
    throw new Error("STAFF_STANDARD_AUTHORING_DEPARTMENTS_INVALID");
  }

  const result = [...new Set(
    raw.map((entry) => clean(entry).toLowerCase()).filter(Boolean),
  )].sort();

  if (
    result.length !== raw.length
    || result.some((code) => !DEPARTMENT_RE.test(code))
  ) {
    throw new Error("STAFF_STANDARD_AUTHORING_DEPARTMENTS_INVALID");
  }

  if (scope === "hotel") {
    if (result.length !== 0) {
      throw new Error("STAFF_STANDARD_AUTHORING_HOTEL_SCOPE_DEPARTMENTS_FORBIDDEN");
    }
    return [];
  }

  if (result.length !== 1) {
    throw new Error("STAFF_STANDARD_AUTHORING_DEPARTMENT_SCOPE_REQUIRES_ONE_DEPARTMENT");
  }
  return result;
}

function normalizeSourceKind(value: unknown) {
  const kind = clean(value).toLowerCase();
  if (kind !== "manual" && kind !== "document") {
    throw new Error("STAFF_STANDARD_AUTHORING_SOURCE_KIND_INVALID");
  }
  return kind as "manual" | "document";
}

function normalizeSourceText(value: unknown) {
  if (value === undefined || value === null) return null;
  const sourceText = String(value).trim();
  if (!sourceText) return null;
  if (sourceText.length > MAX_SOURCE_TEXT_LENGTH) {
    throw new Error("STAFF_STANDARD_AUTHORING_SOURCE_TEXT_TOO_LONG");
  }
  return sourceText;
}

function normalizeDocumentDeclaration(input: {
  originalName: unknown;
  mimeType: unknown;
  fileSize: unknown;
}) {
  const originalName = clean(input.originalName);
  const mimeType = clean(input.mimeType).toLowerCase();
  const fileSize = Number(input.fileSize);
  const extension = MIME_EXTENSION.get(mimeType);

  if (
    !originalName
    || originalName.length > 240
    || !extension
    || !Number.isInteger(fileSize)
    || fileSize < 1
    || fileSize > MAX_DOCUMENT_BYTES
  ) {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_INVALID");
  }

  const declaredExtension = originalName.split(".").pop()?.toLowerCase() || "";
  if (declaredExtension !== extension) {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_EXTENSION_MISMATCH");
  }

  return { originalName, mimeType, fileSize, extension };
}

function validateDocumentBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") {
    const prefix = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    return prefix === "%PDF-";
  }

  if (
    mimeType
    === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (
      bytes.length < 4
      || bytes[0] !== 0x50
      || bytes[1] !== 0x4b
      || bytes[2] !== 0x03
      || bytes[3] !== 0x04
    ) {
      return false;
    }
    const searchable = Buffer.from(bytes).toString("latin1");
    return (
      searchable.includes("[Content_Types].xml")
      && searchable.includes("word/document.xml")
    );
  }

  if (mimeType === "text/plain") {
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return !decoded.includes("\u0000");
    } catch {
      return false;
    }
  }

  return false;
}

function sourceStoragePath(input: {
  hotelId: string;
  authoringId: string;
  documentId: string;
  extension: string;
}) {
  return [
    "hotel",
    input.hotelId,
    "staff-standards",
    input.authoringId,
    `${input.documentId}.${input.extension}`,
  ].join("/");
}

async function requireManagerIdentity(
  hotelSlug: unknown,
): Promise<DevelopmentIdentity> {
  const identity = await requireStaffDevelopmentIdentity(hotelSlug);
  if (
    identity.staffUserRole !== "department_manager"
    && identity.staffUserRole !== "hotel_manager"
  ) {
    throw new Error("STAFF_STANDARD_AUTHORING_MANAGER_REQUIRED");
  }
  return identity;
}

async function assertStandardScopeAuthority(
  identity: DevelopmentIdentity,
  standardScope: StandardScope,
  departmentCodes: string[],
) {
  if (standardScope === "hotel") {
    if (departmentCodes.length !== 0) {
      throw new Error("STAFF_STANDARD_AUTHORING_HOTEL_SCOPE_DEPARTMENTS_FORBIDDEN");
    }
    if (identity.staffUserRole !== "hotel_manager") {
      throw new Error("STAFF_STANDARD_AUTHORING_MANAGER_SCOPE_FORBIDDEN");
    }
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id,code,active")
    .eq("hotel_id", identity.hotelId)
    .eq("active", true)
    .in("code", departmentCodes);

  if (error) {
    throw new Error("STAFF_STANDARD_AUTHORING_DEPARTMENT_READ_FAILED");
  }

  const found = new Set(
    (data || []).map((row) => clean(row.code).toLowerCase()),
  );
  if (
    found.size !== departmentCodes.length
    || departmentCodes.some((code) => !found.has(code))
  ) {
    throw new Error("STAFF_STANDARD_AUTHORING_DEPARTMENT_NOT_FOUND");
  }

  if (
    identity.staffUserRole === "department_manager"
    && (
      departmentCodes.length !== 1
      || departmentCodes[0] !== identity.operationalRole
    )
  ) {
    throw new Error("STAFF_STANDARD_AUTHORING_MANAGER_SCOPE_FORBIDDEN");
  }
}

async function loadAuthoring(input: {
  identity: DevelopmentIdentity;
  authoringId: unknown;
  allowedStatuses?: string[];
}) {
  const authoringId = uuid(
    input.authoringId,
    "STAFF_STANDARD_AUTHORING_ID_INVALID",
  );

  let query = supabaseAdmin
    .from("hotel_staff_standard_authoring")
    .select(
      "id,hotel_id,source_kind,status,standard_key,standard_scope,department_codes,source_text,structured_proposal_json,proposal_hash,created_by_staff_user_id,approved_by_staff_user_id,published_standard_revision_id,created_at,updated_at,approved_at,published_at",
    )
    .eq("hotel_id", input.identity.hotelId)
    .eq("id", authoringId);

  if (input.allowedStatuses?.length) {
    query = query.in("status", input.allowedStatuses);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    throw new Error("STAFF_STANDARD_AUTHORING_NOT_FOUND");
  }

  const standardScope = normalizeStandardScope(data.standard_scope);
  const departments = normalizeDepartmentCodes(
    standardScope,
    Array.isArray(data.department_codes) ? data.department_codes : [],
  );

  await assertStandardScopeAuthority(
    input.identity,
    standardScope,
    departments,
  );

  return {
    ...data,
    id: String(data.id),
    hotel_id: String(data.hotel_id),
    standard_key: String(data.standard_key),
    standard_scope: standardScope,
    department_codes: departments,
  };
}

async function appendAuthoringEvent(input: {
  identity: DevelopmentIdentity;
  authoringId: string;
  eventType: string;
  payload?: JsonObject;
}) {
  const { error } = await supabaseAdmin
    .from("staff_standard_authoring_events")
    .insert({
      hotel_id: input.identity.hotelId,
      authoring_id: input.authoringId,
      event_type: input.eventType,
      actor_staff_user_id: input.identity.staffUserId,
      payload_json: input.payload || {},
    });

  if (error) {
    throw new Error("STAFF_STANDARD_AUTHORING_EVENT_PERSIST_FAILED");
  }
}

async function signedDocumentUrl(storagePath: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(SOURCE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_URL_FAILED");
  }
  return data.signedUrl;
}

export async function createStaffStandardAuthoringDraft(input: {
  hotelSlug: unknown;
  sourceKind: unknown;
  standardKey: unknown;
  standardScope: unknown;
  departmentCodes: unknown;
  sourceText?: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const sourceKind = normalizeSourceKind(input.sourceKind);
  const key = standardKey(input.standardKey);
  const standardScope = normalizeStandardScope(input.standardScope);
  const departmentCodes = normalizeDepartmentCodes(
    standardScope,
    input.departmentCodes,
  );
  const sourceText = normalizeSourceText(input.sourceText);

  await assertStandardScopeAuthority(
    identity,
    standardScope,
    departmentCodes,
  );

  if (sourceKind === "manual" && !sourceText) {
    throw new Error("STAFF_STANDARD_AUTHORING_MANUAL_SOURCE_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("hotel_staff_standard_authoring")
    .insert({
      hotel_id: identity.hotelId,
      source_kind: sourceKind,
      status: "draft",
      standard_key: key,
      standard_scope: standardScope,
      department_codes: departmentCodes,
      source_text: sourceText,
      created_by_staff_user_id: identity.staffUserId,
    })
    .select(
      "id,hotel_id,source_kind,status,standard_key,standard_scope,department_codes,source_text,created_at,updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(
      error?.message || "STAFF_STANDARD_AUTHORING_CREATE_FAILED",
    );
  }

  await appendAuthoringEvent({
    identity,
    authoringId: String(data.id),
    eventType: "draft_created",
    payload: {
      sourceKind,
      standardKey: key,
      standardScope,
      departmentCodes,
      sourceTextSha256: sourceText
        ? crypto.createHash("sha256").update(sourceText).digest("hex")
        : null,
    },
  });

  return data;
}

export async function updateStaffStandardAuthoringSourceText(input: {
  hotelSlug: unknown;
  authoringId: unknown;
  sourceText: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
    allowedStatuses: ["draft"],
  });
  const sourceText = normalizeSourceText(input.sourceText);
  if (!sourceText) {
    throw new Error("STAFF_STANDARD_AUTHORING_SOURCE_TEXT_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("hotel_staff_standard_authoring")
    .update({
      source_text: sourceText,
      updated_at: new Date().toISOString(),
    })
    .eq("hotel_id", identity.hotelId)
    .eq("id", authoring.id)
    .eq("status", "draft")
    .select(
      "id,hotel_id,status,source_kind,standard_key,department_codes,source_text,updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error("STAFF_STANDARD_AUTHORING_SOURCE_UPDATE_FAILED");
  }

  await appendAuthoringEvent({
    identity,
    authoringId: authoring.id,
    eventType: "source_text_updated",
    payload: {
      sourceTextSha256: crypto
        .createHash("sha256")
        .update(sourceText)
        .digest("hex"),
      sourceTextLength: sourceText.length,
    },
  });

  return data;
}

export async function saveStaffStandardAuthoringProposal(input: {
  hotelSlug: unknown;
  authoringId: unknown;
  proposal: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
    allowedStatuses: ["draft", "proposal_ready"],
  });

  if (!isRecord(input.proposal)) {
    throw new Error("STAFF_STANDARD_AUTHORING_PROPOSAL_INVALID");
  }

  const normalized = normalizeHotelStaffStandard({
    ...input.proposal,
    standardKey: authoring.standard_key,
    standardScope: authoring.standard_scope,
    departmentCodes: authoring.department_codes,
    revisionNo: 1,
    status: "draft",
  });

  const proposalHash = normalized.standardHash;

  const { data, error } = await supabaseAdmin
    .from("hotel_staff_standard_authoring")
    .update({
      structured_proposal_json: normalized,
      proposal_hash: proposalHash,
      status: "proposal_ready",
      approved_by_staff_user_id: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("hotel_id", identity.hotelId)
    .eq("id", authoring.id)
    .in("status", ["draft", "proposal_ready"])
    .select(
      "id,hotel_id,status,standard_key,standard_scope,department_codes,structured_proposal_json,proposal_hash,updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error("STAFF_STANDARD_AUTHORING_PROPOSAL_SAVE_FAILED");
  }

  await appendAuthoringEvent({
    identity,
    authoringId: authoring.id,
    eventType: "proposal_saved",
    payload: {
      proposalHash,
      blockCount: normalized.blocks.length,
      sourceMode: authoring.source_kind,
    },
  });

  return data;
}

export async function prepareStaffStandardSourceDocumentUpload(input: {
  hotelSlug: unknown;
  authoringId: unknown;
  originalName: unknown;
  mimeType: unknown;
  fileSize: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
    allowedStatuses: ["draft"],
  });

  if (authoring.source_kind !== "document") {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_AUTHORING_INVALID");
  }

  const declaration = normalizeDocumentDeclaration(input);
  const documentId = crypto.randomUUID();
  const storagePath = sourceStoragePath({
    hotelId: identity.hotelId,
    authoringId: authoring.id,
    documentId,
    extension: declaration.extension,
  });

  const { data, error } = await supabaseAdmin.storage
    .from(SOURCE_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error || !data?.signedUrl || !data.token) {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_UPLOAD_PREPARE_FAILED");
  }

  return {
    documentId,
    authoringId: authoring.id,
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
    ...declaration,
  };
}

export async function finalizeStaffStandardSourceDocumentUpload(input: {
  hotelSlug: unknown;
  authoringId: unknown;
  documentId: unknown;
  storagePath: unknown;
  originalName: unknown;
  mimeType: unknown;
  fileSize: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
    allowedStatuses: ["draft"],
  });

  if (authoring.source_kind !== "document") {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_AUTHORING_INVALID");
  }

  const documentId = uuid(
    input.documentId,
    "STAFF_STANDARD_SOURCE_DOCUMENT_ID_INVALID",
  );
  const declaration = normalizeDocumentDeclaration(input);
  const expectedPath = sourceStoragePath({
    hotelId: identity.hotelId,
    authoringId: authoring.id,
    documentId,
    extension: declaration.extension,
  });
  const storagePath = clean(input.storagePath);

  if (storagePath !== expectedPath) {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_PATH_INVALID");
  }

  const { data: blob, error: downloadError } = await supabaseAdmin.storage
    .from(SOURCE_BUCKET)
    .download(storagePath);

  if (downloadError || !blob) {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_DOWNLOAD_FAILED");
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (
    bytes.byteLength !== declaration.fileSize
    || !validateDocumentBytes(bytes, declaration.mimeType)
  ) {
    await supabaseAdmin.storage.from(SOURCE_BUCKET).remove([storagePath]);
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_CONTENT_INVALID");
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  const { data: documentRow, error } = await supabaseAdmin
    .from("staff_standard_source_documents")
    .insert({
      id: documentId,
      hotel_id: identity.hotelId,
      authoring_id: authoring.id,
      uploaded_by_staff_user_id: identity.staffUserId,
      original_name: declaration.originalName,
      storage_path: storagePath,
      mime_type: declaration.mimeType,
      file_size: declaration.fileSize,
      sha256,
    })
    .select(
      "id,hotel_id,authoring_id,original_name,storage_path,mime_type,file_size,sha256,created_at",
    )
    .single();

  if (error || !documentRow) {
    await supabaseAdmin.storage.from(SOURCE_BUCKET).remove([storagePath]);
    throw new Error(
      error?.message || "STAFF_STANDARD_SOURCE_DOCUMENT_REGISTER_FAILED",
    );
  }

  let importedText: string | null = null;
  if (
    declaration.mimeType === "text/plain"
    && bytes.byteLength <= MAX_SOURCE_TEXT_LENGTH
  ) {
    importedText = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .trim();

    if (importedText) {
      const { error: updateError } = await supabaseAdmin
        .from("hotel_staff_standard_authoring")
        .update({
          source_text: importedText,
          updated_at: new Date().toISOString(),
        })
        .eq("hotel_id", identity.hotelId)
        .eq("id", authoring.id)
        .eq("status", "draft");

      if (updateError) {
        throw new Error("STAFF_STANDARD_SOURCE_TEXT_IMPORT_FAILED");
      }
    }
  }

  await appendAuthoringEvent({
    identity,
    authoringId: authoring.id,
    eventType: "source_document_uploaded",
    payload: {
      documentId,
      originalName: declaration.originalName,
      mimeType: declaration.mimeType,
      fileSize: declaration.fileSize,
      sha256,
      textImported: Boolean(importedText),
    },
  });

  return {
    ...documentRow,
    previewUrl: await signedDocumentUrl(storagePath),
    textImported: Boolean(importedText),
  };
}

export async function listStaffStandardAuthoring(input: {
  hotelSlug: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);

  const { data, error } = await supabaseAdmin
    .from("hotel_staff_standard_authoring")
    .select(
      "id,hotel_id,source_kind,status,standard_key,standard_scope,department_codes,source_text,structured_proposal_json,proposal_hash,created_by_staff_user_id,approved_by_staff_user_id,published_standard_revision_id,created_at,updated_at,approved_at,published_at",
    )
    .eq("hotel_id", identity.hotelId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error("STAFF_STANDARD_AUTHORING_LIST_FAILED");

  const rows = (data || []).filter((row) => {
    if (identity.staffUserRole === "hotel_manager") return true;
    if (clean(row.standard_scope).toLowerCase() !== "department") {
      return false;
    }
    const departments = Array.isArray(row.department_codes)
      ? row.department_codes.map((value) => clean(value).toLowerCase())
      : [];
    return (
      departments.length === 1
      && departments[0] === identity.operationalRole
    );
  });

  return rows;
}

export async function listStaffStandardSourceDocuments(input: {
  hotelSlug: unknown;
  authoringId: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
  });

  const { data, error } = await supabaseAdmin
    .from("staff_standard_source_documents")
    .select(
      "id,hotel_id,authoring_id,original_name,storage_path,mime_type,file_size,sha256,created_at",
    )
    .eq("hotel_id", identity.hotelId)
    .eq("authoring_id", authoring.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("STAFF_STANDARD_SOURCE_DOCUMENT_LIST_FAILED");
  }

  return Promise.all(
    (data || []).map(async (row) => ({
      ...row,
      previewUrl: await signedDocumentUrl(String(row.storage_path)),
    })),
  );
}

export async function publishStaffStandardAuthoring(input: {
  hotelSlug: unknown;
  authoringId: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
    allowedStatuses: ["proposal_ready"],
  });

  if (
    !isRecord(authoring.structured_proposal_json)
    || !/^[a-f0-9]{64}$/.test(clean(authoring.proposal_hash))
  ) {
    throw new Error("STAFF_STANDARD_AUTHORING_NOT_READY");
  }

  const { data: latestRows, error: latestError } = await supabaseAdmin
    .from("hotel_staff_standard_revisions")
    .select("revision_no")
    .eq("hotel_id", identity.hotelId)
    .eq("standard_key", authoring.standard_key)
    .order("revision_no", { ascending: false })
    .limit(1);

  if (latestError) {
    throw new Error("STAFF_STANDARD_AUTHORING_REVISION_READ_FAILED");
  }

  const revisionNo = Number(latestRows?.[0]?.revision_no || 0) + 1;
  const publishedStandard = normalizeHotelStaffStandard({
    ...authoring.structured_proposal_json,
    standardKey: authoring.standard_key,
    standardScope: authoring.standard_scope,
    departmentCodes: authoring.department_codes,
    revisionNo,
    status: "published",
  });
  const trainingPlan = deriveStaffTrainingPlan(publishedStandard);

  const { data, error } = await supabaseAdmin.rpc(
    "publish_staff_standard_authoring_v2",
    {
      p_hotel_id: identity.hotelId,
      p_authoring_id: authoring.id,
      p_actor_staff_user_id: identity.staffUserId,
      p_proposal_hash: authoring.proposal_hash,
      p_standard_json: publishedStandard,
      p_training_plan_json: trainingPlan,
    },
  );

  if (error) {
    throw new Error(
      error.message || "STAFF_STANDARD_AUTHORING_PUBLISH_FAILED",
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("STAFF_STANDARD_AUTHORING_PUBLISH_EMPTY");
  }

  return {
    ...row,
    standard: publishedStandard,
    trainingPlan,
  };
}

export async function getStaffStandardAiDraftContext(input: {
  hotelSlug: unknown;
  authoringId: unknown;
}) {
  const identity = await requireManagerIdentity(input.hotelSlug);
  const authoring = await loadAuthoring({
    identity,
    authoringId: input.authoringId,
    allowedStatuses: ["draft", "proposal_ready"],
  });
  const sourceText = normalizeSourceText(authoring.source_text);
  if (!sourceText) {
    throw new Error("STAFF_AI_STANDARD_SOURCE_TEXT_REQUIRED");
  }

  const existing = isRecord(authoring.structured_proposal_json)
    ? authoring.structured_proposal_json
    : null;
  const assessmentRequired = existing?.assessmentRequired !== false;

  return {
    authoringId: authoring.id,
    standardKey: authoring.standard_key,
    standardScope: authoring.standard_scope,
    departmentCodes: [...authoring.department_codes],
    sourceText,
    settings: {
      roleCodes: Array.isArray(existing?.roleCodes) ? existing.roleCodes : [],
      effectiveFrom: existing?.effectiveFrom ?? null,
      effectiveTo: existing?.effectiveTo ?? null,
      trainingRequired: existing?.trainingRequired !== false,
      assessmentRequired,
      minimumPassScore: assessmentRequired
        ? Number(existing?.minimumPassScore ?? 80)
        : null,
    },
  };
}

