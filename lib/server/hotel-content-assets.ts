import "server-only";

import crypto from "crypto";

import {
  HUB_DESIGN_ASSET_BUCKET,
  HUB_DESIGN_ASSET_SIGNED_URL_TTL_SECONDS,
  getHubDesignAssetExtension,
  validateHubDesignAssetBytes,
  validateHubDesignAssetDeclaration,
} from "@/lib/product-factory/hub-design-assets";
import {
  evaluateHubCreativeTechnicalQuality,
  readHubCreativeImageDimensions,
} from "@/lib/product-factory/hub-creative-quality.mjs";
import { resolveManagerContentChangeScope } from "@/lib/server/manager-content-changes";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export type HotelContentCreativeSurface =
  | "hub_ready"
  | "website_source"
  | "generic_attachment";

type HotelContentAssetRow = {
  id: string;
  hotel_id: string;
  change_request_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  asset_kind: "image" | "document";
  lifecycle_status: "draft" | "active" | "archived";
  creative_surface: HotelContentCreativeSurface;
  hub_review_status: "approved" | "pending_review" | "rejected" | "not_applicable";
  quality_status: "pass" | "warning" | "fail";
  image_width: number | null;
  image_height: number | null;
  quality_json: Record<string, unknown>;
  created_at: string;
};

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(code);
  }
  return id;
}

function normalizeCreativeSurface(value: unknown): HotelContentCreativeSurface {
  const surface = String(value || "").trim().toLowerCase();
  if (
    surface !== "hub_ready"
    && surface !== "website_source"
    && surface !== "generic_attachment"
  ) {
    throw new Error("CM5_CONTENT_ASSET_CREATIVE_SURFACE_INVALID");
  }
  return surface;
}

function ensureAllowedDeclaration(input: {
  originalName: string;
  mimeType: string;
  fileSize: number;
}) {
  const validation = validateHubDesignAssetDeclaration(input);
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  if (!validation.ok || !validation.rule || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("CM5_CONTENT_ASSET_DECLARATION_INVALID:" + validation.errors.join(","));
  }
  return {
    mimeType,
    kind: validation.rule.kind,
  };
}

async function assertOwnedOfferDraft(input: {
  hotelId: string;
  changeRequestId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("hotel_content_change_requests")
    .select("id,status,change_scope")
    .eq("id", input.changeRequestId)
    .eq("hotel_id", input.hotelId)
    .maybeSingle();

  if (error) throw new Error("CM5_CONTENT_ASSET_CHANGE_REQUEST_READ_FAILED");
  if (
    !data
    || data.status !== "draft"
    || !Array.isArray(data.change_scope)
    || !data.change_scope.includes("offers")
  ) {
    throw new Error("CM5_CONTENT_ASSET_CHANGE_REQUEST_INVALID");
  }
}

function expectedStoragePath(input: {
  hotelId: string;
  changeRequestId: string;
  assetId: string;
  mimeType: string;
}) {
  const extension = getHubDesignAssetExtension(input.mimeType);
  if (!extension) throw new Error("CM5_CONTENT_ASSET_MIME_INVALID");
  return "hotel/" + input.hotelId
    + "/changes/" + input.changeRequestId
    + "/" + input.assetId
    + "." + extension;
}

async function removeObjectQuietly(storagePath: string) {
  try {
    await supabaseAdmin.storage.from(HUB_DESIGN_ASSET_BUCKET).remove([storagePath]);
  } catch {}
}

async function signedPreview(storagePath: string) {
  const { data, error } = await supabaseAdmin.storage
    .from(HUB_DESIGN_ASSET_BUCKET)
    .createSignedUrl(storagePath, HUB_DESIGN_ASSET_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error("CM5_CONTENT_ASSET_PREVIEW_URL_FAILED");
  }
  return data.signedUrl;
}

function mapAsset(row: HotelContentAssetRow, previewUrl: string | null) {
  return {
    id: row.id,
    changeRequestId: row.change_request_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    sha256: row.sha256,
    kind: row.asset_kind,
    lifecycleStatus: row.lifecycle_status,
    creativeSurface: row.creative_surface,
    hubReviewStatus: row.hub_review_status,
    qualityStatus: row.quality_status,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    quality: row.quality_json || {},
    createdAt: row.created_at,
    previewUrl,
  };
}

export async function prepareHotelContentAssetUpload(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
  originalName: unknown;
  mimeType: unknown;
  fileSize: unknown;
  creativeSurface: unknown;
}) {
  const scope = await resolveManagerContentChangeScope(input.hotelSlug);
  const changeRequestId = normalizeUuid(
    input.changeRequestId,
    "CM5_CONTENT_ASSET_CHANGE_REQUEST_ID_INVALID",
  );
  await assertOwnedOfferDraft({
    hotelId: scope.hotelId,
    changeRequestId,
  });

  const originalName = String(input.originalName || "").trim();
  const fileSize = Number(input.fileSize);
  const { mimeType, kind } = ensureAllowedDeclaration({
    originalName,
    mimeType: String(input.mimeType || ""),
    fileSize,
  });
  const creativeSurface = normalizeCreativeSurface(input.creativeSurface);

  if (creativeSurface !== "generic_attachment" && kind !== "image" && mimeType !== "application/pdf") {
    throw new Error("CM5_CONTENT_ASSET_READY_CREATIVE_TYPE_INVALID");
  }

  const assetId = crypto.randomUUID();
  const storagePath = expectedStoragePath({
    hotelId: scope.hotelId,
    changeRequestId,
    assetId,
    mimeType,
  });

  const { data, error } = await supabaseAdmin.storage
    .from(HUB_DESIGN_ASSET_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error || !data?.signedUrl || !data.token) {
    throw new Error("CM5_CONTENT_ASSET_SIGNED_UPLOAD_FAILED");
  }

  return {
    assetId,
    changeRequestId,
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
    kind,
    creativeSurface,
  };
}

