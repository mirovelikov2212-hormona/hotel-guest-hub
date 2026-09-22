export const HUB_DESIGN_ASSET_BUCKET = "hub-design-assets" as const;
export const HUB_DESIGN_ASSET_SIGNED_URL_TTL_SECONDS = 15 * 60;
export const HUB_DESIGN_ASSET_MAX_LIST = 200;

export type HubDesignAssetKind = "image" | "document";
export type HubDesignAssetRole = "cover" | "gallery" | "attachment";

export type HubDesignAssetMetadata = {
  id: string;
  sourceKey: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  kind: HubDesignAssetKind;
  createdAt: string;
  signedUrl: string | null;
};

type AssetRule = {
  kind: HubDesignAssetKind;
  extensions: readonly string[];
  maxBytes: number;
};

const MIB = 1024 * 1024;
const ASSET_RULES: Record<string, AssetRule> = {
  "image/jpeg": { kind: "image", extensions: ["jpg", "jpeg"], maxBytes: 10 * MIB },
  "image/png": { kind: "image", extensions: ["png"], maxBytes: 10 * MIB },
  "image/webp": { kind: "image", extensions: ["webp"], maxBytes: 10 * MIB },
  "application/pdf": { kind: "document", extensions: ["pdf"], maxBytes: 20 * MIB },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: "document", extensions: ["docx"], maxBytes: 20 * MIB,
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: "document", extensions: ["xlsx"], maxBytes: 20 * MIB,
  },
  "text/csv": { kind: "document", extensions: ["csv"], maxBytes: 5 * MIB },
  "application/csv": { kind: "document", extensions: ["csv"], maxBytes: 5 * MIB },
};

export const HUB_DESIGN_ASSET_ACCEPT = Object.keys(ASSET_RULES).join(",");
export const HUB_DESIGN_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function extensionOf(name: string) {
  const normalized = String(name || "").trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index + 1) : "";
}

export function isHubDesignAssetId(value: unknown) {
  return UUID_PATTERN.test(String(value || "").trim());
}

export function getHubDesignAssetRule(mimeType: string) {
  return ASSET_RULES[String(mimeType || "").trim().toLowerCase()] || null;
}

export function getHubDesignAssetExtension(mimeType: string) {
  return getHubDesignAssetRule(mimeType)?.extensions[0] || null;
}

export function validateHubDesignAssetDeclaration(input: {
  originalName: string;
  mimeType: string;
  fileSize: number;
}) {
  const errors: string[] = [];
  const originalName = String(input.originalName || "").trim();
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const fileSize = Number(input.fileSize);
  const rule = getHubDesignAssetRule(mimeType);

  if (!originalName || originalName.length > 240) errors.push("ASSET_FILENAME_INVALID");
  if (!rule) errors.push("ASSET_MIME_UNSUPPORTED");
  if (!Number.isInteger(fileSize) || fileSize < 1 || (rule && fileSize > rule.maxBytes)) errors.push("ASSET_SIZE_INVALID");
  if (rule && !rule.extensions.includes(extensionOf(originalName))) errors.push("ASSET_EXTENSION_MISMATCH");

  return { ok: errors.length === 0, errors: [...new Set(errors)], rule };
}

function startsWithBytes(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes: Uint8Array, needle: string) {
  const pattern = new TextEncoder().encode(needle);
  outer: for (let index = 0; index <= bytes.length - pattern.length; index += 1) {
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) continue outer;
    }
    return true;
  }
  return false;
}

export function validateHubDesignAssetBytes(bytes: Uint8Array, mimeType: string) {
  const mime = String(mimeType || "").trim().toLowerCase();
  if (!bytes.length) return false;

  if (mime === "image/jpeg") return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/webp") return containsAscii(bytes.slice(0, 16), "RIFF") && containsAscii(bytes.slice(0, 16), "WEBP");
  if (mime === "application/pdf") return containsAscii(bytes.slice(0, 8), "%PDF-");

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    if (!startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
    const hasContentTypes = containsAscii(bytes, "[Content_Types].xml");
    return hasContentTypes && (mime.includes("wordprocessingml") ? containsAscii(bytes, "word/") : containsAscii(bytes, "xl/"));
  }

  if (mime === "text/csv" || mime === "application/csv") {
    if (bytes.includes(0)) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function validateHubDesignAssetMetadata(value: HubDesignAssetMetadata) {
  return isHubDesignAssetId(value.id)
    && /^[a-f0-9]{64}$/i.test(value.sourceKey)
    && Boolean(value.originalName)
    && Boolean(value.storagePath)
    && Boolean(getHubDesignAssetRule(value.mimeType))
    && Number.isInteger(value.fileSize)
    && value.fileSize > 0
    && SHA256_PATTERN.test(value.sha256)
    && (value.kind === "image" || value.kind === "document");
}

export function collectHubDesignAssetIds(offers: Array<{
  assets?: {
    coverAssetId?: string | null;
    galleryAssetIds?: string[];
    attachmentAssetIds?: string[];
    readyCreativeByLang?: Record<string, { assetId?: string | null; kind?: "image" | "document" }>;
  };
}>) {
  const ids = new Set<string>();
  for (const offer of offers || []) {
    const assets = offer?.assets;
    if (!assets) continue;
    if (assets.coverAssetId) ids.add(String(assets.coverAssetId));
    for (const id of assets.galleryAssetIds || []) ids.add(String(id));
    for (const id of assets.attachmentAssetIds || []) ids.add(String(id));
    for (const creative of Object.values(assets.readyCreativeByLang || {})) {
      if (creative?.assetId) ids.add(String(creative.assetId));
    }
  }
  return [...ids];
}
