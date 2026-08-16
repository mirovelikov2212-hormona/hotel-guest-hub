import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("day3 survey persistence uses guest_surveys as the canonical source", async () => {
  const source = await readProjectFile("app/api/guest/day3-survey/route.ts");

  assertContains(source, '.from("guest_surveys")');
  assertContains(source, '.eq("stay_id", input.stayId)');
  assertContains(source, '.eq("stay_device_id", input.stayDeviceId)');
  assertContains(source, '.eq("survey_type", "day3_guest_survey")');
  assertContains(source, 'error?.code === "23505"');
  assertContains(source, "getOperationalIsolationFields({ hotel, testRoomPolicy })");
  assertContains(source, "...isolationFields");

  assertNotContains(
    source,
    '.from("hub_events")',
    "Survey persistence must not depend on analytics events as its source of truth.",
  );
});

test("report email delivery keeps persistent duplicate protection", async () => {
  const source = await readProjectFile("app/api/cron/report-email/route.ts");

  assertContains(source, '.from("reporting_email_delivery_log")');
  assertContains(source, '.eq("hotel_id", input.hotelId)');
  assertContains(source, '.eq("report_type", input.reportType)');
  assertContains(source, '.eq("period_start", input.periodStart)');
  assertContains(source, '.eq("period_end", input.periodEnd)');
  assertContains(source, ".maybeSingle()");
  assertContains(source, 'existing.delivery_status === "sent"');
  assertContains(source, 'existing.delivery_status === "pending"');
  assertContains(source, 'maybeCode !== UNIQUE_VIOLATION_CODE');
});

test("report email queries keep sandbox exclusion at the application boundary", async () => {
  const source = await readProjectFile("app/api/cron/report-email/route.ts");

  assertContains(source, '.eq("is_sandbox", false)');
  assert.equal(
    source.includes('hotel_slug", "demo"'),
    false,
    "Report delivery must not use a demo slug as its environment boundary.",
  );
});

test("weekly report endpoint keeps duplicate-delivery protection too", async () => {
  const source = await readProjectFile("app/api/cron/weekly-report/route.ts");

  assertContains(source, '.from("reporting_email_delivery_log")');
  assertContains(source, 'existing.delivery_status === "sent"');
  assertContains(source, 'existing.delivery_status === "pending"');
  assertContains(source, 'maybeCode !== UNIQUE_VIOLATION_CODE');
  assertContains(source, '.eq("is_sandbox", false)');
});


test("manager survey report shows the arithmetic mean across all report surveys", async () => {
  const source = await readProjectFile("components/staff/StaffSurveyCards.tsx");
  assertContains(source, "const overallAverageRating = useMemo(");
  assertContains(source, "surveys.reduce((sum, survey) => sum + survey.rating, 0) / surveys.length");
  assertContains(source, "{copy.averageRating}: {overallAverageRating.toFixed(1)}/5");
});
