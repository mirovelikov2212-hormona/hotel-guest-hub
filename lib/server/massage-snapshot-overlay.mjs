function normalizeServiceId(value) {
  return String(value || "").trim().toLowerCase();
}

function timeToMinutes(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function nonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function reservationMinutesFromPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const reservedGridMinutes = positiveNumber(payload.reservedGridMinutes);
  if (reservedGridMinutes !== null) return reservedGridMinutes;

  const durationMinutes = positiveNumber(payload.durationMinutes);
  if (durationMinutes === null) return null;

  const bufferMinutes = nonNegativeNumber(payload.bufferMinutes) ?? 0;
  return durationMinutes + bufferMinutes;
}

function reservationMinutesFromService(service) {
  if (!service || typeof service !== "object" || Array.isArray(service)) {
    return null;
  }

  const durationMinutes = positiveNumber(service.durationMinutes);
  if (durationMinutes === null) return null;

  const bufferMinutes = nonNegativeNumber(service.bufferMinutes) ?? 0;
  return durationMinutes + bufferMinutes;
}

function intervalsOverlap(startA, lengthA, startB, lengthB) {
  return startA < startB + lengthB && startA + lengthA > startB;
}

function buildConfirmedIntervals(confirmedBookings, serviceById) {
  return (confirmedBookings || []).map((booking) => {
    const date = String(booking?.booking_date || "").trim();
    const startMinutes = timeToMinutes(booking?.start_time);
    const serviceId = normalizeServiceId(booking?.service_id);
    const service = serviceById.get(serviceId) || null;
    const reservationMinutes =
      reservationMinutesFromPayload(booking?.upstream_response_json) ??
      reservationMinutesFromPayload(booking?.verification_response_json) ??
      reservationMinutesFromService(service);

    if (!date || startMinutes === null || reservationMinutes === null) {
      throw new Error(
        "Confirmed massage booking cannot be safely overlaid on snapshot availability."
      );
    }

    return {
      date,
      startMinutes,
      reservationMinutes,
    };
  });
}

export function overlayConfirmedMassageBookings(input) {
  const services = Array.isArray(input?.services?.services)
    ? input.services.services
    : [];
  const availabilityByService =
    input?.availabilityByService &&
    typeof input.availabilityByService === "object" &&
    !Array.isArray(input.availabilityByService)
      ? input.availabilityByService
      : {};

  const serviceById = new Map(
    services
      .map((service) => [normalizeServiceId(service?.serviceId), service])
      .filter(([serviceId]) => Boolean(serviceId))
  );
  const confirmedIntervals = buildConfirmedIntervals(
    input?.confirmedBookings || [],
    serviceById
  );

  if (confirmedIntervals.length === 0) {
    return {
      availabilityByService,
      overlayBookingCount: 0,
      removedTimeCount: 0,
    };
  }

  let removedTimeCount = 0;
  const overlaidAvailability = Object.fromEntries(
    Object.entries(availabilityByService).map(([serviceId, result]) => {
      const service = serviceById.get(normalizeServiceId(serviceId)) || null;
      const candidateReservationMinutes =
        reservationMinutesFromService(service);
      const dates = Array.isArray(result?.dates) ? result.dates : [];

      const overlaidDates = dates
        .map((dateEntry) => {
          const date = String(dateEntry?.date || "").trim();
          const occupiedIntervals = confirmedIntervals.filter(
            (booking) => booking.date === date
          );

          if (occupiedIntervals.length === 0) return { ...dateEntry };

          if (candidateReservationMinutes === null) {
            throw new Error(
              `Massage service ${serviceId} has no safe reservation duration.`
            );
          }

          if (!Array.isArray(dateEntry?.availableTimes)) {
            throw new Error(
              `Massage snapshot date ${date} has no availableTimes for safe overlay.`
            );
          }

          const availableTimes = dateEntry.availableTimes.filter((time) => {
            const candidateStart = timeToMinutes(time);
            if (candidateStart === null) {
              throw new Error(
                `Massage snapshot contains an invalid start time: ${String(time)}`
              );
            }

            return !occupiedIntervals.some((booking) =>
              intervalsOverlap(
                candidateStart,
                candidateReservationMinutes,
                booking.startMinutes,
                booking.reservationMinutes
              )
            );
          });

          removedTimeCount +=
            dateEntry.availableTimes.length - availableTimes.length;

          return {
            ...dateEntry,
            availableTimes,
            availableCount: availableTimes.length,
            firstAvailableTime: availableTimes[0],
            lastAvailableTime: availableTimes[availableTimes.length - 1],
          };
        })
        .filter(
          (dateEntry) =>
            !Array.isArray(dateEntry.availableTimes) ||
            dateEntry.availableTimes.length > 0
        );

      return [
        serviceId,
        {
          ...result,
          count: overlaidDates.length,
          dates: overlaidDates,
        },
      ];
    })
  );

  return {
    availabilityByService: overlaidAvailability,
    overlayBookingCount: confirmedIntervals.length,
    removedTimeCount,
  };
}
