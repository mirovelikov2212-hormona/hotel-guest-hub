from pathlib import Path
import json
import re

path = Path("components/GuestHub.tsx")
source = path.read_text()


def sub_once(pattern, replacement, *, flags=0, label="replacement"):
    global source
    source, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")


def replace_once(old, new, label):
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    source = source.replace(old, new, 1)


import_anchor = 'import type { HotelConfig, LangKey, HubSection, DepartmentKey, HubItem, RequestDef } from "@/lib/types";\n'
replace_once(
    import_anchor,
    import_anchor + 'import { deriveGuestRuntimeCapabilities } from "@/lib/guest/guest-runtime-capabilities.mjs";\n',
    "capability import",
)

sub_once(
    r'(export default function GuestHub\(\{ config \}: \{ config: HotelConfig \}\) \{\n)'
    r'  const guestHubPathname = usePathname\(\);\n'
    r'  const isAquamarineHub = .*?;\n',
    r'''\1  const guestRuntimeCapabilities = useMemo(
    () => deriveGuestRuntimeCapabilities({
      hotelSlug: config.hotelSlug,
      publicSlug: config.publicSlug,
      coverImage: config.coverImage,
      requestDefs: config.requestDefs,
    }),
    [config.coverImage, config.hotelSlug, config.publicSlug, config.requestDefs]
  );
''',
    flags=re.S,
    label="GuestHub tenant identity header",
)

sub_once(
    r'\n      const defId = String\(def\.id \|\| ""\)\.trim\(\)\.toLowerCase\(\);\n'
    r'      const requestType = String\(def\.requestType \|\| ""\)\.trim\(\)\.toLowerCase\(\);\n'
    r'      const currentHotelSlug = String\(\(config as any\)\?\.hotelSlug \|\| ""\)\.trim\(\)\.toLowerCase\(\);\n'
    r'      const isAquamarine =.*?\n'
    r'      const isCoffeeCapsules = .*?;\n\n'
    r'      // Keep old descriptive texts from Google Sheets consistent with the\n'
    r'      // current Aquamarine unit price until the sheet cache is refreshed\.\n'
    r'      if \(isAquamarine && isCoffeeCapsules\) \{\n'
    r'        return rawMessage\.replace\(.*?\);\n'
    r'      \}\n',
    "\n",
    flags=re.S,
    label="coffee message tenant patch",
)

sub_once(
    r'\n  function isAquamarineCoffeeCapsulesRequest\(def: RequestDef\) \{.*?\n  \}\n\n',
    "\n",
    flags=re.S,
    label="coffee tenant predicate",
)
replace_once('    if (isAquamarineCoffeeCapsulesRequest(def)) return "2,05";\n', "", "coffee price override")
replace_once('    if (isAquamarineCoffeeCapsulesRequest(def)) return "€";\n', "", "coffee currency override")

sub_once(
    r'\nconst GAME_ROOM_PRICING_BY_LANG: Record<string, string> = \{.*?\n\};\n',
    "\n",
    flags=re.S,
    label="games-room pricing constant",
)

sub_once(
    r'  const hotelContentSlug = String\(\(config as any\)\?\.hotelSlug \|\| ""\)\.trim\(\)\.toLowerCase\(\);\n'
    r'  const isAquamarineHotel =.*?\n\n'
    r'  const rawVenueRows = .*?\n\n  const groupedOutlets = useMemo',
    '''  const hotelContentSlug = guestRuntimeCapabilities.hotelSlug;

  const rawVenueRows = (((config as any).venueRows ?? []) as Array<VenueRow>)
    .filter(
      (v) => v && (v.name || getVenueText(v, "name", lang)) && (v.type || v.category) && v.active !== false
    );

  const groupedOutlets = useMemo''',
    flags=re.S,
    label="tenant-specific venue normalization",
)

