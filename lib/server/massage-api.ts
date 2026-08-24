import "server-only";

import * as legacy from "@/lib/server/massage-api-legacy";
import { getMassageExternalSourceForHotel } from "@/lib/server/massage-external-source";

export { MassageApiError } from "@/lib/server/massage-api-legacy";
export type {
  MassageAvailabilityResult,
  MassageBookableDate,
  MassageBookableDatesResult,
  MassageBookingResult,
  MassageBookingVerificationResult,
  MassageBootstrapResult,
  MassageCalendarSnapshotBooking,
  MassageCalendarSnapshotResult,
  MassageService,
  MassageServicesResult,
  MassageSnapshotSourceBundle,
} from "@/lib/server/massage-api-legacy";

type ExternalAccessMode = "read" | "mirror";

const MASSAGE_SNAPSHOT_RETRY_MAX_FIRST_ATTEMPT_MS = 30_000;
const MASSAGE_SNAPSHOT_RETRY_DELAY_MS = 250;

async function requireLegacyExternalSource(
  inputHotelSlug: unknown,
  mode: ExternalAccessMode,
) {
  const source = await getMassageExternalSourceForHotel(inputHotelSlug);
  const enabled =
    source &&
    source.config.adapter_key === "legacy_global" &&
    (mode === "read" ? source.config.read_enabled : source.config.mirror_enabled);

  if (!enabled || !source) {
    throw new legacy.MassageApiError(
      `External massage ${mode} access is not configured for this hotel.`,
      {
        statusCode: 503,
        code: "MASSAGE_EXTERNAL_SOURCE_NOT_CONFIGURED",
      },
    );
  }

  return source;
}

function isRetryableSnapshotReadFailure(error: unknown) {
  if (!(error instanceof legacy.MassageApiError)) return false;

  if (error.code === "MASSAGE_API_METHOD_MISMATCH") return true;

  return (
    error.code === "MASSAGE_API_HTTP_ERROR" &&
    error.upstreamStatus === 404
  );
}

async function waitForSnapshotRetry() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, MASSAGE_SNAPSHOT_RETRY_DELAY_MS);
  });
}

export function normalizeMassageHotelSlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

// Compatibility-only helpers remain synchronous for existing native-mirror
// callers. The actual external read/write functions below are always guarded by
// tenant DB configuration before the legacy adapter can be reached.
export const getMassageHotelCode = legacy.getMassageHotelCode;
export const buildMassageStayHubSheetRoomMarker = legacy.buildMassageStayHubSheetRoomMarker;
export const isMassageBookingPostEnabled = legacy.isMassageBookingPostEnabled;
export const isMassageControlledE2EEnabled = legacy.isMassageControlledE2EEnabled;
export const isApprovedMassageControlledE2ECandidate = legacy.isApprovedMassageControlledE2ECandidate;
export const isMassageSandboxLiveWriteEnabled = legacy.isMassageSandboxLiveWriteEnabled;
export const isApprovedMassageSandboxLiveWriteCandidate = legacy.isApprovedMassageSandboxLiveWriteCandidate;

export async function getMassageBootstrap(
  input: Parameters<typeof legacy.getMassageBootstrap>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "read");
  return legacy.getMassageBootstrap({ ...input, hotelSlug: source.hotel.slug });
}

export async function getMassageCalendarSnapshot(
  input: Parameters<typeof legacy.getMassageCalendarSnapshot>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "read");
  return legacy.getMassageCalendarSnapshot({ ...input, hotelSlug: source.hotel.slug });
}

export async function getMassageSnapshotSourceBundle(
  input: Parameters<typeof legacy.getMassageSnapshotSourceBundle>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "read");
  const scopedInput = { ...input, hotelSlug: source.hotel.slug };
  const firstAttemptStartedAt = Date.now();

  try {
    return await legacy.getMassageSnapshotSourceBundle(scopedInput);
  } catch (error) {
    const firstAttemptElapsedMs = Date.now() - firstAttemptStartedAt;

    // Apps Script occasionally returns a short-lived 404 or a valid JSON envelope
    // for the wrong action/method. Those failures are safe to retry because this
    // path is strictly read-only. Timeouts are intentionally NOT retried: aborting
    // the client request does not stop Apps Script, so retrying a timeout could
    // create overlapping long-running Google executions.
    if (
      !isRetryableSnapshotReadFailure(error) ||
      firstAttemptElapsedMs > MASSAGE_SNAPSHOT_RETRY_MAX_FIRST_ATTEMPT_MS
    ) {
      throw error;
    }

    await waitForSnapshotRetry();
    return legacy.getMassageSnapshotSourceBundle(scopedInput);
  }
}

export async function getMassageServices(hotelSlug: unknown) {
  const source = await requireLegacyExternalSource(hotelSlug, "read");
  return legacy.getMassageServices(source.hotel.slug);
}

export async function getMassageAvailability(
  input: Parameters<typeof legacy.getMassageAvailability>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "read");
  return legacy.getMassageAvailability({ ...input, hotelSlug: source.hotel.slug });
}

export async function getMassageBookableDates(
  input: Parameters<typeof legacy.getMassageBookableDates>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "read");
  return legacy.getMassageBookableDates({ ...input, hotelSlug: source.hotel.slug });
}

export async function getMassageBookableDateSummary(
  input: Parameters<typeof legacy.getMassageBookableDateSummary>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "read");
  return legacy.getMassageBookableDateSummary({ ...input, hotelSlug: source.hotel.slug });
}

export async function createMassageBooking(
  input: Parameters<typeof legacy.createMassageBooking>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "mirror");
  return legacy.createMassageBooking({ ...input, hotelSlug: source.hotel.slug, hotelCode: source.config.hotel_code });
}

export async function verifyMassageBooking(
  input: Parameters<typeof legacy.verifyMassageBooking>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "mirror");
  return legacy.verifyMassageBooking({ ...input, hotelSlug: source.hotel.slug, hotelCode: source.config.hotel_code });
}

export async function createMassageControlledE2EBooking(
  input: Parameters<typeof legacy.createMassageControlledE2EBooking>[0],
) {
  const source = await requireLegacyExternalSource(input.hotelSlug, "mirror");
  return legacy.createMassageControlledE2EBooking({
    ...input,
    hotelSlug: source.hotel.slug,
    hotelCode: source.config.hotel_code,
  });
}
