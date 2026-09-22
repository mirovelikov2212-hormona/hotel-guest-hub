import "server-only";

import crypto from "crypto";

import type { HubOfferV2 } from "@/lib/product-factory/hub-offer-contract";
import {
  HUB_DESIGN_ASSET_BUCKET,
  HUB_DESIGN_ASSET_MAX_LIST,
  HUB_DESIGN_ASSET_SIGNED_URL_TTL_SECONDS,
  collectHubDesignAssetIds,
  getHubDesignAssetExtension,
  isHubDesignAssetId,
  validateHubDesignAssetBytes,
  validateHubDesignAssetDeclaration,
  type HubDesignAssetMetadata,
} from "@/lib/product-factory/hub-design-assets";
import { buildHubDesignSourceKey } from "@/lib/server/hub-design-source-key";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type AssetRow = {
  id: string;
  source_key: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  asset_kind: "image" | "document";
  created_at: string;
};

function storageNotReady(message: string) {
  return /bucket not found|could not find the table|relation .*hub_design_assets.* does not exist|pgrst205/i.test(message);
}

function throwStorageError(prefix: string, error: { message?: string } | null | undefined): never {
  const message = String(error?.message || "");
  if (storageNotReady(message)) throw new Error("HUB_DESIGN_ASSET_STORAGE_NOT_READY");
  throw new Error(prefix + ":" + (message || "unknown"));
}

function mapAsset(row: AssetRow, signedUrl: string | null): HubDesignAssetMetadata {
  return {
    id: row.id,
    sourceKey: row.source_key,
    originalName: row.original_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    sha256: row.sha256,
    kind: row.asset_kind,
    createdAt: row.created_at,
    signedUrl,
  };
}

function expectedStoragePath(sourceKey: string, assetId: string, mimeType: string) {
  const extension = getHubDesignAssetExtension(mimeType);
  if (!extension) throw new Error("HUB_DESIGN_ASSET_MIME_UNSUPPORTED");
  return sourceKey + "/" + assetId + "." + extension;
}

async function removeObjectQuietly(storagePath: string) {
  try {
    await supabaseAdmin.storage.from(HUB_DESIGN_ASSET_BUCKET).remove([storagePath]);
  } catch {}
}

export async function prepareHubDesignAssetUpload(input: {
  canonicalUrl: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
}) {
  const validation = validateHubDesignAssetDeclaration(input);
  if (!validation.ok || !validation.rule) {
    throw new Error("HUB_DESIGN_ASSET_INVALID:" + validation.errors.join(","));
  }

  const sourceKey = buildHubDesignSourceKey(input.canonicalUrl);
  const assetId = crypto.randomUUID();
  const storagePath = expectedStoragePath(sourceKey, assetId, input.mimeType);
  const { data, error } = await supabaseAdmin.storage
    .from(HUB_DESIGN_ASSET_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error || !data?.signedUrl || !data.token) {
    throwStorageError("HUB_DESIGN_ASSET_SIGNED_UPLOAD_FAILED", error);
  }

  return {
    assetId,
    sourceKey,
    storagePath,
    signedUrl: data.signedUrl,
    token: data.token,
    kind: validation.rule.kind,
  };
}

