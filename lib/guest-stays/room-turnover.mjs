function normalizeDateKey(value) {
  return String(value || "").trim();
}

function normalizeMinutes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -1;
}

export function shouldAutoReleaseRoomTurnover(input = {}) {
  const requestedCheckInDate = normalizeDateKey(input.requestedCheckInDate);
  const hotelTodayDate = normalizeDateKey(input.hotelTodayDate);
  const overlappingStayCheckInDate = normalizeDateKey(input.overlappingStayCheckInDate);
  const overlappingLastSeenLocalDate = normalizeDateKey(input.overlappingLastSeenLocalDate);
  const hotelNowMinutes = normalizeMinutes(input.hotelNowMinutes);
  const standardCheckInMinutes = normalizeMinutes(input.standardCheckInMinutes);

  if (!requestedCheckInDate || !hotelTodayDate || !overlappingStayCheckInDate || !overlappingLastSeenLocalDate) {
    return false;
  }

  return (
    requestedCheckInDate === hotelTodayDate &&
    hotelNowMinutes >= standardCheckInMinutes &&
    overlappingStayCheckInDate < hotelTodayDate &&
    overlappingLastSeenLocalDate < hotelTodayDate
  );
}
