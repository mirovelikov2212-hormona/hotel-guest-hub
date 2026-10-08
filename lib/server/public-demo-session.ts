import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { normalizeDemoSession } from "@/lib/demo-session";
import { supabaseAdmin } from "./supabase-admin";
import { resolveHotelByAnySlugAdmin } from "./hotel-scope";

export const PUBLIC_DEMO_SESSION_COOKIE = "gostaya_public_demo_session";
export function readPublicDemoSession(req: NextRequest) {
  return normalizeDemoSession(req.cookies.get(PUBLIC_DEMO_SESSION_COOKIE)?.value);
}
export function publicDemoSessionMetadata(req: NextRequest, hotelSlug: string, isTest: boolean, room: string) {
  return hotelSlug === "demo" && isTest && room === "901"
    ? { publicDemoSessionId: readPublicDemoSession(req) || "no-session" } : {};
}
export async function beginPublicDemoSession(req: NextRequest) {
  const previous = readPublicDemoSession(req);
  if (previous) {
    const hotel = await resolveHotelByAnySlugAdmin("demo");
    const expires = new Date().toISOString();
    const results = await Promise.all([
      supabaseAdmin.from("guest_requests").update({test_expires_at: expires}).eq("hotel_id", hotel.id).eq("is_test", true).eq("room_number_snapshot", "901").contains("metadata_json", {publicDemoSessionId: previous}),
      supabaseAdmin.from("guest_surveys").update({test_expires_at: expires}).eq("hotel_id", hotel.id).eq("is_test", true).eq("room_number", "901").contains("metadata_json", {publicDemoSessionId: previous}),
    ]);
    if (results.some(result => result.error)) throw new Error("DEMO_SESSION_RESET_FAILED");
  }
  return randomUUID();
}
export function setPublicDemoSessionCookie(response: NextResponse, id: string) {
  response.cookies.set({name: PUBLIC_DEMO_SESSION_COOKIE, value:id, httpOnly:true, secure:process.env.NODE_ENV === "production", sameSite:"lax", path:"/", maxAge:7200});
}
