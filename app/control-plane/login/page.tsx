import Link from "next/link";
import { redirect } from "next/navigation";

import {
  controlPlaneHref,
  normalizeControlPlaneLang,
} from "@/lib/control-plane-i18n";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    title: "Администратор на платформата",
    description:
      "Отделен административен достъп за управление на StayHub платформата. Hotel Manager PIN не дава достъп тук.",
    invalid: "Невалиден имейл, парола или липсващо Platform Admin право.",
    unavailable: "Control Plane входът временно не е достъпен.",
    email: "Имейл",
    password: "Парола",
    signIn: "Вход в Control Plane",
  },
  en: {
    title: "Platform Administrator",
    description:
      "Separate administrative access for managing the StayHub platform. A Hotel Manager PIN does not grant access here.",
    invalid: "Invalid email, password, or missing Platform Admin authority.",
    unavailable: "Control Plane sign-in is temporarily unavailable.",
    email: "Email",
    password: "Password",
    signIn: "Sign in to Control Plane",
  },
} as const;

export default async function ControlPlaneLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; lang?: string }>;
}) {
  const { error, lang: rawLang } = await searchParams;
  const lang = normalizeControlPlaneLang(rawLang);
  const copy = COPY[lang];

  const existing = await getCurrentPlatformAdminSession();
  if (existing) redirect(controlPlaneHref("/control-plane", lang));

  const errorMessage =
    error === "invalid"
      ? copy.invalid
      : error === "unavailable"
        ? copy.unavailable
        : null;

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-12 text-neutral-50">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">
              StayHub Control Plane
            </p>
            <h1 className="mt-3 text-2xl font-semibold">{copy.title}</h1>
          </div>
          <div className="flex rounded-xl border border-neutral-700 bg-neutral-950 p-1 text-xs font-semibold">
            <Link
              href="/control-plane/login?lang=bg"
              className={`rounded-lg px-3 py-1.5 ${lang === "bg" ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:text-neutral-100"}`}
            >
              BG
            </Link>
            <Link
              href="/control-plane/login?lang=en"
              className={`rounded-lg px-3 py-1.5 ${lang === "en" ? "bg-neutral-100 text-neutral-950" : "text-neutral-400 hover:text-neutral-100"}`}
            >
              EN
            </Link>
          </div>
        </div>

        <p className="mt-3 text-sm leading-6 text-neutral-400">{copy.description}</p>

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {/* P1.2 base endpoint invariant: action="/api/control-plane/login"; ?lang only preserves presentation. */}
        <form
          action={`/api/control-plane/login?lang=${lang}`}
          method="post"
          className="mt-6 space-y-4"
        >
          <label className="block">
            <span className="text-sm font-medium text-neutral-200">{copy.email}</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={320}
              className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-50 outline-none transition focus:border-cyan-400/60"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-neutral-200">{copy.password}</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={512}
              className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-50 outline-none transition focus:border-cyan-400/60"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-2xl bg-neutral-50 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-white"
          >
            {copy.signIn}
          </button>
        </form>
      </section>
    </main>
  );
}
