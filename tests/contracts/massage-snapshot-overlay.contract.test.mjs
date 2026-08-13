import assert from "node:assert/strict";
import test from "node:test";
import { overlayConfirmedMassageBookings } from "../../lib/server/massage-snapshot-overlay.mjs";

const services = {
  count: 3,
  services: [
    {
      serviceId: "aroma",
      nameBg: "ÐÑ€Ð¾Ð¼Ð° Ð¼Ð°ÑÐ°Ð¶",
      durationMinutes: 60,
      bufferMinutes: 15,
    },
    {
      serviceId: "anti_stress",
      nameBg: "ÐÐ½Ñ‚Ð¸ÑÑ‚Ñ€ÐµÑ Ð¼Ð°ÑÐ°Ð¶",
      durationMinutes: 60,
      bufferMinutes: 15,
    },
    {
      serviceId: "partial",
      nameBg: "Ð§Ð°ÑÑ‚Ð¸Ñ‡ÐµÐ½ Ð¼Ð°ÑÐ°Ð¶",
      durationMinutes: 30,
      bufferMinutes: 15,
    },
  ],
};

function availability(serviceId, times13, times14 = ["9:00"]) {
  return {
    serviceId,
    serviceNameBg: serviceId,
    fromDate: "2026-08-13",
    daysChecked: 2,
    count: 2,
    dates: [
      {
        date: "2026-08-13",
        availableCount: times13.length,
        firstAvailableTime: times13[0],
        lastAvailableTime: times13[times13.length - 1],
        availableTimes: times13,
      },
      {
        date: "2026-08-14",
        availableCount: times14.length,
        firstAvailableTime: times14[0],
        lastAvailableTime: times14[times14.length - 1],
        availableTimes: times14,
      },
    ],
  };
}

test("209 Antistress 13.08 16:15 removes every overlapping Aroma start from stale snapshot", () => {
  const result = overlayConfirmedMassageBookings({
    services,
    availabilityByService: {
      aroma: availability("aroma", ["16:15", "16:30", "16:45"]),
      anti_stress: availability("anti_stress", [
        "16:15",
        "16:30",
        "16:45",
      ]),
      partial: availability("partial", [
        "16:15",
        "16:30",
        "16:45",
        "17:00",
        "17:15",
        "17:30",
      ]),
    },
    confirmedBookings: [
      {
        booking_date: "2026-08-13",
        start_time: "16:15:00",
        service_id: "anti_stress",
        upstream_response_json: {
          durationMinutes: 60,
          bufferMinutes: 15,
          reservedGridMinutes: 75,
        },
      },
    ],
  });

  assert.equal(result.overlayBookingCount, 1);
  assert.equal(result.removedTimeCount, 11);

  assert.deepEqual(
    result.availabilityByService.aroma.dates.map((item) => item.date),
    ["2026-08-14"],
    "13.08 must disappear for Aroma because all stale starts overlap room 209."
  );

  assert.deepEqual(
    result.availabilityByService.anti_stress.dates.map((item) => item.date),
    ["2026-08-14"],
    "13.08 must also disappear for Antistress."
  );

  const partial13 =
    result.availabilityByService.partial.dates.find(
      (item) => item.date === "2026-08-13"
    );
  assert.deepEqual(partial13.availableTimes, ["17:30"]);
  assert.equal(partial13.availableCount, 1);
  assert.equal(partial13.firstAvailableTime, "17:30");
  assert.equal(partial13.lastAvailableTime, "17:30");
});

test("no confirmed booking after the snapshot leaves availability unchanged", () => {
  const availabilityByService = {
    aroma: availability("aroma", ["16:15", "16:30"]),
  };

  const result = overlayConfirmedMassageBookings({
    services,
    availabilityByService,
    confirmedBookings: [],
  });

  assert.equal(result.overlayBookingCount, 0);
  assert.equal(result.removedTimeCount, 0);
  assert.equal(result.availabilityByService, availabilityByService);
});
