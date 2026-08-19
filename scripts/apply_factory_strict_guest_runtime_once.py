from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    return source.replace(old, new, 1)


guest_path = Path("components/GuestHub.tsx")
guest = guest_path.read_text(encoding="utf-8")

fallback_anchor = "...(!requestDefIds.has("
fallback_count = guest.count(fallback_anchor)
if fallback_count < 10:
    raise SystemExit(
        f"legacy request fallback guard: expected at least 10 matches, got {fallback_count}"
    )
guest = guest.replace(
    fallback_anchor,
    "...(guestRuntimeCapabilities.legacyRequestFallbacksEnabled && !requestDefIds.has(",
)
if fallback_anchor in guest:
    raise SystemExit("legacy request fallback guard: unguarded fallback remains")

guest = replace_once(
    guest,
    '{ id: "pillow_menu", iconId: "pillow", title: getPremiumServiceTitle(lang, "sleepPillows"), section: pillowMenuSection, requiresRoom: true },',
    '{ id: "pillow_menu", iconId: "pillow", title: getPremiumServiceTitle(lang, "sleepPillows"), section: pillowMenuDef || guestRuntimeCapabilities.legacyRequestFallbacksEnabled ? pillowMenuSection : null, requiresRoom: true },',
    "pillow premium strict gate",
)
guest = replace_once(
    guest,
    '{ id: "coffee_capsules", iconId: "coffee", title: getPremiumServiceTitle(lang, "orderCoffeeCapsules"), section: coffeeCapsulesSection, requiresRoom: true },',
    '{ id: "coffee_capsules", iconId: "coffee", title: getPremiumServiceTitle(lang, "orderCoffeeCapsules"), section: coffeeCapsulesDef || guestRuntimeCapabilities.legacyRequestFallbacksEnabled ? coffeeCapsulesSection : null, requiresRoom: true },',
    "coffee premium strict gate",
)
guest = replace_once(
    guest,
    '{ id: "reviews", iconId: "reviews", title: lang === "bg" ? "Отзиви" : reviewsDisplaySection.title, section: reviewsDisplaySection, requiresRoom: true },',
    '{ id: "reviews", iconId: "reviews", title: lang === "bg" ? "Отзиви" : reviewsDisplaySection.title, section: reviewsCombinedSection || (guestRuntimeCapabilities.legacyRequestFallbacksEnabled ? reviewsDisplaySection : null), requiresRoom: true },',
    "reviews premium strict gate",
)
guest = replace_once(
    guest,
    '  ].filter((tile) => tile.section || tile.special === "massage" || tile.special === "emergency");',
    '  ].filter((tile) =>\n    tile.section ||\n    (tile.special === "massage" && massageBookingPreviewVisible) ||\n    (tile.special === "emergency" &&\n      (Boolean(emergencyTileSection) || guestRuntimeCapabilities.legacyRequestFallbacksEnabled))\n  );',
    "premium special capability filter",
)

if "guestRuntimeCapabilities.legacyRequestFallbacksEnabled" not in guest:
    raise SystemExit("GuestHub strict capability marker missing after transform")
if 'tile.special === "massage" && massageBookingPreviewVisible' not in guest:
    raise SystemExit("GuestHub massage capability gate missing after transform")

guest_path.write_text(guest, encoding="utf-8")

route_path = Path("app/api/guest/request-create/route.ts")
route = route_path.read_text(encoding="utf-8")
route = replace_once(
    route,
    'import { resolveGuestRequestAuthority } from "@/lib/server/guest-request-authority.mjs";\n',
    'import { resolveGuestRequestAuthority } from "@/lib/server/guest-request-authority.mjs";\nimport { isFactoryManagedGuestConfig } from "@/lib/guest/guest-runtime-capabilities.mjs";\n',
    "request-create strict capability import",
)
route = replace_once(
    route,
    '      requestDefs: hotelConfig?.requestDefs,\n      rawType,\n',
    '      requestDefs: hotelConfig?.requestDefs,\n      strictConfiguredRequests: isFactoryManagedGuestConfig(hotelConfig),\n      rawType,\n',
    "request-create strict authority flag",
)

if "strictConfiguredRequests: isFactoryManagedGuestConfig(hotelConfig)" not in route:
    raise SystemExit("request-create strict authority marker missing after transform")

route_path.write_text(route, encoding="utf-8")

print(
    f"Factory strict Guest runtime transform complete; guarded legacy fallback count={fallback_count}"
)
