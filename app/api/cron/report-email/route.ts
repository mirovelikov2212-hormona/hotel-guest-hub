import { NextRequest, NextResponse } from "next/server";

import {
  buildMonthlyReportEmail,
  buildWeeklyReportEmail,
  type MonthlyReportRow,
  type WeeklyReportRow,
} from "@/lib/server/weekly-report-email";
import { getWeeklyReportRecipient, sendReportEmailViaSmtp } from "@/lib/server/report-email-smtp";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const UNIQUE_VIOLATION_CODE = "23505";

type ReportKey = "weekly" | "monthly-current" | "monthly-latest-completed";

type ReportRowBase = Record<string, unknown> & {
  hotel_id: string;
  hotel_slug: string;
  is_sandbox: boolean | null;
  report_period_label: string | null;
};

type DeliveryLogRow = {
  id: string;
  delivery_status: string;
  sent_at: string | null;
  error_message: string | null;
};

type ReportDefinition = {
  key: ReportKey;
  viewName: string;
  reportType: string;
  periodStartField: string;
  periodEndField: string;
  eventPrefix: string;
  emailHeaderReportType: string;
  buildEmail: (row: ReportRowBase) => { subject: string; text: string; html: string };
};

const REPORT_DEFINITIONS: Record<ReportKey, ReportDefinition> = {
  weekly: {
    key: "weekly",
    viewName: "reporting_latest_completed_week_email_report_v1",
    reportType: "weekly",
    periodStartField: "week_start_date",
    periodEndField: "week_end_date",
    eventPrefix: "weekly_report",
    emailHeaderReportType: "weekly",
    buildEmail: (row) => buildWeeklyReportEmail(row as WeeklyReportRow),
  },
  "monthly-current": {
    key: "monthly-current",
    viewName: "reporting_current_month_to_date_email_report_v1",
    reportType: "monthly_current",
    periodStartField: "month_start_date",
    periodEndField: "month_end_date",
    eventPrefix: "monthly_current_report",
    emailHeaderReportType: "monthly-current",
    buildEmail: (row) => buildMonthlyReportEmail(row as MonthlyReportRow),
  },
  "monthly-latest-completed": {
    key: "monthly-latest-completed",
    viewName: "reporting_latest_completed_month_email_report_v1",
    reportType: "monthly",
    periodStartField: "month_start_date",
    periodEndField: "month_end_date",
    eventPrefix: "monthly_report",
    emailHeaderReportType: "monthly",
    buildEmail: (row) => buildMonthlyReportEmail(row as MonthlyReportRow),
  },
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";

  if (configuredSecret) {
    return authorization === `Bearer ${configuredSecret}`;
  }

  return req.headers.get("x-vercel-cron") === "1";
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "Unknown error").slice(0, 1000);
  }
  return String(error || "Unknown error").slice(0, 1000);
}

