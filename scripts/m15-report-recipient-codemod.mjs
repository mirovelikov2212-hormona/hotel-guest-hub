import fs from "node:fs";

const path = "app/api/cron/report-email/route.ts";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`M15_REPORT_CODEMOD_MISSING:${label}`);
  source = source.replace(needle, replacement);
}

replaceOnce(
  'import { getWeeklyReportRecipient, sendReportEmailViaSmtp } from "@/lib/server/report-email-smtp";\n',
  'import { sendReportEmailViaSmtp } from "@/lib/server/report-email-smtp";\nimport { getHotelReportRecipient } from "@/lib/server/reporting-recipient";\n',
  "recipient-import",
);

const recipientBlock = `  const recipientEmail = getWeeklyReportRecipient();\n\n  if (!recipientEmail) {\n    await logSystemError({\n      severity: "critical",\n      source: "cron",\n      eventType: \`\${definition.eventPrefix}_recipient_missing\`,\n      message: "Report email recipient is not configured.",\n      error: new Error("Missing REPORTING_WEEKLY_EMAIL_TO or MONITORING_ALERT_EMAIL_TO."),\n      metadata: { report: definition.key },\n    });\n    return NextResponse.json(\n      { ok: false, error: "Report recipient is not configured.", report: definition.key },\n      { status: 500, headers: NO_STORE_HEADERS },\n    );\n  }\n\n`;
replaceOnce(recipientBlock, "", "global-recipient-block");

replaceOnce(
  "    skippedFailedRetryDisabled: 0,\n    failed: 0,",
  "    skippedFailedRetryDisabled: 0,\n    skippedNoRecipient: 0,\n    failed: 0,",
  "result-counter",
);

replaceOnce(
  "    for (const report of reports) {\n      const periodStart = getRowString(report, definition.periodStartField);",
  `    for (const report of reports) {\n      const recipientEmail = await getHotelReportRecipient(report.hotel_id);\n      if (!recipientEmail) {\n        results.skippedNoRecipient += 1;\n        reportResults.push({\n          report: definition.key,\n          hotelSlug: report.hotel_slug,\n          status: "skipped",\n          reason: "tenant_recipient_not_configured",\n        });\n        continue;\n      }\n\n      const periodStart = getRowString(report, definition.periodStartField);`,
  "per-tenant-recipient",
);

fs.writeFileSync(path, source);
console.log("M15 tenant report recipient codemod complete");
