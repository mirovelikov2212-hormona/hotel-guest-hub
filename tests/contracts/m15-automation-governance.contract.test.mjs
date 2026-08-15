import test from "node:test";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("M15 massage reminders use native booking authority and absolute starts_at windows", async () => {
  const route = await readProjectFile("app/api/cron/massage-reminders/route.ts");
  const workflow = await readProjectFile(".github/workflows/massage-reminders.yml");
  const migration = await readProjectFile(
    "supabase/migrations/20260815190000_m15_native_massage_reminder_governance.sql",
  );

  assertContains(route, '.from("massage_runtime_bookings")');
  assertContains(route, '.eq("status", "confirmed")');
  assertContains(route, '.is("cancelled_at", null)');
  assertContains(route, '.eq("is_test", false)');
  assertContains(route, '.gte("starts_at", windowStart.toISOString())');
  assertContains(route, '.lte("starts_at", windowEnd.toISOString())');
  assertContains(route, '.eq("hotel_id", input.hotelId)');
  assertContains(route, "service_name_i18n");
  assertNotContains(route, '.from("guest_requests")');
  assertNotContains(route, "Europe/Sofia");
  assertNotContains(route, "zonedDateTimeToUtc");

  assertContains(workflow, 'cron: "*/15 * * * *"');
  assertContains(workflow, "concurrency:");
  assertContains(workflow, "--retry 2");
  assertContains(migration, "reminder_push_sent_at timestamptz");
  assertContains(migration, "massage_runtime_bookings_reminder_due_idx");
});

test("M15 reports resolve recipients per tenant and do not globally fall back for new hotels", async () => {
  const route = await readProjectFile("app/api/cron/report-email/route.ts");
  const resolver = await readProjectFile("lib/server/reporting-recipient.ts");
  const migration = await readProjectFile(
    "supabase/migrations/20260815190500_m15_tenant_reporting_delivery.sql",
  );

  assertContains(route, "getHotelReportRecipient(report.hotel_id)");
  assertContains(route, "tenant_recipient_not_configured");
  assertNotContains(route, "const recipientEmail = getWeeklyReportRecipient()");
  assertContains(resolver, '.eq("hotel_id", hotelId)');
  assertContains(resolver, 'REPORTING_SETTING_KEY = "reporting_email_delivery"');
  assertContains(resolver, "legacyEnvironmentRecipient === true");
  assertNotContains(resolver, "aquamarin");
  assertContains(migration, '"legacyEnvironmentRecipient":true');
  assertContains(migration, '"enabled":false');
});

test("M15 scheduled report processing is timezone-neutral and idempotency-driven", async () => {
  const weekly = await readProjectFile(".github/workflows/weekly-report.yml");
  const monthly = await readProjectFile(".github/workflows/monthly-report.yml");
  const reportRoute = await readProjectFile("app/api/cron/report-email/route.ts");

  assertContains(weekly, 'cron: "15 12 * * *"');
  assertContains(monthly, 'cron: "30 12 * * *"');
  assertContains(weekly, "concurrency:");
  assertContains(monthly, "concurrency:");
  assertContains(reportRoute, "loadExistingDeliveryLog");
  assertContains(reportRoute, "already_sent");
  assertContains(reportRoute, "periodStart");
  assertContains(reportRoute, "periodEnd");
});

test("M15 existing Vercel operational crons remain explicit and limited", async () => {
  const vercel = JSON.parse(await readProjectFile("vercel.json"));
  const cronPaths = new Set((vercel.crons || []).map((entry) => entry.path));

  if (!cronPaths.has("/api/cron/day3-survey-push")) {
    throw new Error("day3 survey cron must remain scheduled");
  }
  if (!cronPaths.has("/api/cron/test-data-cleanup")) {
    throw new Error("test-data cleanup cron must remain scheduled");
  }
  if (cronPaths.has("/api/cron/massage-reminders")) {
    throw new Error("massage reminders must have one scheduler authority, GitHub Actions, not duplicate Vercel scheduling");
  }
});
