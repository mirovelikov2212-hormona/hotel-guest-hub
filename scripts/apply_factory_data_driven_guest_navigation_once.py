from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    return source.replace(old, new, 1)


guest_path = Path("components/GuestHub.tsx")
guest = guest_path.read_text()

guest = replace_once(
    guest,
    'import { deriveGuestRuntimeCapabilities } from "@/lib/guest/guest-runtime-capabilities.mjs";\n',
    'import { deriveGuestRuntimeCapabilities } from "@/lib/guest/guest-runtime-capabilities.mjs";\nimport { buildFactoryGuestDepartmentGroups } from "@/lib/guest/factory-guest-navigation.mjs";\n',
    "factory navigation import",
)

premium_start = '  const premiumTiles = [\n'
premium_replacement = '''  type PremiumTileModel = {
    id: string;
    iconId: string;
    title: string;
    section?: HubSection | null;
    requiresRoom: boolean;
    special?: "massage" | "emergency";
    outletCategories?: string[];
  };

  const factoryConfiguredDepartmentTiles: PremiumTileModel[] =
    guestRuntimeCapabilities.factoryManaged
      ? buildFactoryGuestDepartmentGroups(
          requestDefs.filter((def) => isRenderableRequestDef(def)),
        ).map((group) => {
          const tileId = `factory_department_${group.departmentCode.replace(/[^a-z0-9_-]+/g, "_")}`;
          return {
            id: tileId,
            iconId: group.departmentCode,
            title: group.departmentName,
            section: {
              id: tileId,
              title: group.departmentName,
              items: group.requestDefs.map((def) => buildStandaloneRequestDefHubItem(def)),
            } satisfies HubSection,
            requiresRoom: true,
          };
        })
      : [];

  const legacyPremiumTiles: PremiumTileModel[] = [
'''
guest = replace_once(guest, premium_start, premium_replacement, "premium tile registry start")

premium_end = '''  ].filter((tile) =>
    tile.section ||
    (tile.special === "massage" && massageBookingPreviewVisible) ||
    (tile.special === "emergency" &&
      (Boolean(emergencyTileSection) || guestRuntimeCapabilities.legacyRequestFallbacksEnabled))
  );

  const selectedPremiumTile = openQuickServiceId
'''
premium_end_replacement = '''  ].filter((tile) =>
    tile.section ||
    (tile.special === "massage" && massageBookingPreviewVisible) ||
    (tile.special === "emergency" &&
      (Boolean(emergencyTileSection) || guestRuntimeCapabilities.legacyRequestFallbacksEnabled))
  );

  const factoryPremiumTiles: PremiumTileModel[] = [
    ...(infoCombinedSection
      ? [{ id: "info", iconId: "info", title: premiumSectionCopy.hotelInfo, section: infoCombinedSection, requiresRoom: true }]
      : []),
    ...(policyCombinedSection
      ? [{ id: "hotel_policies", iconId: "policy", title: getPremiumServiceTitle(lang, "hotelPolicy"), section: policyCombinedSection, requiresRoom: false }]
      : []),
    ...factoryConfiguredDepartmentTiles,
    ...(emergencyTileSection
      ? [{ id: "emergency", iconId: "emergency", title: lang === "bg" ? "Спешно повикване" : String(emergencyTileSection.title || "Emergency call"), section: emergencyTileSection, requiresRoom: false, special: "emergency" as const }]
      : []),
    ...(restaurantOutletSection
      ? [{ id: "restaurants", iconId: "restaurant", title: lang === "bg" ? "Ресторант" : String(restaurantOutletSection.title || "Restaurant"), section: restaurantOutletSection, requiresRoom: true, outletCategories: ["restaurants"] }]
      : []),
    ...(barsOutletSection
      ? [{ id: "bars", iconId: "bars", title: lang === "bg" ? "Бар" : String(barsOutletSection.title || "Bars"), section: barsOutletSection, requiresRoom: true, outletCategories: ["bars"] }]
      : []),
    ...(otherEntertainmentSection
      ? [{ id: "entertainment", iconId: "entertainment", title: premiumSectionCopy.otherEntertainment, section: otherEntertainmentSection, requiresRoom: true, outletCategories: ["kids", "entertainment", "gym", "spa", "pool", "other", "room_service"] }]
      : []),
    ...(configuredExplorePlaces.length > 0 && exploreHubSection
      ? [{ id: "explore", iconId: "explore", title: lang === "bg" ? "Около хотела" : String(exploreHubSection.title || "Around the hotel"), section: exploreHubSection, requiresRoom: true }]
      : []),
    ...(reviewsCombinedSection
      ? [{ id: "reviews", iconId: "reviews", title: lang === "bg" ? "Отзиви" : reviewsDisplaySection.title, section: reviewsCombinedSection, requiresRoom: true }]
      : []),
  ];

  const premiumTiles: PremiumTileModel[] = guestRuntimeCapabilities.factoryManaged
    ? factoryPremiumTiles
    : legacyPremiumTiles;

  const selectedPremiumTile = openQuickServiceId
'''
guest = replace_once(guest, premium_end, premium_end_replacement, "premium tile registry end")

guest_path.write_text(guest)

contract_path = Path("tests/contracts/shared-guest-runtime-genericization.contract.test.mjs")
contract = contract_path.read_text()
contract = replace_once(
    contract,
    '} from "../../lib/guest/guest-runtime-capabilities.mjs";\n',
    '} from "../../lib/guest/guest-runtime-capabilities.mjs";\nimport { buildFactoryGuestDepartmentGroups } from "../../lib/guest/factory-guest-navigation.mjs";\n',
    "contract helper import",
)

contract_anchor = 'test("GuestHub has no Aquamarine identity branches or Aquamarine fallback routing", async () => {\n'
contract_test = '''test("Factory Guest navigation groups configured services by arbitrary target department", async () => {
  const groups = buildFactoryGuestDepartmentGroups([
    {
      id: "extra-towel",
      targetDepartment: "housekeeping",
      factoryDepartmentName: "Housekeeping",
      enabled: true,
      guestVisible: true,
    },
    {
      id: "guest-relations-help",
      targetDepartment: "guest-relations",
      factoryDepartmentName: "Guest Relations",
      enabled: true,
      guestVisible: true,
    },
    {
      id: "hidden-service",
      targetDepartment: "guest-relations",
      enabled: true,
      guestVisible: false,
    },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => [group.departmentCode, group.departmentName, group.requestDefs.map((def) => def.id)]),
    [
      ["housekeeping", "Housekeeping", ["extra-towel"]],
      ["guest-relations", "Guest Relations", ["guest-relations-help"]],
    ],
  );

  const guestHub = await readProjectFile("components/GuestHub.tsx");
  assertContains(guestHub, "buildFactoryGuestDepartmentGroups");
  assertContains(guestHub, "factoryConfiguredDepartmentTiles");
  assertContains(guestHub, "factoryPremiumTiles");
  assertContains(
    guestHub,
    "guestRuntimeCapabilities.factoryManaged\\n    ? factoryPremiumTiles\\n    : legacyPremiumTiles",
  );
});

'''
contract = replace_once(contract, contract_anchor, contract_test + contract_anchor, "contract navigation test")
contract_path.write_text(contract)

print("FACTORY_DATA_DRIVEN_GUEST_NAVIGATION_TRANSFORM_OK")
