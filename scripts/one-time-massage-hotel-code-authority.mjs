import { readFile, writeFile } from "node:fs/promises";

const LEGACY_PATH = "lib/server/massage-api-legacy.ts";
const WRAPPER_PATH = "lib/server/massage-api.ts";

function replaceExact(source, from, to, expectedCount, label) {
  const actualCount = source.split(from).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} occurrence(s), found ${actualCount}`);
  }
  return source.split(from).join(to);
}

let legacy = await readFile(LEGACY_PATH, "utf8");
let wrapper = await readFile(WRAPPER_PATH, "utf8");

legacy = replaceExact(
  legacy,
  "export function getMassageHotelCode(inputHotelSlug: unknown) {\n",
  `export function getMassageHotelCode(inputHotelSlug: unknown, explicitHotelCode?: unknown) {\n  explicitHotelCode = String(explicitHotelCode || \"\")\n    .trim()\n    .toUpperCase()\n    .replace(/[^A-Z0-9]+/g, \"\")\n    .slice(0, 6);\n  if (explicitHotelCode) return explicitHotelCode;\n\n`,
  1,
  "explicit hotel-code helper signature",
);

legacy = replaceExact(
  legacy,
  `export function buildMassageStayHubSheetRoomMarker(input: {\n  hotelSlug: unknown;\n  room: unknown;\n}) {\n  const room = String(input.room || \"\").trim();\n  const hotelCode = getMassageHotelCode(input.hotelSlug);`,
  `export function buildMassageStayHubSheetRoomMarker(input: {\n  hotelSlug: unknown;\n  hotelCode?: unknown;\n  room: unknown;\n}) {\n  const room = String(input.room || \"\").trim();\n  const hotelCode = getMassageHotelCode(input.hotelSlug, input.hotelCode);`,
  1,
  "room marker hotel-code propagation",
);

for (const functionPrefix of [
  "async function verifyMassageBookingAfterAmbiguousFailure(input: {\n  hotelSlug: unknown;\n",
  "export async function createMassageBooking(input: {\n  hotelSlug: unknown;\n",
  "export async function verifyMassageBooking(input: {\n  hotelSlug: unknown;\n",
  "export async function createMassageControlledE2EBooking(input: {\n  hotelSlug: unknown;\n",
]) {
  legacy = replaceExact(
    legacy,
    functionPrefix,
    `${functionPrefix}  hotelCode?: unknown;\n`,
    1,
    `write input hotelCode field: ${functionPrefix.split("(")[0].trim()}`,
  );
}

legacy = replaceExact(
  legacy,
  "stayhubHotelCode: getMassageHotelCode(input.hotelSlug),",
  "stayhubHotelCode: getMassageHotelCode(input.hotelSlug, input.hotelCode),",
  4,
  "legacy write/verify hotel-code payloads",
);

legacy = replaceExact(
  legacy,
  `stayhubRoomMarker: buildMassageStayHubSheetRoomMarker({\n        hotelSlug: input.hotelSlug,\n        room: input.room,\n      }),`,
  `stayhubRoomMarker: buildMassageStayHubSheetRoomMarker({\n        hotelSlug: input.hotelSlug,\n        hotelCode: input.hotelCode,\n        room: input.room,\n      }),`,
  3,
  "standard legacy write/verify room markers",
);

legacy = replaceExact(
  legacy,
  `stayhubRoomMarker: buildMassageStayHubSheetRoomMarker({\n          hotelSlug: input.hotelSlug,\n          room: input.room,\n        }),`,
  `stayhubRoomMarker: buildMassageStayHubSheetRoomMarker({\n          hotelSlug: input.hotelSlug,\n          hotelCode: input.hotelCode,\n          room: input.room,\n        }),`,
  1,
  "nested booking room marker",
);

wrapper = replaceExact(
  wrapper,
  "return legacy.createMassageBooking({ ...input, hotelSlug: source.hotel.slug });",
  "return legacy.createMassageBooking({ ...input, hotelSlug: source.hotel.slug, hotelCode: source.config.hotel_code });",
  1,
  "guarded booking hotel_code",
);

wrapper = replaceExact(
  wrapper,
  "return legacy.verifyMassageBooking({ ...input, hotelSlug: source.hotel.slug });",
  "return legacy.verifyMassageBooking({ ...input, hotelSlug: source.hotel.slug, hotelCode: source.config.hotel_code });",
  1,
  "guarded verification hotel_code",
);

wrapper = replaceExact(
  wrapper,
  `return legacy.createMassageControlledE2EBooking({\n    ...input,\n    hotelSlug: source.hotel.slug,\n  });`,
  `return legacy.createMassageControlledE2EBooking({\n    ...input,\n    hotelSlug: source.hotel.slug,\n    hotelCode: source.config.hotel_code,\n  });`,
  1,
  "guarded controlled E2E hotel_code",
);

const wrapperConfiguredCodeCount = (wrapper.match(/hotelCode: source\.config\.hotel_code/g) || []).length;
if (wrapperConfiguredCodeCount !== 3) {
  throw new Error(`wrapper configured hotel_code guard: expected 3, found ${wrapperConfiguredCodeCount}`);
}

const legacyExplicitCodeCount = (legacy.match(/getMassageHotelCode\(input\.hotelSlug, input\.hotelCode\)/g) || []).length;
if (legacyExplicitCodeCount !== 5) {
  throw new Error(`legacy explicit hotel_code propagation: expected 5, found ${legacyExplicitCodeCount}`);
}

const markerCodeCount = (legacy.match(/hotelCode: input\.hotelCode/g) || []).length;
if (markerCodeCount !== 4) {
  throw new Error(`legacy marker hotel_code propagation: expected 4, found ${markerCodeCount}`);
}

await writeFile(LEGACY_PATH, legacy, "utf8");
await writeFile(WRAPPER_PATH, wrapper, "utf8");

console.log("Guarded massage hotel_code authority patch applied successfully.");
