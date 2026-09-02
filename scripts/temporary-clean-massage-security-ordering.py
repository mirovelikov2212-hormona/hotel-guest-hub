from pathlib import Path

path = Path("app/api/guest/massages/route.ts")
source = path.read_text()

start_marker = """    // Resolve the tenant and its runtime authority before applying the legacy\n"""
end_marker = """    if (isNativeMassageAuthority(runtimeAuthority)) {\n"""

start = source.find(start_marker)
end = source.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("Expected massage POST authority block not found; refusing fuzzy edit")

old = source[start:end]
if old.count("const runtimeAuthority = await getMassageRuntimeAuthority(hotel.id);") != 1:
    raise SystemExit("Unexpected runtime authority shape; refusing edit")
if old.count("const stayIdentity = await requireMassageGuestStayIdentity({") != 1:
    raise SystemExit("Unexpected stay identity shape; refusing edit")

new = '''    // Resolve tenant identity first, but do not inspect operational booking
    // authority until the public payload and confirmed stay/device identity have
    // both been validated. Unauthenticated callers must not reach authority
    // selection, adapter feature flags, or booking write paths.
    const hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
    requestHotelId = hotel.id;
    timing.mark("hotel");

    requireConfirmedRoom(body.roomConfirmed);

    const serviceId = requireServiceId(body.serviceId ?? body.service_id);
    const date = requireDate(body.date ?? body.dateIso, "date");
    const time = requireTime(body.time ?? body.startTime);
    const room = requireRoom(body.room ?? body.roomNumber);

    requestHotelMetadata = {
      hotelSlug,
      resolvedHotelSlug: hotel.slug,
      publicSlug: hotel.public_slug || null,
      isSandbox: Boolean(hotel.is_sandbox),
      productionHotelId: hotel.production_hotel_id || null,
      room,
      serviceId,
      date,
      time,
    };

    const stayIdentity = await requireMassageGuestStayIdentity({
      hotelId: hotel.id,
      room,
      stayId: body.stayId,
      stayDeviceId: body.stayDeviceId,
    });
    const stayId = String(stayIdentity.stay.id);
    const stayDeviceId = String(stayIdentity.device.id);
    timing.mark("stay_identity");

    await requireExistingHotelRoom(hotelSlug, room);
    timing.mark("room");

    const runtimeAuthority = await getMassageRuntimeAuthority(hotel.id);
    const sandboxNativeBookingEnabled =
      isSandboxHotel(hotel) && isNativeMassageAuthority(runtimeAuthority);
    const controlledE2EEnabled = isMassageControlledE2EEnabled(hotelSlug);
    const productionBookingEnabled = isMassageBookingPostEnabled(hotelSlug);
    timing.mark("authority");

    if (!sandboxNativeBookingEnabled && !controlledE2EEnabled && !productionBookingEnabled) {
      await logSystemEvent({
        severity: "warning",
        source: "massage",
        eventType: "massage_booking_post_disabled",
        message: "Massage booking POST was attempted while booking submission is disabled for the hotel.",
        hotelId: hotel.id,
        metadata: {
          hotelSlug,
          isSandbox: Boolean(hotel.is_sandbox),
          runtimeAuthority: runtimeAuthority.authorityMode,
        },
      });
      return json(
        {
          ok: false,
          code: "MASSAGE_BOOKING_POST_DISABLED",
          error: "Massage booking submission is not enabled yet.",
        },
        503
      );
    }

'''

source = source[:start] + new + source[end:]
path.write_text(source)
print("Applied exact massage POST security-ordering edit")
