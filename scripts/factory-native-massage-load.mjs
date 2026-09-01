import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(process.env.STAYHUB_MASSAGE_LOAD_BASE_URL || "").replace(/\/$/, "");
const cookie = String(process.env.STAYHUB_PREVIEW_COOKIE || "").trim();
const bookingDate = String(process.env.STAYHUB_MASSAGE_LOAD_DATE || "2026-09-02");
if (!baseUrl) throw new Error("STAYHUB_MASSAGE_LOAD_BASE_URL is required");

function id(kind, hotel, room) {
  const hash = createHash("md5").update(`factory-massage-${kind}-${hotel}-${room}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}
const slug = (hotel) => `factory-massage-load-20260901-${String(hotel).padStart(2, "0")}-sandbox`;
const timeFor = (index) => `${String(8 + index).padStart(2, "0")}:00`;
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p / 100) - 1)].toFixed(1)) : null;
}

async function book({ hotel, roomIndex, time, stayHotel = hotel }) {
  const started = performance.now();
  let status = 0, body = null, transportError = null;
  try {
    const response = await fetch(`${baseUrl}/api/guest/massages`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ hotelSlug: slug(hotel), roomConfirmed: true, serviceId: "load_massage", date: bookingDate, time,
        room: String(200 + roomIndex), stayId: id("stay", stayHotel, roomIndex), stayDeviceId: id("device", stayHotel, roomIndex), guestLanguage: "en" }),
      signal: AbortSignal.timeout(60_000),
    });
    status = response.status;
    body = await response.json().catch(() => null);
  } catch (error) { transportError = error instanceof Error ? error.message : String(error); }
  return { hotel, roomIndex, time, stayHotel, status, ok: body?.ok === true, code: body?.code || null,
    bookingId: body?.result?.nativeBookingId || null, replay: body?.result?.idempotentReplay === true,
    error: transportError || body?.error || null, latencyMs: Number((performance.now() - started).toFixed(1)) };
}

async function phase(name, operations) {
  const start = performance.now();
  const rows = await Promise.all(operations);
  const latencies = rows.map((row) => row.latencyMs);
  return { name, wallMs: Number((performance.now() - start).toFixed(1)), total: rows.length,
    successful: rows.filter((row) => row.ok).length, failed: rows.filter((row) => !row.ok).length,
    p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), rows };
}

const unique = await phase("unique_slots", Array.from({ length: 100 }, (_, index) => {
  const hotel = Math.floor(index / 10) + 1, slot = index % 10;
  return book({ hotel, roomIndex: slot + 1, time: timeFor(slot) });
}));
const contention = await phase("same_slot_contention", Array.from({ length: 20 }, (_, index) =>
  book({ hotel: 1, roomIndex: index + 1, time: "19:00" })));
const winner = contention.rows.find((row) => row.ok);
const replay = winner ? await book({ hotel: 1, roomIndex: winner.roomIndex, time: "19:00" }) : null;
const crossTenant = await book({ hotel: 1, roomIndex: 1, time: "18:00", stayHotel: 2 });
const output = { schemaVersion: "stayhub-native-massage-load-v1", bookingDate, unique, contention, replay, crossTenant };
await writeFile("factory-native-massage-load-results.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  unique: { ...unique, rows: undefined }, contention: { ...contention, rows: undefined }, replay, crossTenant,
}));
const accepted = unique.successful === 100 && unique.failed === 0 && contention.successful === 1 && contention.failed === 19 &&
  replay?.ok === true && replay.replay === true && crossTenant.ok === false && crossTenant.status === 401;
if (!accepted) process.exitCode = 1;