function readBooleanParam(req: NextRequest, name: string) {
  const value = String(req.nextUrl.searchParams.get(name) || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function readReportKey(req: NextRequest): ReportKey | null {
  const value = String(req.nextUrl.searchParams.get("report") || "weekly").trim().toLowerCase();
  if (value in REPORT_DEFINITIONS) return value as ReportKey;
  return null;
}

function getRowString(row: ReportRowBase, field: string) {
  return String(row[field] || "").trim();
}

async function loadExistingDeliveryLog(input: {
  hotelId: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  recipientEmail: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("reporting_email_delivery_log")
    .select("id, delivery_status, sent_at, error_message")
    .eq("hotel_id", input.hotelId)
    .eq("report_type", input.reportType)
    .eq("period_start", input.periodStart)
    .eq("period_end", input.periodEnd)
    .ilike("recipient_email", input.recipientEmail)
    .maybeSingle();

  if (error) throw error;
  return data as DeliveryLogRow | null;
}

async function createPendingDeliveryLog(input: {
  report: ReportRowBase;
  definition: ReportDefinition;
  recipientEmail: string;
  subject: string;
  periodStart: string;
  periodEnd: string;
}) {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("reporting_email_delivery_log")
    .insert({
      hotel_id: input.report.hotel_id,
      hotel_slug: input.report.hotel_slug,
      report_type: input.definition.reportType,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      recipient_email: input.recipientEmail,
      subject: input.subject,
      delivery_status: "pending",
      created_at: now,
      updated_at: now,
      metadata: {
        source: "report_email_cron",
        report: input.definition.key,
        reportPeriodLabel: input.report.report_period_label,
      },
    })
    .select("id, delivery_status, sent_at, error_message")
    .single();

  if (error) throw error;
  return data as DeliveryLogRow;
}

async function updateDeliveryLog(input: {
  logId: string;
  status: "sent" | "failed";
  providerMessageId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    delivery_status: input.status,
    provider_message_id: input.providerMessageId || null,
    error_message: input.errorMessage || null,
    updated_at: now,
    metadata: input.metadata || {},
  };

  if (input.status === "sent") patch.sent_at = now;

  const { error } = await supabaseAdmin
    .from("reporting_email_delivery_log")
    .update(patch)
    .eq("id", input.logId);

  if (error) throw error;
}

async function resetFailedDeliveryLog(input: {
  logId: string;
  definition: ReportDefinition;
  subject: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("reporting_email_delivery_log")
    .update({
      delivery_status: "pending",
      subject: input.subject,
      error_message: null,
      provider_message_id: null,
      sent_at: null,
      updated_at: new Date().toISOString(),
      metadata: {
        source: "report_email_cron",
        report: input.definition.key,
        retry: true,
      },
    })
    .eq("id", input.logId)
    .select("id, delivery_status, sent_at, error_message")
    .single();

  if (error) throw error;
  return data as DeliveryLogRow;
}

function shouldSendExistingLog(existing: DeliveryLogRow | null, retryFailed: boolean) {
  if (!existing) return { send: true, reason: "new" };
  if (existing.delivery_status === "sent") return { send: false, reason: "already_sent" };
  if (existing.delivery_status === "pending") return { send: false, reason: "already_pending" };
  if (existing.delivery_status === "failed" && retryFailed) return { send: true, reason: "retry_failed" };
  if (existing.delivery_status === "failed") return { send: false, reason: "previous_failed_retry_disabled" };
  return { send: false, reason: `existing_${existing.delivery_status}` };
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const reportKey = readReportKey(req);
  if (!reportKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid report parameter.",
        allowedReports: Object.keys(REPORT_DEFINITIONS),
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const definition = REPORT_DEFINITIONS[reportKey];
  const dryRun = readBooleanParam(req, "dryRun");
  const retryFailed = readBooleanParam(req, "retryFailed");
  const hotelSlugFilter = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim();
  const recipientEmail = getWeeklyReportRecipient();

  if (!recipientEmail) {
    await logSystemError({
      severity: "critical",
      source: "cron",
      eventType: `${definition.eventPrefix}_recipient_missing`,
      message: "Report email recipient is not configured.",
      error: new Error("Missing REPORTING_WEEKLY_EMAIL_TO or MONITORING_ALERT_EMAIL_TO."),
      metadata: { report: definition.key },
    });
    return NextResponse.json(
      { ok: false, error: "Report recipient is not configured.", report: definition.key },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const results = {
    report: definition.key,
    checked: 0,
    sent: 0,
    skippedDuplicate: 0,
    skippedPending: 0,
    skippedFailedRetryDisabled: 0,
    failed: 0,
    dryRun: dryRun ? 1 : 0,
  };

  try {
    let query = supabaseAdmin
      .from(definition.viewName)
      .select("*")
      .eq("is_sandbox", false)
      .order("hotel_slug", { ascending: true });

    if (hotelSlugFilter) query = query.eq("hotel_slug", hotelSlugFilter);

    const { data, error } = await query;
    if (error) throw error;

    const reports = (data || []) as ReportRowBase[];
    results.checked = reports.length;

    if (!reports.length) {
      await logSystemEvent({
        severity: "info",
        source: "cron",
        eventType: `${definition.eventPrefix}_no_rows_found`,
        message: "Report email cron found no report rows to send.",
        metadata: { report: definition.key, viewName: definition.viewName, hotelSlugFilter: hotelSlugFilter || null },
      });
      return NextResponse.json({ ok: true, results, reports: [] }, { headers: NO_STORE_HEADERS });
    }

    const reportResults: Array<Record<string, unknown>> = [];

    for (const report of reports) {
      const periodStart = getRowString(report, definition.periodStartField);
      const periodEnd = getRowString(report, definition.periodEndField);
      const email = definition.buildEmail(report);
      let logRow: DeliveryLogRow | null = null;

      try {
        if (!periodStart || !periodEnd) {
          throw new Error(`Report row is missing ${definition.periodStartField} or ${definition.periodEndField}.`);
        }

        const existing = await loadExistingDeliveryLog({
          hotelId: report.hotel_id,
          reportType: definition.reportType,
          periodStart,
          periodEnd,
          recipientEmail,
        });
        const existingDecision = shouldSendExistingLog(existing, retryFailed);

        if (!existingDecision.send) {
          if (existingDecision.reason === "already_sent") results.skippedDuplicate += 1;
          else if (existingDecision.reason === "already_pending") results.skippedPending += 1;
          else if (existingDecision.reason === "previous_failed_retry_disabled") results.skippedFailedRetryDisabled += 1;

          reportResults.push({
            report: definition.key,
            hotelSlug: report.hotel_slug,
            periodStart,
            periodEnd,
            status: dryRun ? "dry_run_would_skip" : "skipped",
            reason: existingDecision.reason,
            logId: existing?.id || null,
          });
          continue;
        }

        if (dryRun) {
          reportResults.push({
            report: definition.key,
            hotelSlug: report.hotel_slug,
            periodStart,
            periodEnd,
            status: "dry_run_ready",
            logId: null,
            subject: email.subject,
          });
          continue;
        }

        if (existing && existingDecision.reason === "retry_failed") {
          logRow = await resetFailedDeliveryLog({ logId: existing.id, definition, subject: email.subject });
        } else {
          try {
            logRow = await createPendingDeliveryLog({
              report,
              definition,
              recipientEmail,
              subject: email.subject,
              periodStart,
              periodEnd,
            });
          } catch (insertError) {
            const maybeCode = (insertError as { code?: unknown })?.code;
            if (maybeCode !== UNIQUE_VIOLATION_CODE) throw insertError;

            const duplicate = await loadExistingDeliveryLog({
              hotelId: report.hotel_id,
              reportType: definition.reportType,
              periodStart,
              periodEnd,
              recipientEmail,
            });
            results.skippedDuplicate += 1;
            reportResults.push({
              report: definition.key,
              hotelSlug: report.hotel_slug,
              periodStart,
              periodEnd,
              status: "skipped",
              reason: "unique_duplicate",
              logId: duplicate?.id || null,
            });
            continue;
          }
        }

        if (!logRow) {
          throw new Error("Report delivery log was not created before sending.");
        }

        const delivery = await sendReportEmailViaSmtp({
          to: recipientEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
          fromName: "StayHub Reports",
          headers: {
            "X-StayHub-Report": definition.emailHeaderReportType,
            "X-StayHub-Hotel": report.hotel_slug,
            "X-StayHub-Report-Period": `${periodStart}_${periodEnd}`,
          },
        });

        await updateDeliveryLog({
          logId: logRow.id,
          status: "sent",
          providerMessageId: delivery.providerMessageId,
          metadata: {
            source: "report_email_cron",
            report: definition.key,
            reportType: definition.reportType,
            hotelSlug: report.hotel_slug,
            periodStart,
            periodEnd,
          },
        });

        results.sent += 1;
        reportResults.push({
          report: definition.key,
          hotelSlug: report.hotel_slug,
          periodStart,
          periodEnd,
          status: "sent",
          logId: logRow.id,
        });
      } catch (reportError) {
        results.failed += 1;

        if (logRow?.id) {
          await updateDeliveryLog({
            logId: logRow.id,
            status: "failed",
            errorMessage: normalizeErrorMessage(reportError),
            metadata: {
              source: "report_email_cron",
              report: definition.key,
              reportType: definition.reportType,
              hotelSlug: report.hotel_slug,
              periodStart,
              periodEnd,
            },
          }).catch((logUpdateError) => {
            console.error("Failed to update report delivery log after failure", logUpdateError);
          });
        }

        await logSystemError({
          severity: "critical",
          source: "cron",
          eventType: `${definition.eventPrefix}_delivery_failed`,
          message: "Report email delivery failed for one hotel/period.",
          error: reportError,
          metadata: {
            report: definition.key,
            reportType: definition.reportType,
            hotelSlug: report.hotel_slug,
            periodStart,
            periodEnd,
            logId: logRow?.id || null,
          },
        });

        reportResults.push({
          report: definition.key,
          hotelSlug: report.hotel_slug,
          periodStart,
          periodEnd,
          status: "failed",
          logId: logRow?.id || null,
          error: normalizeErrorMessage(reportError),
        });
      }
    }

    const ok = results.failed === 0;
    return NextResponse.json(
      { ok, results, reports: reportResults },
      { status: ok ? 200 : 500, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("report email cron failed", error);
    await logSystemError({
      severity: "critical",
      source: "cron",
      eventType: `${definition.eventPrefix}_cron_failed`,
      message: "Report email cron failed before completing its run.",
      error,
      metadata: { report: definition.key, results, hotelSlugFilter: hotelSlugFilter || null },
    });

    return NextResponse.json(
      { ok: false, error: "Report email cron failed", results },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
