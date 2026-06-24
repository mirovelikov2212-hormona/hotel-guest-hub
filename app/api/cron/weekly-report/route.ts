import { NextRequest, NextResponse } from "next/server";

import { buildWeeklyReportEmail, type WeeklyReportRow } from "@/lib/server/weekly-report-email";
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

const REPORT_TYPE = "weekly";
const UNIQUE_VIOLATION_CODE = "23505";

type DeliveryLogRow = {
  id: string;
  delivery_status: string;
  sent_at: string | null;
  error_message: string | null;
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

async function loadExistingDeliveryLog(input: {
  hotelId: string;
  periodStart: string;
  periodEnd: string;
  recipientEmail: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("reporting_email_delivery_log")
    .select("id, delivery_status, sent_at, error_message")
    .eq("hotel_id", input.hotelId)
    .eq("report_type", REPORT_TYPE)
    .eq("period_start", input.periodStart)
    .eq("period_end", input.periodEnd)
    .ilike("recipient_email", input.recipientEmail)
    .maybeSingle();

  if (error) throw error;
  return data as DeliveryLogRow | null;
}

async function createPendingDeliveryLog(input: {
  report: WeeklyReportRow;
  recipientEmail: string;
  subject: string;
}) {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("reporting_email_delivery_log")
    .insert({
      hotel_id: input.report.hotel_id,
      hotel_slug: input.report.hotel_slug,
      report_type: REPORT_TYPE,
      period_start: input.report.week_start_date,
      period_end: input.report.week_end_date,
      recipient_email: input.recipientEmail,
      subject: input.subject,
      delivery_status: "pending",
      created_at: now,
      updated_at: now,
      metadata: {
        source: "weekly_report_cron",
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
        source: "weekly_report_cron",
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

  const dryRun = readBooleanParam(req, "dryRun");
  const retryFailed = readBooleanParam(req, "retryFailed");
  const hotelSlugFilter = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim();
  const recipientEmail = getWeeklyReportRecipient();

  if (!recipientEmail) {
    await logSystemError({
      severity: "critical",
      source: "cron",
      eventType: "weekly_report_recipient_missing",
      message: "Weekly report email recipient is not configured.",
      error: new Error("Missing REPORTING_WEEKLY_EMAIL_TO or MONITORING_ALERT_EMAIL_TO."),
    });
    return NextResponse.json(
      { ok: false, error: "Weekly report recipient is not configured." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const results = {
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
      .from("reporting_latest_completed_week_email_report_v1")
      .select("*")
      .eq("is_sandbox", false)
      .order("hotel_slug", { ascending: true });

    if (hotelSlugFilter) query = query.eq("hotel_slug", hotelSlugFilter);

    const { data, error } = await query;
    if (error) throw error;

    const reports = (data || []) as WeeklyReportRow[];
    results.checked = reports.length;

    if (!reports.length) {
      await logSystemEvent({
        severity: "info",
        source: "cron",
        eventType: "weekly_report_no_completed_week_found",
        message: "Weekly report cron found no completed weekly report rows to send.",
        metadata: { hotelSlugFilter: hotelSlugFilter || null },
      });
      return NextResponse.json({ ok: true, results, reports: [] }, { headers: NO_STORE_HEADERS });
    }

    const reportResults: Array<Record<string, unknown>> = [];

    for (const report of reports) {
      const email = buildWeeklyReportEmail(report);
      let logRow: DeliveryLogRow | null = null;

      try {
        const existing = await loadExistingDeliveryLog({
          hotelId: report.hotel_id,
          periodStart: report.week_start_date,
          periodEnd: report.week_end_date,
          recipientEmail,
        });
        const existingDecision = shouldSendExistingLog(existing, retryFailed);

        if (!existingDecision.send) {
          if (existingDecision.reason === "already_sent") results.skippedDuplicate += 1;
          else if (existingDecision.reason === "already_pending") results.skippedPending += 1;
          else if (existingDecision.reason === "previous_failed_retry_disabled") results.skippedFailedRetryDisabled += 1;

          reportResults.push({
            hotelSlug: report.hotel_slug,
            periodStart: report.week_start_date,
            periodEnd: report.week_end_date,
            status: dryRun ? "dry_run_would_skip" : "skipped",
            reason: existingDecision.reason,
            logId: existing?.id || null,
          });
          continue;
        }

        if (dryRun) {
          reportResults.push({
            hotelSlug: report.hotel_slug,
            periodStart: report.week_start_date,
            periodEnd: report.week_end_date,
            status: "dry_run_ready",
            logId: null,
            subject: email.subject,
          });
          continue;
        }

        if (existing && existingDecision.reason === "retry_failed") {
          logRow = await resetFailedDeliveryLog({ logId: existing.id, subject: email.subject });
        } else {
          try {
            logRow = await createPendingDeliveryLog({
              report,
              recipientEmail,
              subject: email.subject,
            });
          } catch (insertError) {
            const maybeCode = (insertError as { code?: unknown })?.code;
            if (maybeCode !== UNIQUE_VIOLATION_CODE) throw insertError;

            const duplicate = await loadExistingDeliveryLog({
              hotelId: report.hotel_id,
              periodStart: report.week_start_date,
              periodEnd: report.week_end_date,
              recipientEmail,
            });
            results.skippedDuplicate += 1;
            reportResults.push({
              hotelSlug: report.hotel_slug,
              periodStart: report.week_start_date,
              periodEnd: report.week_end_date,
              status: "skipped",
              reason: "unique_duplicate",
              logId: duplicate?.id || null,
            });
            continue;
          }
        }

        if (!logRow) {
          throw new Error("Weekly report delivery log was not created before sending.");
        }

        const delivery = await sendReportEmailViaSmtp({
          to: recipientEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
          fromName: "StayHub Reports",
          headers: {
            "X-StayHub-Hotel": report.hotel_slug,
            "X-StayHub-Report-Period": `${report.week_start_date}_${report.week_end_date}`,
          },
        });

        await updateDeliveryLog({
          logId: logRow.id,
          status: "sent",
          providerMessageId: delivery.providerMessageId,
          metadata: {
            source: "weekly_report_cron",
            hotelSlug: report.hotel_slug,
            periodStart: report.week_start_date,
            periodEnd: report.week_end_date,
          },
        });

        results.sent += 1;
        reportResults.push({
          hotelSlug: report.hotel_slug,
          periodStart: report.week_start_date,
          periodEnd: report.week_end_date,
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
              source: "weekly_report_cron",
              hotelSlug: report.hotel_slug,
              periodStart: report.week_start_date,
              periodEnd: report.week_end_date,
            },
          }).catch((logUpdateError) => {
            console.error("Failed to update weekly report delivery log after failure", logUpdateError);
          });
        }

        await logSystemError({
          severity: "critical",
          source: "cron",
          eventType: "weekly_report_delivery_failed",
          message: "Weekly StayHub report email delivery failed.",
          hotelId: report.hotel_id,
          error: reportError,
          metadata: {
            hotelSlug: report.hotel_slug,
            periodStart: report.week_start_date,
            periodEnd: report.week_end_date,
            logId: logRow?.id || null,
          },
        });

        reportResults.push({
          hotelSlug: report.hotel_slug,
          periodStart: report.week_start_date,
          periodEnd: report.week_end_date,
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
    console.error("weekly report cron failed", error);
    await logSystemError({
      severity: "critical",
      source: "cron",
      eventType: "weekly_report_cron_failed",
      message: "Weekly report cron failed before completing its run.",
      error,
      metadata: { results, hotelSlugFilter: hotelSlugFilter || null },
    });

    return NextResponse.json(
      { ok: false, error: "Weekly report cron failed", results },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
