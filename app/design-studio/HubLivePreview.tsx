"use client";

import HubExperienceBuilder from "./HubExperienceBuilder";
import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";

export default function HubLivePreview({ pkg, lang }: { pkg: HotelIntelligencePackage; lang: ControlPlaneLang }) {
  return <HubExperienceBuilder pkg={pkg} lang={lang} />;
}
