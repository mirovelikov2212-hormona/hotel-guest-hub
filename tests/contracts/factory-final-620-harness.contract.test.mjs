import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const script = fs.readFileSync("scripts/factory-final-620-peak.mjs", "utf8");
const vercelConfig = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

test("620 acceptance chooses contention outside the unique massage occupancy window", () => {
  assert.match(script, /action:\s*"services"/);
  assert.match(script, /durationMinutes \+ bufferMinutes/);
  assert.match(script, /slotsDoNotOverlap\(uniqueSlot, slot, massageServiceRuntime\.occupancyMinutes\)/);
  assert.match(script, /candidateStart >= uniqueStart \+ occupancyMinutes/);
  assert.match(script, /1 &&\s*contentionRejected\.length === 19/);
});

test("620 acceptance performance thresholds remain strict", () => {
  assert.match(script, /REQUEST_P95_MS \|\| 3_000/);
  assert.match(script, /SURVEY_P95_MS \|\| 3_000/);
  assert.match(script, /MASSAGE_P95_MS \|\| 4_500/);
  assert.match(script, /performanceAccepted/);
});

test("Vercel Fluid Compute is explicitly enabled for heavy runtime scaling", () => {
  assert.equal(vercelConfig.fluid, true);
});