export async function finalizeHotelContentAssetUpload(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
  assetId: unknown;
  storagePath: unknown;
  originalName: unknown;
  mimeType: unknown;
  fileSize: unknown;
  creativeSurface: unknown;
}) {
  const scope = await resolveManagerContentChangeScope(input.hotelSlug);
  const changeRequestId = normalizeUuid(
    input.changeRequestId,
    "CM5_CONTENT_ASSET_CHANGE_REQUEST_ID_INVALID",
  );
  const assetId = normalizeUuid(input.assetId, "CM5_CONTENT_ASSET_ID_INVALID");
  await assertOwnedOfferDraft({
    hotelId: scope.hotelId,
    changeRequestId,
  });

  const originalName = String(input.originalName || "").trim();
  const fileSize = Number(input.fileSize);
  const { mimeType, kind } = ensureAllowedDeclaration({
    originalName,
    mimeType: String(input.mimeType || ""),
    fileSize,
  });
  const creativeSurface = normalizeCreativeSurface(input.creativeSurface);
  const storagePath = String(input.storagePath || "").trim();
  const expectedPath = expectedStoragePath({
    hotelId: scope.hotelId,
    changeRequestId,
    assetId,
    mimeType,
  });
  if (storagePath !== expectedPath) {
    throw new Error("CM5_CONTENT_ASSET_PATH_INVALID");
  }

  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from(HUB_DESIGN_ASSET_BUCKET)
    .download(storagePath);

  if (downloadError || !fileBlob) {
    throw new Error("CM5_CONTENT_ASSET_DOWNLOAD_FAILED");
  }

  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  const expectedMime = mimeType.toLowerCase();
  const actualMime = String(fileBlob.type || "").trim().toLowerCase();

  if (
    bytes.byteLength !== fileSize
    || (actualMime && actualMime !== expectedMime && actualMime !== "application/octet-stream")
    || !validateHubDesignAssetBytes(bytes, expectedMime)
  ) {
    await removeObjectQuietly(storagePath);
    throw new Error("CM5_CONTENT_ASSET_CONTENT_INVALID");
  }

  const dimensions = kind === "image"
    ? readHubCreativeImageDimensions(bytes, expectedMime)
    : { width: null, height: null };

  const qualityResult = evaluateHubCreativeTechnicalQuality({
    kind,
    mimeType: expectedMime,
    creativeSurface,
    width: dimensions.width,
    height: dimensions.height,
  });

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { data, error } = await supabaseAdmin.rpc(
    "register_hotel_content_asset_v1",
    {
      p_hotel_id: scope.hotelId,
      p_change_request_id: changeRequestId,
      p_actor_session_id: scope.sessionId,
      p_asset_id: assetId,
      p_original_name: originalName,
      p_storage_path: storagePath,
      p_mime_type: expectedMime,
      p_file_size: fileSize,
      p_sha256: sha256,
      p_asset_kind: kind,
      p_creative_surface: creativeSurface,
      p_hub_review_status: qualityResult.hubReviewStatus,
      p_quality_status: qualityResult.qualityStatus,
      p_image_width: dimensions.width,
      p_image_height: dimensions.height,
      p_quality_json: qualityResult.quality,
    },
  );

  if (error) {
    await removeObjectQuietly(storagePath);
    throw new Error(error.message || "CM5_CONTENT_ASSET_REGISTER_FAILED");
  }

  const row = (Array.isArray(data) ? data[0] : data) as HotelContentAssetRow | null;
  if (!row) {
    await removeObjectQuietly(storagePath);
    throw new Error("CM5_CONTENT_ASSET_REGISTER_EMPTY");
  }

  return mapAsset(row, await signedPreview(storagePath));
}

