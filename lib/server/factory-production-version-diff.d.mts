export type HotelConfigChangeCategory =
  | "content"
  | "services"
  | "routing"
  | "hours"
  | "policies"
  | "venues"
  | "design"
  | "operational_settings";

export type HotelConfigChangeKind = "added" | "removed" | "changed" | "collection_changed";

export type HotelConfigVersionChange = {
  path: string;
  kind: HotelConfigChangeKind;
  category: HotelConfigChangeCategory;
};

export type HotelConfigVersionDiff = {
  schemaVersion: "cm2-version-diff-v1";
  totalChanges: number;
  categoryCounts: Record<HotelConfigChangeCategory, number>;
  changedCategories: HotelConfigChangeCategory[];
  topLevelKeys: string[];
  changes: HotelConfigVersionChange[];
  truncated: boolean;
  changed: boolean;
  diffHash: string;
};

export function buildHotelConfigVersionDiff(
  currentConfig: Record<string, unknown>,
  candidateConfig: Record<string, unknown>,
): HotelConfigVersionDiff;

export const HOTEL_CONFIG_CHANGE_CATEGORIES: readonly HotelConfigChangeCategory[];
