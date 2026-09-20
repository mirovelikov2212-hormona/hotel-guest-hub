import "server-only";

import type {
  HotelFactVerificationMetadata,
  HotelIntelligenceItem,
  HotelIntelligencePackage,
  HotelIntelligenceTarget,
} from "@/lib/product-factory/hotel-intelligence-package";
import type { HotelIntakePipelineV2Result } from "@/lib/server/hotel-scanner-v2-pipeline";

const PREVIEW_CATEGORIES = new Set([
  "identity", "hotel", "location", "contact", "operations",
  "accommodation", "gastronomy", "dining", "spa", "wellness",
  "services", "amenities", "experiences", "events", "offers",
]);

const CATEGORY_MAP: Record<string, string> = {
  gastronomy: "dining",
  spa: "wellness",
};

function clean(value: unknown, max = 2_048) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : text.slice(0, max);
}

function unique(values: string[], max = 80) {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))].slice(0, max);
}

function normalized(value: unknown) {
  return clean(value, 500).toLocaleLowerCase("en-US");
}

function factVerification(fact: Record<string, any>): HotelFactVerificationMetadata | undefined {
  const verification = fact?.verification;
  const status = clean(verification?.status, 40);
  if (!["VERIFIED", "SINGLE_SOURCE", "CONFLICT", "UNSCORED"].includes(status)) return undefined;
  return {
    status: status as HotelFactVerificationMetadata["status"],
    independentSourceCount: Math.max(0, Number(verification?.independentSourceCount || 0)),
    sourceUrls: unique(Array.isArray(verification?.sourceUrls) ? verification.sourceUrls.map(String) : []),
  };
}

function conflictKeys(result: HotelIntakePipelineV2Result) {
  return new Set((result.intelligenceCandidate.conflicts || []).map((conflict: any) =>
    `${normalized(conflict?.subject)}|${normalized(conflict?.attribute || conflict?.topicLabel)}`));
}

function previewItems(result: HotelIntakePipelineV2Result): HotelIntelligenceItem[] {
  const blocked = conflictKeys(result);
  return (result.intelligenceCandidate.facts || []).flatMap((raw: any, index) => {
    const originalCategory = normalized(raw?.category);
    if (!PREVIEW_CATEGORIES.has(originalCategory)) return [];
    const category = CATEGORY_MAP[originalCategory] || originalCategory;
    const subject = clean(raw?.subject, 240);
    const attribute = clean(raw?.attribute, 120);
    const verification = factVerification(raw);
    if (verification?.status === "CONFLICT") return [];
    if (blocked.has(`${normalized(subject)}|${normalized(attribute)}`)) return [];

    const targets: HotelIntelligenceTarget[] = ["hub"];
    const value = clean(raw?.value, 4_000);
    if (!value) return [];
    return [{
      id: `scanner-v2-preview-${index + 1}`,
      category,
      ...(subject ? { subject } : {}),
      ...(attribute ? { attribute } : {}),
      ...(verification ? { verification } : {}),
      label: clean(raw?.label, 240) || attribute || category,
      value,
      confidence: Math.max(0, Math.min(1, Number(raw?.confidence || 0))),
      sourceUrls: unique(Array.isArray(raw?.sourceUrls) ? raw.sourceUrls.map(String) : []),
      targets,
      status: "candidate" as const,
    }];
  });
}

function firstValue(items: HotelIntelligenceItem[], categories: string[], attributes: string[]) {
  const found = items.find((item) =>
    categories.includes(normalized(item.category))
    && attributes.includes(normalized(item.attribute)));
  return clean(found?.value, 600);
}

function entityNames(result: HotelIntakePipelineV2Result, domain: string) {
  const inventory = result.intelligenceCandidate.inventory.domains.find((entry: any) => entry.domain === domain) as any;
  return unique((inventory?.expectedItems || []).map((item: any) => clean(item?.nameHint, 180)).filter(Boolean), 50);
}

function subjects(items: HotelIntelligenceItem[], category: string) {
  return unique(items.filter((item) => item.category === category).map((item) => clean(item.subject, 180)).filter(Boolean), 50);
}

