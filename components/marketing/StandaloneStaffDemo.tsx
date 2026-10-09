"use client";

import { useEffect, useState } from "react";
import { normalizeDemoSession } from "@/lib/demo-session";
import "./standalone-staff-demo.css";

type Role = "manager" | "reception" | "housekeeping" | "maintenance";
type Lang = "bg" | "en" | "de";
const COPY = {
  bg: { back: "Към сайта", loading: "Подготвяме панела…", error: "Панелът не можа да се зареди.", retry: "Опитай отново", roles: { manager: "Мениджър", reception: "Рецепция", housekeeping: "Хаускипинг", maintenance: "Технически отдел" } },
  en: { back: "Back to website", loading: "Preparing the panel…", error: "The panel could not be loaded.", retry: "Try again", roles: { manager: "Manager", reception: "Reception", housekeeping: "Housekeeping", maintenance: "Maintenance" } },
  de: { back: "Zur Website", loading: "Bereich wird vorbereitet…", error: "Der Bereich konnte nicht geladen werden.", retry: "Erneut versuchen", roles: { manager: "Manager", reception: "Rezeption", housekeeping: "Housekeeping", maintenance: "Technik" } },
};

/** Authenticates only the selected demo role; renders no guest hub or other panels. */
export default function StandaloneStaffDemo({ role, lang }: { role: Role; lang: Lang }) {
  const [session, setSession] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const copy = COPY[lang];
  useEffect(() => {
    const controller = new AbortController();
    async function prepare() {
      try {
        const access = new FormData();
        access.set("pin", "2026");
        access.set("next", "/h/demo");
        const guest = await fetch("/api/demo-access", { method: "POST", body: access, credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const id = normalizeDemoSession(new URL(guest.url).searchParams.get("demoSession"));
        if (!guest.ok || !id) throw new Error("Demo session unavailable");
        const staff = await fetch("/api/staff/auth/login", { method: "POST", credentials: "same-origin", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hotelSlug: "demo", role, pin: "2026" }) });
        if (!staff.ok) throw new Error("Demo role unavailable");
        if (!controller.signal.aborted) setSession(id);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void prepare();
    return () => controller.abort();
  }, [role, attempt]);
  return <main className="gostaya-standalone-panel">
    <header><strong>GOSTAYA <span>· {copy.roles[role]}</span></strong><a href={`/${lang}`}>← {copy.back}</a></header>
    {session ? <iframe title={copy.roles[role]} src={`/staff/demo/${role}?experience=1&demoSession=${session}`} allow="clipboard-read; clipboard-write" /> :
      <div role="status"><p>{failed ? copy.error : copy.loading}</p>{failed ? <button onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>{copy.retry}</button> : null}</div>}
  </main>;
}
