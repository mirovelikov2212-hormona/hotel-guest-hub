function text(value) {
  return String(value ?? "").trim();
}

function uint24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function uint16le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function uint16be(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint32be(bytes, offset) {
  return (
    ((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]
  ) >>> 0;
}

export function readHubCreativeImageDimensions(bytes, mimeType) {
  const mime = text(mimeType).toLowerCase();
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) {
    throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
  }

  if (mime === "image/png") {
    if (
      bytes[0] !== 0x89
      || bytes[1] !== 0x50
      || bytes[2] !== 0x4e
      || bytes[3] !== 0x47
    ) {
      throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
    }
    const width = uint32be(bytes, 16);
    const height = uint32be(bytes, 20);
    if (!width || !height) throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
    return { width, height };
  }

  if (mime === "image/jpeg") {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
    }

    let offset = 2;
    const sofMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3,
      0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf,
    ]);

    while (offset + 8 < bytes.length) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;

      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 1 >= bytes.length) break;

      const length = uint16be(bytes, offset);
      if (length < 2 || offset + length > bytes.length) break;

      if (sofMarkers.has(marker) && length >= 7) {
        const height = uint16be(bytes, offset + 3);
        const width = uint16be(bytes, offset + 5);
        if (!width || !height) throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
        return { width, height };
      }

      offset += length;
    }

    throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
  }

  if (mime === "image/webp") {
    const header = new TextDecoder("ascii").decode(bytes.slice(0, 16));
    if (!header.startsWith("RIFF") || !header.includes("WEBP")) {
      throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
    }

    const chunk = new TextDecoder("ascii").decode(bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) {
      const width = uint24le(bytes, 24) + 1;
      const height = uint24le(bytes, 27) + 1;
      return { width, height };
    }

    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b1 = bytes[21];
      const b2 = bytes[22];
      const b3 = bytes[23];
      const b4 = bytes[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height };
    }

    if (chunk === "VP8 " && bytes.length >= 30) {
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
        throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
      }
      const width = uint16le(bytes, 26) & 0x3fff;
      const height = uint16le(bytes, 28) & 0x3fff;
      if (!width || !height) throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
      return { width, height };
    }

    throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
  }

  throw new Error("CM5_CONTENT_ASSET_IMAGE_MIME_UNSUPPORTED");
}

export function evaluateHubCreativeTechnicalQuality(input) {
  const kind = text(input?.kind).toLowerCase();
  const creativeSurface = text(input?.creativeSurface).toLowerCase();

  if (!["hub_ready", "website_source", "generic_attachment"].includes(creativeSurface)) {
    throw new Error("CM5_CONTENT_ASSET_CREATIVE_SURFACE_INVALID");
  }

  if (kind === "document") {
    return {
      qualityStatus: "warning",
      hubReviewStatus: creativeSurface === "generic_attachment" ? "not_applicable" : "pending_review",
      quality: {
        schemaVersion: "hub-creative-quality-v1",
        technicalOnly: true,
        flags: ["PDF_MOBILE_READABILITY_REVIEW_REQUIRED"],
        recommendation: "Review the PDF on the Hub mobile preview before approval.",
      },
    };
  }

  if (kind !== "image") {
    throw new Error("CM5_CONTENT_ASSET_KIND_INVALID");
  }

  const width = Number(input?.width);
  const height = Number(input?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("CM5_CONTENT_ASSET_IMAGE_DIMENSIONS_INVALID");
  }

  const ratio = width / height;
  const flags = [];

  if (width < 640) flags.push("IMAGE_WIDTH_BELOW_MINIMUM");
  if (height < 360) flags.push("IMAGE_HEIGHT_BELOW_MINIMUM");

  const hardFail = width < 640 || height < 360;
  if (!hardFail) {
    if (width < 900) flags.push("IMAGE_WIDTH_BELOW_RECOMMENDED");
    if (height < 600) flags.push("IMAGE_HEIGHT_BELOW_RECOMMENDED");
    if (ratio < 0.5 || ratio > 2.0) flags.push("IMAGE_ASPECT_RATIO_REVIEW_REQUIRED");
  }

  const qualityStatus = hardFail
    ? "fail"
    : flags.length
      ? "warning"
      : "pass";

  const hubReviewStatus = qualityStatus === "fail"
    ? "rejected"
    : creativeSurface === "website_source"
      ? "pending_review"
      : creativeSurface === "hub_ready" && qualityStatus === "pass"
        ? "approved"
        : creativeSurface === "generic_attachment"
          ? "not_applicable"
          : "pending_review";

  return {
    qualityStatus,
    hubReviewStatus,
    quality: {
      schemaVersion: "hub-creative-quality-v1",
      technicalOnly: true,
      width,
      height,
      aspectRatio: Number(ratio.toFixed(4)),
      flags,
      thresholds: {
        minimumWidth: 640,
        minimumHeight: 360,
        recommendedWidth: 900,
        recommendedHeight: 600,
        reviewAspectRatioMin: 0.5,
        reviewAspectRatioMax: 2.0,
      },
    },
  };
}
