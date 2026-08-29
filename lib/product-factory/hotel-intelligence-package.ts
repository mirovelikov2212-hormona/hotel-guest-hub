import type { HotelScanFact, HotelScanProfile } from "@/lib/ai/hotel-scanner";

export type HotelIntelligenceTarget = "hub" | "smart_setup" | "design_studio" | "review";
export type HotelIntelligenceStatus = "candidate" | "review_required";

export type HotelIntelligenceItem = HotelScanFact & {
  id: string;
  targets: HotelIntelligenceTarget[];
  status: HotelIntelligenceStatus;
};

export type HotelIntelligencePackage = {
  schemaVersion: "hotel-intelligence-v1";
  generatedAt: string;
  source: HotelScanProfile["source"];
  evidenceLayer: {
    facts: HotelIntelligenceItem[];
    sourceUrls: string[];
    uncertainties: string[];
  };
  hotelProfileLayer: {
    identity: HotelScanProfile["identity"];
    contacts: HotelScanProfile["contacts"];
    operations: HotelScanProfile["operations"];
    hospitality: HotelScanProfile["hospitality"];
  };
  designIntelligenceLayer: {
    colors: string[];
    fonts: string[];
    styleKeywords: string[];
    imageReferences: string[];
    logoReferences: string[];
    visualAssetPolicy: "hotel_authorization_required";
  };
  routing: {
    hub: HotelIntelligenceItem[];
    smartSetup: HotelIntelligenceItem[];
    designStudio: HotelIntelligenceItem[];
    review: HotelIntelligenceItem[];
  };
  readiness: {
    evidenceFactCount: number;
    hubCandidateCount: number;
    smartSetupCandidateCount: number;
    designSignalCount: number;
    reviewRequiredCount: number;
  };
};

const HUB_CATEGORIES = new Set([
  "location",
  "operations",
  "accommodation",
  "dining",
  "amenities",
  "wellness",
  "events",
  "policy",
  "sustainability",
  "family",
  "beach",
  "parking",
  "services",
  "hotel",
]);

const SMART_SETUP_CATEGORIES = new Set([
  "identity",
  "location",
  "contact",
  "operations",
  "accommodation",
  "dining",
  "amenities",
  "wellness",
  "events",
  "policy",
  "family",
  "beach",
  "parking",
  "services",
  "hotel",
]);

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function classifyFact(fact: HotelScanFact, index: number): HotelIntelligenceItem {
  const category = String(fact.category || "").trim().toLowerCase();
  const targets: HotelIntelligenceTarget[] = [];

  if (HUB_CATEGORIES.has(category)) targets.push("hub");
  if (SMART_SETUP_CATEGORIES.has(category)) targets.push("smart_setup");
  if (category === "brand") targets.push("design_studio");

  const status: HotelIntelligenceStatus = Number(fact.confidence) >= 0.9
    ? "candidate"
    : "review_required";

  if (status === "review_required" || targets.length === 0) targets.push("review");

  return {
    ...fact,
    id: `fact-${index + 1}`,
    targets: unique(targets) as HotelIntelligenceTarget[],
    status,
  };
}

export function buildHotelIntelligencePackage(profile: HotelScanProfile): HotelIntelligencePackage {
  const facts = profile.facts.map(classifyFact);
  const sourceUrls = unique([
    profile.source.canonicalUrl,
    ...facts.flatMap((fact) => fact.sourceUrls),
  ]);

  const hub = facts.filter((fact) => fact.targets.includes("hub"));
  const smartSetup = facts.filter((fact) => fact.targets.includes("smart_setup"));
  const designStudio = facts.filter((fact) => fact.targets.includes("design_studio"));
  const review = facts.filter((fact) => fact.targets.includes("review"));

  const designSignalCount = [
    ...profile.brand.colors,
    ...profile.brand.fonts,
    ...profile.brand.styleKeywords,
  ].filter(Boolean).length;

  return {
    schemaVersion: "hotel-intelligence-v1",
    generatedAt: new Date().toISOString(),
    source: profile.source,
    evidenceLayer: {
      facts,
      sourceUrls,
      uncertainties: profile.uncertainties,
    },
    hotelProfileLayer: {
      identity: profile.identity,
      contacts: profile.contacts,
      operations: profile.operations,
      hospitality: profile.hospitality,
    },
    designIntelligenceLayer: {
      colors: profile.brand.colors,
      fonts: profile.brand.fonts,
      styleKeywords: profile.brand.styleKeywords,
      imageReferences: profile.brand.imageUrls,
      logoReferences: profile.brand.logoUrls,
      visualAssetPolicy: "hotel_authorization_required",
    },
    routing: {
      hub,
      smartSetup,
      designStudio,
      review,
    },
    readiness: {
      evidenceFactCount: facts.length,
      hubCandidateCount: hub.length,
      smartSetupCandidateCount: smartSetup.length,
      designSignalCount,
      reviewRequiredCount: review.length + profile.uncertainties.length,
    },
  };
}
