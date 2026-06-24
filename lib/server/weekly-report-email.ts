import "server-only";

export type WeeklyReportRow = {
  hotel_id: string;
  hotel_name: string | null;
  hotel_slug: string;
  public_slug: string | null;
  hotel_timezone: string | null;
  is_sandbox: boolean | null;
  week_start_date: string;
  week_end_date: string;
  report_period_label: string | null;
  report_subject_bg: string | null;
  days_with_data: number | string | null;
  requests_real: number | string | null;
  requests_open_or_active: number | string | null;
  room_event_days_real: number | string | null;
  hub_opens_real: number | string | null;
  ai_opens_real: number | string | null;
  ai_questions_real: number | string | null;
  upsell_requests_real: number | string | null;
  upsell_amount_real: number | string | null;
  surveys_real: number | string | null;
  critical_surveys_real: number | string | null;
  avg_rating_real: number | string | null;
  requests_by_type: unknown;
  upsell_by_item: unknown;
  massage_bookings_count: number | string | null;
  massage_charged_count: number | string | null;
  massage_rooms_count: number | string | null;
  massage_amount_total: number | string | null;
  first_massage_date: string | null;
  last_massage_date: string | null;
  massage_bookings: unknown;
  top_sections: unknown;
  top_rooms: unknown;
  ai_usage_by_language_device: unknown;
  report_payload_json?: unknown;
};

type JsonRecord = Record<string, unknown>;

const MAX_TEXT_ITEMS = 10;
const MAX_TABLE_ITEMS = 8;

function toArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value: unknown) {
  return Math.round(toNumber(value)).toLocaleString("bg-BG");
}