export async function listHotelContentAssets(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  const scope = await resolveManagerContentChangeScope(input.hotelSlug);
  const changeRequestId = normalizeUuid(
    input.changeRequestId,
    "CM5_CONTENT_ASSET_CHANGE_REQUEST_ID_INVALID",
  );
  await assertOwnedOfferDraft({
    hotelId: scope.hotelId,
    changeRequestId,
  });

  const { data, error } = await supabaseAdmin
    .from("hotel_content_assets")
    .select("id,hotel_id,change_request_id,original_name,storage_path,mime_type,file_size,sha256,asset_kind,lifecycle_status,creative_surface,hub_review_status,quality_status,image_width,image_height,quality_json,created_at")
    .eq("hotel_id", scope.hotelId)
    .eq("change_request_id", changeRequestId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error("CM5_CONTENT_ASSET_LIST_FAILED");
  const rows = (data || []) as HotelContentAssetRow[];
  if (!rows.length) return [];

  const { data: signedRows, error: signedError } = await supabaseAdmin.storage
    .from(HUB_DESIGN_ASSET_BUCKET)
    .createSignedUrls(
      rows.map((row) => row.storage_path),
      HUB_DESIGN_ASSET_SIGNED_URL_TTL_SECONDS,
    );
  if (signedError) throw new Error("CM5_CONTENT_ASSET_PREVIEW_URL_FAILED");

  const urls = new Map(
    (signedRows || []).map((item) => [item.path, item.signedUrl || null]),
  );
  return rows.map((row) => mapAsset(row, urls.get(row.storage_path) || null));
}

export async function reviewHotelContentAsset(input: {
  hotelSlug: unknown;
  assetId: unknown;
  decision: unknown;
}) {
  const scope = await resolveManagerContentChangeScope(input.hotelSlug);
  const assetId = normalizeUuid(input.assetId, "CM5_CONTENT_ASSET_ID_INVALID");
  const decision = String(input.decision || "").trim().toLowerCase();
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("CM5_CONTENT_ASSET_REVIEW_INPUT_INVALID");
  }

  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("hotel_content_assets")
    .select("id,hotel_id,change_request_id,storage_path")
    .eq("id", assetId)
    .eq("hotel_id", scope.hotelId)
    .maybeSingle();

  if (ownedError) throw new Error("CM5_CONTENT_ASSET_OWNERSHIP_READ_FAILED");
  if (!owned) throw new Error("CM5_CONTENT_ASSET_NOT_FOUND");

  const { data, error } = await supabaseAdmin.rpc(
    "review_hotel_content_asset_v1",
    {
      p_asset_id: assetId,
      p_actor_session_id: scope.sessionId,
      p_decision: decision,
    },
  );

  if (error) throw new Error(error.message || "CM5_CONTENT_ASSET_REVIEW_FAILED");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("CM5_CONTENT_ASSET_REVIEW_EMPTY");

  return {
    assetId,
    changeRequestId: String(owned.change_request_id),
    hubReviewStatus: String(row.hub_review_status || ""),
    qualityStatus: String(row.quality_status || ""),
    reviewedAt: String(row.reviewed_at || ""),
    previewUrl: await signedPreview(String(owned.storage_path)),
  };
}
