import "server-only";

import {
  getPrimedFactoryRuntimeByHotelId,
  getPrimedFactoryTestRoomNumbersForHotelIds,
} from "@/lib/server/factory-guest-context";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type TestRoomPolicy = {
  isTest: boolean;
  autoDeleteAfterSeconds: number | null;
  expiresAt: string | null;
};

const DEFAULT_TEST_AUTO_DELETE_SECONDS = 180;
const MIN_TEST_AUTO_DELETE_SECONDS = 30;
const MAX_TEST_AUTO_DELETE_SECONDS = 60 * 60;
const POLICY_CACHE_TTL_MS = 60_000;

const policyCache = new Map<string, { cachedAt: number; policy: TestRoomPolicy }>();
const roomListCache = new Map<string, { cachedAt: number; roomNumbers: string[] }>();
let lastCleanupByHotel = new Map<string, number>();

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function normalizeHotelIds(hotelIds: Array<string | null | undefined>) {
  return Array.from(
    new Set(hotelIds.map((value) => String(value || "").trim()).filter(Boolean)),
  ).sort();
}

export function primeActiveTestRoomNumbersRuntimeCache(
  hotelIds: Array<string | null | undefined>,
  roomNumbers: unknown[],
) {
  const normalizedHotelIds = normalizeHotelIds(hotelIds);
  if (!normalizedHotelIds.length) return;
  const normalizedRoomNumbers = Array.from(
    new Set(roomNumbers.map(normalizeRoomNumber).filter(Boolean)),
  ).sort();
  roomListCache.set(normalizedHotelIds.join(":"), {
    cachedAt: Date.now(),
    roomNumbers: normalizedRoomNumbers,
  });
}

function normalizeAutoDeleteSeconds(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_TEST_AUTO_DELETE_SECONDS;
  return Math.min(MAX_TEST_AUTO_DELETE_SECONDS, Math.max(MIN_TEST_AUTO_DELETE_SECONDS, Math.round(seconds)));
}

function emptyPolicy(): TestRoomPolicy {
  return { isTest: false, autoDeleteAfterSeconds: null, expiresAt: null };
}

function isLikelyMissingSchemaError(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").trim();

  return (
    code === "PGRST204" ||
    code === "42P01" ||
    code === "42703" ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("column")
  );
}

export async function getTestRoomPolicy(hotelId: string | null | undefined, roomNumber: unknown): Promise<TestRoomPolicy> {
  const normalizedHotelId = String(hotelId || "").trim();
  const normalizedRoom = normalizeRoomNumber(roomNumber);

  if (!normalizedHotelId || !normalizedRoom) return emptyPolicy();

  const cacheKey = `${normalizedHotelId}:${normalizedRoom}`;
  const cached = policyCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < POLICY_CACHE_TTL_MS) {
    if (!cached.policy.isTest) return cached.policy;
    const seconds = cached.policy.autoDeleteAfterSeconds || DEFAULT_TEST_AUTO_DELETE_SECONDS;
    return {
      ...cached.policy,
      expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    };
  }

  // Certified Factory runtime invalidates when hotel_test_rooms membership
  // changes. A room absent from its authoritative test-room list is therefore a
  // safe negative answer and does not need another database roundtrip. Listed
  // rooms still use the legacy row read because custom expiry seconds are not
  // part of the materialized runtime contract.
  const factoryRuntime = getPrimedFactoryRuntimeByHotelId(normalizedHotelId);
  if (factoryRuntime && !factoryRuntime.testRoomNumbers.includes(normalizedRoom)) {
    const policy = emptyPolicy();
    policyCache.set(cacheKey, { cachedAt: Date.now(), policy });
    return policy;
  }

  const { data, error } = await supabaseAdmin
    .from("hotel_test_rooms")
    .select("auto_delete_after_seconds")
    .eq("hotel_id", normalizedHotelId)
    .eq("room_number", normalizedRoom)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (!isLikelyMissingSchemaError(error)) {
      console.error("Failed to resolve StayHub test room policy", { hotelId: normalizedHotelId, roomNumber: normalizedRoom, error });
    }
    const policy = emptyPolicy();
    policyCache.set(cacheKey, { cachedAt: Date.now(), policy });
    return policy;
  }

  if (!data) {
    const policy = emptyPolicy();
    policyCache.set(cacheKey, { cachedAt: Date.now(), policy });
    return policy;
  }

  const seconds = normalizeAutoDeleteSeconds((data as { auto_delete_after_seconds?: unknown }).auto_delete_after_seconds);
  const policy = {
    isTest: true,
    autoDeleteAfterSeconds: seconds,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
  };
  policyCache.set(cacheKey, { cachedAt: Date.now(), policy });
  return policy;
}