sub_once(
    r'  const massageBookingDef = requestDefs\.find\(\(def\) => isMassageRequestDef\(def\)\) \|\| null;\n'
    r'  const massageBookingPreviewVisible =\n'
    r'    Boolean\(massageBookingDef\) && Boolean\(hotelContentSlug\) && isAquamarineHotel;',
    '  const massageBookingPreviewVisible =\n    guestRuntimeCapabilities.massageBookingEnabled && Boolean(hotelContentSlug);',
    label="massage capability gate",
)
sub_once(
    r'  // Aquamarine\'s Spa Center keeps only its venue information and working hours\.\n'
    r'  // Massage selection moves into the separate top-level “Book a massage” section below\.\n'
    r'  const spaRequestDefItems =\n'
    r'    massageBookingPreviewVisible && isAquamarineHotel\n'
    r'      \? \[\]\n'
    r'      : buildRequestDefItems\("spa"\);',
    '  // Hotels with a dedicated massage booking capability keep massage selection in the top-level booking flow.\n  const spaRequestDefItems = massageBookingPreviewVisible ? [] : buildRequestDefItems("spa");',
    label="spa massage placement gate",
)

replace_once(
    '''  const coffeeCapsulesPrice = coffeeCapsulesRequestDef
    ? String(getRequestDefEffectivePrice(coffeeCapsulesRequestDef) || "2,05").trim()
    : "2,05";
  const coffeeCapsulesCurrency = coffeeCapsulesRequestDef
    ? String(getRequestDefEffectiveCurrency(coffeeCapsulesRequestDef) || "€").trim() || "€"
    : "€";
''',
    '''  const coffeeCapsulesPrice = coffeeCapsulesRequestDef
    ? String(getRequestDefEffectivePrice(coffeeCapsulesRequestDef) || "").trim()
    : "";
  const coffeeCapsulesCurrency = coffeeCapsulesRequestDef
    ? String(getRequestDefEffectiveCurrency(coffeeCapsulesRequestDef) || "").trim()
    : "";
''',
    "coffee configured price",
)

sub_once(
    r'  const toHotelInfoHubItem = useCallback\(\n.*?\n  \);\n\n  const toAnimationHubItem = useCallback',
    '''  const toHotelInfoHubItem = useCallback(
    (item: any): HubItem => {
      const identity = getHotelInfoIdentity(item);
      let icon = item?.icon ? String(item.icon).trim() : "";
      let title = getHotelInfoText(item, "title");
      let info = getHotelInfoText(item, "text");
      const stableKey = String(item?.key || item?.id || "").trim().toLowerCase();
      const isRestaurantHoursInfo =
        ["breakfast", "breakfast_hours", "info_breakfast"].includes(stableKey) ||
        /(^|\\s)(breakfast|закуска|frühstück|mic dejun|snídaně)(\\s|$)/i.test(identity);

      if (isRestaurantHoursInfo && restaurantHoursText) {
        const languageKey = ["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang)) ? String(lang) : "en";
        icon = "🍽️";
        title = RESTAURANT_HOURS_TITLE_BY_LANG[languageKey] || RESTAURANT_HOURS_TITLE_BY_LANG.en;
        info = restaurantHoursText;
      }

      const isCoffeeCapsulesInfo =
        stableKey === "coffee_capsules" ||
        /coffee.?capsule|кафе.?капсул|kaffeekapsel|capsule de cafea|kávové kapsle/i.test(identity);

      if (isCoffeeCapsulesInfo && info && coffeeCapsulesPrice) {
        const displayPrice = [coffeeCapsulesPrice, coffeeCapsulesCurrency].filter(Boolean).join(" ").trim();
        const replaced = info.replace(/\\d+(?:[.,]\\d{1,2})?\\s*(?:€|EUR)/i, displayPrice);
        info = replaced === info && !info.includes(displayPrice) ? `${info} ${displayPrice}`.trim() : replaced;
      }

      return {
        label: `${icon ? `${icon} ` : ""}${title}`.trim(),
        kind: "info" as const,
        info,
      };
    },
    [
      coffeeCapsulesCurrency,
      coffeeCapsulesPrice,
      getHotelInfoIdentity,
      getHotelInfoText,
      lang,
      restaurantHoursText,
    ]
  );

  const toAnimationHubItem = useCallback''',
    flags=re.S,
    label="generic hotel info normalization",
)

