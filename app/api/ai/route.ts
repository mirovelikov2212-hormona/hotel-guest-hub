import { NextResponse } from "next/server";

type Dept = "reception" | "housekeeping" | "maintenance" | "restaurant" | "events";

const UI = {
  bg: {
    fallback: "Разбрах. Изпращам заявката към екипа.",
    sent: (dept: string) => `Заявката е изпратена към: ${dept}.`,
  },
  de: {
    fallback: "Verstanden. Ich sende Ihre Anfrage an das Team.",
    sent: (dept: string) => `Anfrage gesendet an: ${dept}.`,
  },
  en: {
    fallback: "Got it. I’m sending your request to the team.",
    sent: (dept: string) => `Request sent to: ${dept}.`,
  },
} as const;

function detectDept(text: string): Dept {
  const t = text.toLowerCase();

  // housekeeping
  if (
    t.includes("towel") ||
    t.includes("towels") ||
    t.includes("хавли") ||
    t.includes("кърп") ||
    t.includes("clean") ||
    t.includes("cleaning") ||
    t.includes("почист") ||
    t.includes("toilet paper") ||
    t.includes("тоалетна хартия") ||
    t.includes("pillow") ||
    t.includes("възглав")
  ) {
    return "housekeeping";
  }

  // maintenance
  if (
    t.includes("broken") ||
    t.includes("defect") ||
    t.includes("kaputt") ||
    t.includes("счуп") ||
    t.includes("ac") ||
    t.includes("aircon") ||
    t.includes("klima") ||
    t.includes("климат") ||
    t.includes("water") ||
    t.includes("wassert") ||
    t.includes("вода") ||
    t.includes("coffee machine") ||
    t.includes("kaffeemaschine") ||
    t.includes("кафе машина")
  ) {
    return "maintenance";
  }

  // restaurant
  if (
    t.includes("reserve") ||
    t.includes("reservation") ||
    t.includes("table") ||
    t.includes("tisch") ||
    t.includes("restaurant") ||
    t.includes("allergen") ||
    t.includes("алерг")
  ) {
    return "restaurant";
  }

  // events
  if (
    t.includes("event") ||
    t.includes("programm") ||
    t.includes("program") ||
    t.includes("kids") ||
    t.includes("детск") ||
    t.includes("animation") ||
    t.includes("анимац")
  ) {
    return "events";
  }

  return "reception";
}

function deptLabelBG(dept: Dept) {
  switch (dept) {
    case "housekeeping":
      return "Housekeeping";
    case "maintenance":
      return "Поддръжка";
    case "restaurant":
      return "Ресторант";
    case "events":
      return "Събития";
    default:
      return "Рецепция";
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const question =
      body?.question ?? body?.message ?? body?.prompt ?? body?.text ?? "";

    const lang = (body?.lang ?? "en") as "bg" | "de" | "en";

    const text = String(question).trim();
    const dept = detectDept(text);

    // OPS message (always Bulgarian for staff)
    const opsMessageBG =
      `Заявка към ${deptLabelBG(dept)}:\n` +
      `${text}`;

    // UI reply (on the selected language)
    const ui = UI[lang] ?? UI.en;
    const uiReply = ui.sent(dept);

    return NextResponse.json({
      ok: true,
      department: dept,       // "housekeeping" | "maintenance" | ...
      opsMessageBG,           // message we will send to WhatsApp
      uiReply,                // what guest sees in the UI
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      department: "reception",
      opsMessageBG: "Заявка към рецепция:\n(грешка при обработка)",
      uiReply: "Error",
      error: e?.message || "Server error",
    });
  }
}
