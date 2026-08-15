export function shouldAutoReleaseRoomTurnover(input?: {
  requestedCheckInDate?: string;
  hotelTodayDate?: string;
  overlappingStayCheckInDate?: string;
  overlappingLastSeenLocalDate?: string;
  hotelNowMinutes?: number;
  standardCheckInMinutes?: number;
}): boolean;