function formatMoney(value: unknown, currency = "EUR") {
  return `${toNumber(value).toLocaleString("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatPercent(value: unknown) {
  const parsed = toNumber(value);
  if (!parsed) return "0%";
  return `${parsed.toLocaleString("bg-BG", { maximumFractionDigits: 1 })}%`;
}

function formatDate(value: unknown) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || "—";
  const [year, month, day] = text.split("-");
  return `${day}.${month}.${year}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textValue(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function getReportSubject(row: WeeklyReportRow) {
  return textValue(
    row.report_subject_bg,
    `Седмичен StayHub отчет - ${textValue(row.hotel_name, row.hotel_slug)} - ${formatDate(row.week_start_date)} - ${formatDate(row.week_end_date)}`,
  );
}

function metricLabelValue(label: string, value: string) {
  return `<div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
    <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">${escapeHtml(label)}</div>
    <div style="font-size:22px;font-weight:700;color:#111827;">${escapeHtml(value)}</div>
  </div>`;
}

function renderHtmlTable(headers: string[], rows: string[][]) {
  if (!rows.length) {
    return `<p style="margin:0;color:#6b7280;">Няма данни за този период.</p>`;
  }

  return `<table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <thead>
      <tr>${headers
        .map((header) => `<th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;background:#f9fafb;font-size:13px;color:#374151;">${escapeHtml(header)}</th>`)
        .join("")}</tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `<tr>${row
            .map((cell) => `<td style="padding:10px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;vertical-align:top;">${cell}</td>`)
            .join("")}</tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderTextList(title: string, rows: string[]) {
  if (!rows.length) return `${title}\n- Няма данни`;
  return `${title}\n${rows.map((row) => `- ${row}`).join("\n")}`;
}

function topRequests(row: WeeklyReportRow) {
  return toArray(row.requests_by_type).slice(0, MAX_TEXT_ITEMS).map((item) => ({
    title: textValue(firstText(item.request_title_bg, item.request_type)),
    department: textValue(item.department_key, "unknown"),
    count: formatInteger(item.request_count),
    rooms: formatInteger(item.rooms_count),
    open: formatInteger(item.open_or_active_count),
  }));
}

function topSections(row: WeeklyReportRow) {
  return toArray(row.top_sections).slice(0, MAX_TEXT_ITEMS).map((item) => ({
    title: textValue(firstText(item.section_name, item.section_key)),
    opens: formatInteger(item.section_opens),
    total: formatInteger(item.total_events),
  }));
}

function topRooms(row: WeeklyReportRow) {
  return toArray(row.top_rooms).slice(0, MAX_TEXT_ITEMS).map((item) => ({
    room: textValue(item.room_number),
    total: formatInteger(item.total_events),
    opens: formatInteger(item.hub_opens),
    requests: formatInteger(item.requests_created),
    ai: formatInteger(item.ai_questions),
  }));
}

function massageRows(row: WeeklyReportRow) {
  return toArray(row.massage_bookings).slice(0, MAX_TABLE_ITEMS).map((item) => ({
    room: textValue(item.room_number),
    service: textValue(item.massage_service_name),
    date: formatDate(item.massage_date),
    time: textValue(item.massage_start_time),
    amount: formatMoney(item.amount, textValue(item.currency, "EUR")),
    billing: textValue(item.billing_status),
  }));
}

function aiRows(row: WeeklyReportRow) {
  return toArray(row.ai_usage_by_language_device).slice(0, MAX_TABLE_ITEMS).map((item) => ({
    language: textValue(item.language),
    device: textValue(item.device_type),
    opens: formatInteger(item.ai_opens),
    questions: formatInteger(item.ai_questions),
    answers: formatInteger(item.ai_answers_shown),
  }));
}

export function buildWeeklyReportEmail(row: WeeklyReportRow) {
  const hotelName = textValue(row.hotel_name, row.hotel_slug);
  const period = textValue(row.report_period_label, `${formatDate(row.week_start_date)} - ${formatDate(row.week_end_date)}`);
  const subject = getReportSubject(row);

  const requests = topRequests(row);
  const sections = topSections(row);
  const rooms = topRooms(row);
  const massages = massageRows(row);
  const ai = aiRows(row);

  const text = [
    `Седмичен StayHub отчет`,
    `Хотел: ${hotelName}`,
    `Период: ${period}`,
    "",
    "Основни показатели:",
    `- Отваряния на хъба: ${formatInteger(row.hub_opens_real)}`,
    `- Активни room-days: ${formatInteger(row.room_event_days_real)}`,
    `- Реални заявки: ${formatInteger(row.requests_real)}`,
    `- Upsell: ${formatMoney(row.upsell_amount_real)}`,
    `- Масажи: ${formatInteger(row.massage_bookings_count)} (${formatMoney(row.massage_amount_total)})`,
    `- AI въпроси: ${formatInteger(row.ai_questions_real)}`,
    `- Анкети: ${formatInteger(row.surveys_real)} | критични: ${formatInteger(row.critical_surveys_real)} | средна оценка: ${row.avg_rating_real ?? "—"}`,
    "",
    renderTextList(
      "Заявки по тип:",
      requests.map((item) => `${item.title} — ${item.count} заявки, ${item.rooms} стаи, активни: ${item.open}`),
    ),
    "",
    renderTextList(
      "Най-използвани секции:",
      sections.map((item) => `${item.title} — ${item.opens} отваряния, ${item.total} събития`),
    ),
    "",
    renderTextList(
      "Най-активни стаи:",
      rooms.map((item) => `Стая ${item.room} — ${item.total} събития, ${item.opens} hub opens, ${item.requests} заявки, ${item.ai} AI въпроси`),
    ),
    "",
    "Този отчет е генериран автоматично от StayHub.",
  ].join("\n");

  const requestTable = renderHtmlTable(
    ["Заявка", "Отдел", "Брой", "Стаи", "Активни"],
    requests.map((item) => [
      escapeHtml(item.title),
      escapeHtml(item.department),
      escapeHtml(item.count),
      escapeHtml(item.rooms),
      escapeHtml(item.open),
    ]),
  );

  const sectionTable = renderHtmlTable(
    ["Секция", "Отваряния", "Събития"],
    sections.map((item) => [escapeHtml(item.title), escapeHtml(item.opens), escapeHtml(item.total)]),
  );

  const roomTable = renderHtmlTable(
    ["Стая", "Събития", "Hub opens", "Заявки", "AI въпроси"],
    rooms.map((item) => [
      escapeHtml(item.room),
      escapeHtml(item.total),
      escapeHtml(item.opens),
      escapeHtml(item.requests),
      escapeHtml(item.ai),
    ]),
  );

  const massageTable = renderHtmlTable(
    ["Стая", "Масаж", "Дата", "Час", "Сума", "Billing"],
    massages.map((item) => [
      escapeHtml(item.room),
      escapeHtml(item.service),
      escapeHtml(item.date),
      escapeHtml(item.time),
      escapeHtml(item.amount),
      escapeHtml(item.billing),
    ]),
  );

  const aiTable = renderHtmlTable(
    ["Език", "Устройство", "AI opens", "Въпроси", "Отговори"],
    ai.map((item) => [
      escapeHtml(item.language),
      escapeHtml(item.device),
      escapeHtml(item.opens),
      escapeHtml(item.questions),
      escapeHtml(item.answers),
    ]),
  );

  const html = `<!doctype html>
<html lang="bg">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:860px;margin:0 auto;padding:24px;">
    <div style="background:#111827;color:#ffffff;border-radius:18px;padding:22px 24px;margin-bottom:18px;">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#cbd5e1;margin-bottom:8px;">StayHub weekly report</div>
      <h1 style="font-size:26px;line-height:1.25;margin:0 0 8px;">${escapeHtml(hotelName)}</h1>
      <div style="font-size:16px;color:#e5e7eb;">${escapeHtml(period)}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:18px;">
      ${metricLabelValue("Отваряния на хъба", formatInteger(row.hub_opens_real))}
      ${metricLabelValue("Активни room-days", formatInteger(row.room_event_days_real))}
      ${metricLabelValue("Реални заявки", formatInteger(row.requests_real))}
      ${metricLabelValue("Upsell", formatMoney(row.upsell_amount_real))}
      ${metricLabelValue("Масажи", `${formatInteger(row.massage_bookings_count)} / ${formatMoney(row.massage_amount_total)}`)}
      ${metricLabelValue("AI въпроси", formatInteger(row.ai_questions_real))}
      ${metricLabelValue("Анкети", `${formatInteger(row.surveys_real)} | критични ${formatInteger(row.critical_surveys_real)} | оценка ${row.avg_rating_real ?? "—"}`)}
    </div>

    <section style="background:#ffffff;border-radius:16px;padding:18px;margin-bottom:16px;border:1px solid #e5e7eb;">
      <h2 style="font-size:18px;margin:0 0 12px;">Заявки по тип</h2>
      ${requestTable}
    </section>

    <section style="background:#ffffff;border-radius:16px;padding:18px;margin-bottom:16px;border:1px solid #e5e7eb;">
      <h2 style="font-size:18px;margin:0 0 12px;">Масажи</h2>
      <p style="margin:0 0 12px;color:#4b5563;">Общо: <strong>${formatInteger(row.massage_bookings_count)}</strong>, начислени: <strong>${formatInteger(row.massage_charged_count)}</strong>, сума: <strong>${formatMoney(row.massage_amount_total)}</strong></p>
      ${massageTable}
    </section>

    <section style="background:#ffffff;border-radius:16px;padding:18px;margin-bottom:16px;border:1px solid #e5e7eb;">
      <h2 style="font-size:18px;margin:0 0 12px;">Най-използвани секции</h2>
      ${sectionTable}
    </section>

    <section style="background:#ffffff;border-radius:16px;padding:18px;margin-bottom:16px;border:1px solid #e5e7eb;">
      <h2 style="font-size:18px;margin:0 0 12px;">Най-активни стаи</h2>
      ${roomTable}
    </section>

    <section style="background:#ffffff;border-radius:16px;padding:18px;margin-bottom:16px;border:1px solid #e5e7eb;">
      <h2 style="font-size:18px;margin:0 0 12px;">AI използване</h2>
      ${aiTable}
    </section>

    <p style="font-size:12px;color:#6b7280;text-align:center;margin:20px 0 0;">Този отчет е генериран автоматично от StayHub.</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