export async function getEffectiveTestRoomPolicy(
  input: {
    hotelId: string | null | undefined;
    isSandbox?: boolean | null;
    productionHotelId?: string | null;
  },
  roomNumber: unknown,
): Promise<TestRoomPolicy> {
  const normalizedRoom = normalizeRoomNumber(roomNumber);
  const primedRooms = getPrimedFactoryTestRoomNumbersForHotelIds([
    input.hotelId,
    input.isSandbox ? input.productionHotelId : null,
  ]);
  if (primedRooms && normalizedRoom && !primedRooms.includes(normalizedRoom)) {
    return emptyPolicy();
  }

  const directPolicy = await getTestRoomPolicy(input.hotelId, roomNumber);
  if (directPolicy.isTest || !input.isSandbox || !input.productionHotelId) {
    return directPolicy;
  }

  return getTestRoomPolicy(input.productionHotelId, roomNumber);
}

export async function getActiveTestRoomNumbers(
  hotelIds: Array<string | null | undefined>,
): Promise<string[]> {
  const normalizedHotelIds = normalizeHotelIds(hotelIds);

  if (!normalizedHotelIds.length) return [];

  const primedFactoryRooms = getPrimedFactoryTestRoomNumbersForHotelIds(normalizedHotelIds);
  if (primedFactoryRooms) return primedFactoryRooms;

  const cacheKey = normalizedHotelIds.join(":");
  const cached = roomListCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < POLICY_CACHE_TTL_MS) {
    return cached.roomNumbers;
  }

  const { data, error } = await supabaseAdmin
    .from("hotel_test_rooms")
    .select("room_number")
    .in("hotel_id", normalizedHotelIds)
    .eq("is_active", true);

  if (error) {
    if (!isLikelyMissingSchemaError(error)) {
      console.error("Failed to load StayHub test room list", { hotelIds: normalizedHotelIds, error });
    }
    roomListCache.set(cacheKey, { cachedAt: Date.now(), roomNumbers: [] });
    return [];
  }

  const roomNumbers = Array.from(
    new Set((data || []).map((row) => normalizeRoomNumber(row.room_number)).filter(Boolean)),
  ).sort();
  roomListCache.set(cacheKey, { cachedAt: Date.now(), roomNumbers });
  return roomNumbers;
}

export function getTestDataFields(policy: TestRoomPolicy) {
  return {
    is_test: policy.isTest,
    test_expires_at: policy.expiresAt,
  };
}

export function getTestDataMetadata(policy: TestRoomPolicy) {
  if (!policy.isTest) return { isTest: false };

  return {
    isTest: true,
    testAutoDeleteAfterSeconds: policy.autoDeleteAfterSeconds,
    testExpiresAt: policy.expiresAt,
  };
}

export async function cleanupExpiredTestData(hotelId: string | null | undefined) {
  const normalizedHotelId = String(hotelId || "").trim();
  if (!normalizedHotelId) return null;

  const now = Date.now();
  const lastCleanup = lastCleanupByHotel.get(normalizedHotelId) || 0;
  if (now - lastCleanup < 30_000) return null;
  lastCleanupByHotel.set(normalizedHotelId, now);

  const { data, error } = await supabaseAdmin.rpc("cleanup_expired_test_data", {
    p_hotel_id: normalizedHotelId,
  });

  if (error) {
    if (!isLikelyMissingSchemaError(error)) {
      console.error("Failed to cleanup expired StayHub test data", {
        hotelId: normalizedHotelId,
        error,
      });
    }
    return null;
  }

  return data;
}