sub_once(
    r'  const hotelAreaSearchQuery = String\(\n'
    r'    \[config\.hotelName, config\.location\?\.query\]\n'
    r'      \.map\(\(item\) => String\(item \|\| ""\)\.trim\(\)\)\n'
    r'      \.filter\(Boolean\)\n'
    r'      \.join\(", "\) \|\|\n'
    r'    "Hotel Aquamarine Kranevo, Kranevo, Bulgaria"\n'
    r'  \)\.replace\(/,\\s\*Bulgaria,\\s\*Bulgaria\$/i, ", Bulgaria"\);',
    '''  const hotelAreaSearchQuery = String(
    [config.hotelName, config.location?.query]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ")
  ).replace(/,\\s*Bulgaria,\\s*Bulgaria$/i, ", Bulgaria");''',
    label="maps tenant fallback",
)
replace_once(
    '  const nearbyAnchorQuery = hotelAreaSearchQuery || "Hotel Aquamarine Kranevo, Kranevo, Bulgaria";\n',
    '  const nearbyAnchorQuery = hotelAreaSearchQuery;\n',
    "nearby tenant fallback",
)

sub_once(
    r'  const recommendedPlaceLang = .*?\n\n  const exploreSection = hotelAreaSearchQuery',
    '''  const configuredExplorePlaces: HubItem[] = hotelInfoItems
    .filter(
      (item) =>
        item &&
        item.active !== false &&
        String(item?.uiSectionId || "").trim().toLowerCase() === "explore"
    )
    .map((item) => {
      const href = String(item?.linkUrl || "").trim();
      const title = getHotelInfoText(item, "title");
      if (!href || !title) return null;
      const icon = String(item?.icon || "📍").trim();
      return {
        label: `${icon ? `${icon} ` : ""}${title}`.trim(),
        kind: "link" as const,
        href,
        newTab: true,
      } satisfies HubItem;
    })
    .filter((item): item is HubItem => Boolean(item));

  const exploreSection = hotelAreaSearchQuery''',
    flags=re.S,
    label="configured explore recommendations",
)
replace_once('        ...aquamarineRecommendedPlaces,\n', '        ...configuredExplorePlaces,\n', "explore item injection")

sub_once(
    r'      <div className=\{isAquamarineHub \? "relative stayhub-premium-hero-wrap-sandbox" : "relative"\}>\n'
    r'        <div className=\{isAquamarineHub \? .*?\n'
    r'          <img\n'
    r'            src=\{isAquamarineHub \? .*?\n'
    r'            alt=\{config\.hotelName\}\n'
    r'            className=\{isAquamarineHub \? .*?\n'
    r'            style=\{isAquamarineHub \? undefined : \{ objectPosition: config\.coverImagePosition \|\| "center center" \}\}\n'
    r'          />',
    '''      <div className="relative">
        <div className="stayhub-premium-hero relative h-[246px] sm:h-[270px] md:h-[300px] w-full overflow-hidden">
          <img
            src={guestRuntimeCapabilities.coverImage}
            alt={config.hotelName || "StayHub"}
            className="h-full w-full object-cover"
            style={{ objectPosition: config.coverImagePosition || "center center" }}
          />''',
    flags=re.S,
    label="config-driven hero",
)

lower = source.lower()
forbidden = [
    "isaquamarinehub",
    "isaquamarinehotel",
    "isaquamarinecoffeecapsulesrequest",
    '"aquamarine"',
    '"aquamarin"',
    "hotel aquamarine",
    "/h/aquamarine",
    "/images/aquamarine-test-hero-v6.jpg",
    "del mar fish restaurant & bbq",
    "izvora-kranevo.com",
    "game_room_pricing_by_lang",
    "2,05 €",
]
leftovers = [item for item in forbidden if item in lower]
if leftovers:
    raise SystemExit(f"forbidden shared GuestHub leftovers: {leftovers}")

path.write_text(source)

package_path = Path("package.json")
package = json.loads(package_path.read_text())
contract = "tests/contracts/shared-guest-runtime-genericization.contract.test.mjs"
test_contracts = package["scripts"]["test:contracts"]
if contract not in test_contracts:
    package["scripts"]["test:contracts"] = test_contracts + " " + contract
package["scripts"]["test:shared-guest-runtime"] = f"node --test {contract}"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")
