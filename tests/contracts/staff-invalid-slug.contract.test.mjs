import test from "node:test";
import {
  assertBefore,
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("invalid Staff Hub hotel slugs resolve to notFound instead of a server error", async () => {
  const source = await readProjectFile("app/staff/[hotelSlug]/layout.tsx");

  assertContains(source, "try {");
  assertContains(source, "hotelId = await getHotelIdBySlug(hotelSlug)");
  assertContains(source, "} catch {");
  assertContains(source, "notFound();");
  assertBefore(
    source,
    "hotelId = await getHotelIdBySlug(hotelSlug)",
    "notFound();",
    "Unknown Staff Hub slugs must be converted to a 404 instead of escaping as a 500.",
  );
});