export async function finalizeHubDesignAssetUpload(input: {
  actorAdminId: string;
  canonicalUrl: string;
  assetId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
}) {
  const validation = validateHubDesignAssetDeclaration(input);
  if (!validation.ok || !validation.rule || !isHubDesignAssetId(input.assetId)) {
    throw new Error("HUB_DESIGN_ASSET_INVALID:" + (validation.errors.join(",") || "ASSET_ID_INVALID"));
  }

  const sourceKey = buildHubDesignSourceKey(input.canonicalUrl);
  const expectedPath = expectedStoragePath(sourceKey, input.assetId, input.mimeType);
  if (input.storagePath !== expectedPath) throw new Error("HUB_DESIGN_ASSET_PATH_MISMATCH");

  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from(HUB_DESIGN_ASSET_BUCKET)
    .download(input.storagePath);
  if (downloadError || !fileBlob) throwStorageError("HUB_DESIGN_ASSET_DOWNLOAD_FAILED", downloadError);

  const bytes = new Uint8Array(await fileBlob.arrayBuffer());
  const actualMime = String(fileBlob.type || "").trim().toLowerCase();
  const expectedMime = String(input.mimeType || "").trim().toLowerCase();

  if (
    bytes.byteLength !== input.fileSize
    || (actualMime && actualMime !== expectedMime && actualMime !== "application/octet-stream")
    || !validateHubDesignAssetBytes(bytes, expectedMime)
  ) {
    await removeObjectQuietly(input.storagePath);
    throw new Error("HUB_DESIGN_ASSET_CONTENT_INVALID");
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { data, error } = await supabaseAdmin.rpc("register_hub_design_asset_v1", {
    p_actor_admin_id: input.actorAdminId,
    p_asset_id: input.assetId,
    p_source_key: sourceKey,
    p_original_name: input.originalName,
    p_storage_path: input.storagePath,
    p_mime_type: expectedMime,
    p_file_size: input.fileSize,
    p_sha256: sha256,
    p_asset_kind: validation.rule.kind,
  });

  if (error) {
    await removeObjectQuietly(input.storagePath);
    throwStorageError("HUB_DESIGN_ASSET_REGISTER_FAILED", error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as AssetRow | null;
  if (!row) {
    await removeObjectQuietly(input.storagePath);
    throw new Error("HUB_DESIGN_ASSET_REGISTER_EMPTY");
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(HUB_DESIGN_ASSET_BUCKET)
    .createSignedUrl(input.storagePath, HUB_DESIGN_ASSET_SIGNED_URL_TTL_SECONDS);
  if (signedError) throwStorageError("HUB_DESIGN_ASSET_PREVIEW_URL_FAILED", signedError);

  return mapAsset(row, signed?.signedUrl || null);
}

export async function listHubDesignAssets(canonicalUrl: string) {
  const sourceKey = buildHubDesignSourceKey(canonicalUrl);
  const { data, error } = await supabaseAdmin
    .from("hub_design_assets")
    .select("id,source_key,original_name,storage_path,mime_type,file_size,sha256,asset_kind,created_at")
    .eq("source_key", sourceKey)
    .order("created_at", { ascending: false })
    .limit(HUB_DESIGN_ASSET_MAX_LIST);

  if (error) throwStorageError("HUB_DESIGN_ASSET_LIST_FAILED", error);
  const rows = (data || []) as AssetRow[];
  if (!rows.length) return { sourceKey, assets: [] as HubDesignAssetMetadata[] };

  const { data: signedRows, error: signedError } = await supabaseAdmin.storage
    .from(HUB_DESIGN_ASSET_BUCKET)
    .createSignedUrls(rows.map((row) => row.storage_path), HUB_DESIGN_ASSET_SIGNED_URL_TTL_SECONDS);

  if (signedError) throwStorageError("HUB_DESIGN_ASSET_SIGNED_URLS_FAILED", signedError);
  const signedByPath = new Map((signedRows || []).map((item) => [item.path, item.signedUrl || null]));

  return {
    sourceKey,
    assets: rows.map((row) => mapAsset(row, signedByPath.get(row.storage_path) || null)),
  };
}

export async function assertHubDesignOfferAssetReferences(input: {
  canonicalUrl: string;
  offers: HubOfferV2[];
}) {
  const ids = collectHubDesignAssetIds(input.offers);
  if (!ids.length) return;

  const sourceKey = buildHubDesignSourceKey(input.canonicalUrl);
  const { data, error } = await supabaseAdmin
    .from("hub_design_assets")
    .select("id,asset_kind")
    .eq("source_key", sourceKey)
    .in("id", ids);

  if (error) throwStorageError("HUB_DESIGN_ASSET_REFERENCE_READ_FAILED", error);

  const rows = (data || []) as Array<{ id: string; asset_kind: "image" | "document" }>;
  const byId = new Map(rows.map((row) => [row.id, row.asset_kind]));

  if (ids.some((id) => !byId.has(id))) {
    throw new Error("HUB_DESIGN_ASSET_REFERENCE_FOREIGN_OR_MISSING");
  }

  for (const offer of input.offers) {
    if (offer.assets.coverAssetId && byId.get(offer.assets.coverAssetId) !== "image") {
      throw new Error("HUB_DESIGN_ASSET_COVER_NOT_IMAGE");
    }
    for (const id of offer.assets.galleryAssetIds) {
      if (byId.get(id) !== "image") throw new Error("HUB_DESIGN_ASSET_GALLERY_NOT_IMAGE");
    }
  }
}