function hotelName(items: HotelIntelligenceItem[], canonicalUrl: string) {
  const explicit = firstValue(items, ["identity", "hotel"], ["hotel_name", "property_name", "name", "display_name"]);
  if (explicit) return explicit;
  const identitySubject = items.find((item) =>
    ["identity", "hotel"].includes(item.category)
    && clean(item.subject)
    && normalized(item.subject) !== "hotel")?.subject;
  if (identitySubject) return clean(identitySubject, 180);
  try {
    return new URL(canonicalUrl).hostname.replace(/^www\./u, "");
  } catch {
    return "Hotel";
  }
}

export function projectHotelScannerV2DesignPreviewPackage(result: HotelIntakePipelineV2Result): HotelIntelligencePackage {
  const items = previewItems(result);
  const canonicalUrl = result.source.canonicalUrl;
  const name = hotelName(items, canonicalUrl);
  const roomTypes = entityNames(result, "accommodation");
  const venueNames = entityNames(result, "gastronomy");
  const spaNames = entityNames(result, "spa");
  const phones = unique(items.filter((item) => item.category === "contact" && normalized(item.attribute) === "phone").map((item) => item.value), 12);
  const emails = unique(items.filter((item) => item.category === "contact" && normalized(item.attribute) === "email").map((item) => item.value), 12);
  const socialLinks = unique(items.filter((item) => item.category === "contact" && normalized(item.attribute) === "social_profile").map((item) => item.value), 20);
  const singleSource = items.filter((item) => item.verification?.status === "SINGLE_SOURCE");

  return {
    schemaVersion: "hotel-intelligence-v1",
    pipelineVersion: "professional-crawler-v2",
    generatedAt: result.intelligenceCandidate.generatedAt,
    source: {
      requestedUrl: result.source.requestedUrl,
      canonicalUrl,
      scannedAt: result.source.scannedAt,
      pageCount: result.intelligenceCandidate.provenance.pageUrls.length,
    },
    evidenceLayer: {
      facts: items,
      sourceUrls: unique([canonicalUrl, ...items.flatMap((item) => item.sourceUrls)], 240),
      uncertainties: [...new Set(result.validationGate.blockingReasons || [])],
    },
    hotelProfileLayer: {
      identity: {
        hotelName: name,
        summary: firstValue(items, ["identity", "hotel"], ["description", "summary"]),
        address: firstValue(items, ["location"], ["address"]),
        city: firstValue(items, ["location"], ["city"]),
        country: firstValue(items, ["location"], ["country"]),
        bookingUrl: firstValue(items, ["contact"], ["booking", "booking_url"]),
        contactUrl: canonicalUrl,
      },
      contacts: { phones, emails, socialLinks },
      operations: {
        checkIn: firstValue(items, ["operations"], ["check_in"]),
        checkOut: firstValue(items, ["operations"], ["check_out"]),
        languages: unique(items.filter((item) => item.category === "operations" && normalized(item.attribute) === "language").map((item) => item.value), 20),
      },
      hospitality: {
        roomTypes,
        amenities: unique([...subjects(items, "services"), ...subjects(items, "amenities")], 50),
        venues: venueNames.map((venue) => ({
          name: venue,
          type: "venue",
          hours: clean(items.find((item) => item.category === "dining" && item.subject === venue && normalized(item.attribute) === "hours")?.value, 160),
          summary: clean(items.find((item) => item.category === "dining" && item.subject === venue && normalized(item.attribute) === "description")?.value, 320),
        })),
        spaServices: spaNames,
        policies: [],
      },
    },
    designIntelligenceLayer: {
      colors: [],
      fonts: [],
      styleKeywords: [],
      imageReferences: [],
      logoReferences: [],
      visualAssetPolicy: "hotel_authorization_required",
    },
    routing: {
      hub: items,
      smartSetup: [],
      designStudio: [],
      review: singleSource,
    },
    readiness: {
      evidenceFactCount: items.length,
      hubCandidateCount: items.length,
      smartSetupCandidateCount: 0,
      designSignalCount: 0,
      reviewRequiredCount: singleSource.length + (result.validationGate.blockingReasons?.length || 0),
      verifiedFactCount: items.filter((item) => item.verification?.status === "VERIFIED").length,
      singleSourceFactCount: singleSource.length,
      conflictFactCount: result.intelligenceCandidate.conflicts.length,
      humanReviewResolved: false,
    },
  };
}
