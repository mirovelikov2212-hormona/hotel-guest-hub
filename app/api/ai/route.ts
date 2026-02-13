import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Accept multiple possible keys from UI:
    const raw =
      body?.message ??
      body?.prompt ??
      body?.question ??
      body?.input ??
      body?.text ??
      "";

    const text = String(raw).toLowerCase().trim();

    let reply = "Благодаря! Моля, обърнете се към рецепция за допълнителна информация.";

    if (text.includes("wifi") || text.includes("wlan")) {
      reply = "WiFi: HotelGuest\nPassword: Welcome2026";
    } else if (text.includes("towel") || text.includes("towels") || text.includes("хавли")) {
      reply = "Хавлии: изпращам заявка към Housekeeping. (Демо отговор)";
    } else if (text.includes("breakfast") || text.includes("закуска")) {
      reply = "Закуската е от 07:30 до 10:00 в ресторанта.";
    } else if (text.includes("checkout") || text.includes("check-out") || text.includes("check out")) {
      reply = "Check-out е до 11:00 часа.";
    } else if (text.includes("pool") || text.includes("басейн")) {
      reply = "Басейнът работи от 09:00 до 18:00.";
    }

    // Return multiple keys so ANY client expectation works:
    return NextResponse.json({
      reply,          // your UI might use this
      answer: reply,  // some UIs use answer
      result: reply,  // others use result
      ok: true,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 200 } // keep 200 so UI doesn't auto-fail on non-2xx
    );
  }
}
