import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_CRITICAL_PAGES,
  selectCriticalHotelScannerPages,
} from "../../lib/ai/hotel-scanner-critical-pages.mjs";

function page(path, title, text = "") {
  return {
    url: `https://hotel.test${path}`,
    title,
    description: "",
    text,
  };
}

test("critical selector is bounded and prioritizes policy, FAQ, operational and venue/service detail evidence", () => {
  const pages = [
    page("/", "Luxury Hotel"),
    ...Array.from({ length: 16 }, (_, index) => page(`/rooms/room-${index + 1}`, `Room ${index + 1}`, "Spacious room with a view.")),
    page("/en/faq", "Frequently Asked Questions", "Pets are not allowed. External visitors may access NERO with reservation."),
    page("/bg/hotel-policy", "Правила на хотела", "Часове за тишина 14:00–16:00 и 22:00–08:00."),
    page("/en/hotel-policy", "Hotel Policy", "Quiet hours 15:00–16:00 and 22:00–08:00. Small pets are allowed."),
    page("/terms-and-conditions", "Terms & Conditions", "Payment and cancellation rules."),
    page("/booking-rules", "Reservation Rules", "A 50% deposit confirms the booking."),
    page("/restaurants/nero", "NERO Dining Club", "Only resort guests and members may enter."),
    page("/spa/hydrotherapy", "Hydrotherapy", "Medical SPA treatment details."),
    page("/guest-services", "Guest Services", "Service details and hours."),
  ];

  const selected = selectCriticalHotelScannerPages(pages);
  const urls = new Set(selected.map((item) => item.url));

  assert.ok(selected.length <= DEFAULT_MAX_CRITICAL_PAGES);
  assert.ok(urls.has("https://hotel.test/en/faq"));
  assert.ok(urls.has("https://hotel.test/bg/hotel-policy"));
  assert.ok(urls.has("https://hotel.test/en/hotel-policy"));
  assert.ok(urls.has("https://hotel.test/terms-and-conditions"));
  assert.ok(urls.has("https://hotel.test/booking-rules"));
  assert.ok(urls.has("https://hotel.test/restaurants/nero"));
  assert.ok(urls.has("https://hotel.test/spa/hydrotherapy"));
  assert.ok(urls.has("https://hotel.test/guest-services"));
  assert.ok(selected.filter((item) => item.url.includes("/rooms/")).length < 4);
});

test("critical selector preserves translated policy siblings because translations may genuinely conflict", () => {
  const pages = [
    page("/en/hotel-policy", "Hotel Policy", "Quiet hours 15:00–16:00 and 22:00–08:00."),
    page("/bg/hotel-policy", "Правила на хотела", "Часове за тишина 14:00–16:00 и 22:00–08:00."),
    page("/en/faq", "FAQ", "Hotel rules."),
  ];
  const selected = selectCriticalHotelScannerPages(pages, { maxPages: 3 });
  assert.deepEqual(new Set(selected.map((item) => item.url)), new Set(pages.map((item) => item.url)));
});

test("critical selector is deterministic regardless of noisy marketing-page ordering", () => {
  const relevant = [
    page("/faq", "FAQ", "Pets are not allowed."),
    page("/hotel-policy", "Hotel Policy", "Small pets are allowed."),
    page("/spa", "SPA & Wellness", "Treatment details."),
  ];
  const noisy = [page("/gallery", "Gallery"), page("/rooms", "Rooms"), page("/offers", "Offers")];
  const first = selectCriticalHotelScannerPages([...noisy, ...relevant], { maxPages: 3 }).map((item) => item.url);
  const second = selectCriticalHotelScannerPages([...relevant].reverse().concat(noisy.reverse()), { maxPages: 3 }).map((item) => item.url);
  assert.deepEqual(first, second);
});

test("critical selector has a safe one-page fallback when no critical semantic signal exists", () => {
  const pages = [page("/", "Hotel Home"), page("/gallery", "Gallery")];
  const selected = selectCriticalHotelScannerPages(pages);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].url, "https://hotel.test/");
});
