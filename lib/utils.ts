// lib/utils.ts
export function safeTelLink(phone: string) {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "#";
}

export function buildWhatsAppLink(whatsappNumber: string, message: string) {
  const n = (whatsappNumber || "").replace(/[^\d]/g, "");
  const text = encodeURIComponent(message || "");
  return n ? `https://wa.me/${n}?text=${text}` : "#";
}

// --- Time helpers (local time) ---
function parseHHMM(s: string): { h: number; m: number } | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

function minutesSinceMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * True if current local time is within [open, close).
 * Supports overnight schedules like 22:00–06:00.
 */
export function isWithinHoursLocal(open: string, close: string, now = new Date()) {
  const o = parseHHMM(open);
  const c = parseHHMM(close);
  if (!o || !c) return true; // if invalid hours → do not block
  const nowMin = minutesSinceMidnight(now);
  const oMin = o.h * 60 + o.m;
  const cMin = c.h * 60 + c.m;

  if (oMin === cMin) return true; // treat as 24h
  if (oMin < cMin) {
    // normal day range
    return nowMin >= oMin && nowMin < cMin;
  }
  // overnight
  return nowMin >= oMin || nowMin < cMin;
}

/**
 * Legacy helper: after a cutoff time.
 */
export function isAfterCutoffLocal(cutoff: string, now = new Date()) {
  const c = parseHHMM(cutoff);
  if (!c) return false;
  const nowMin = minutesSinceMidnight(now);
  const cMin = c.h * 60 + c.m;
  return nowMin >= cMin;
}

/**
 * Replace sequential "____" placeholders with given values.
 * Example: "Time: ____ People: ____" + ["19:00","2"] → "Time: 19:00 People: 2"
 */
export function fillBlanks(template: string, values: string[]) {
  let out = template || "";
  for (const v of values) {
    out = out.replace("____", v);
  }
  return out;
}
