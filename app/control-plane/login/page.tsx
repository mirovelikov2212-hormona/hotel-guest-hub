import { redirect } from "next/navigation";
import { getCurrentPlatformAdminSession } from "@/lib/server/control-plane-session";

export const dynamic = "force-dynamic";

export default async function ControlPlaneLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const existing = await getCurrentPlatformAdminSession();
  if (existing) redirect("/control-plane");

  const { error } = await searchParams;
  const errorMessage =
    error === "invalid"
      ? "Невалиден имейл, парола или липсващо Platform Admin право."
      : error === "unavailable"
        ? "Control Plane входът временно не е достъпен."
        : null;

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-12 text-neutral-50">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">
          StayHub Control Plane
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Platform Admin</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Отделен административен достъп за управление на StayHub платформата. Hotel Manager PIN не дава достъп тук.
        </p>

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <form action="/api/control-plane/login" method="post" className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-neutral-200">Имейл</span>
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
            <span className="text-sm font-medium text-neutral-200">Парола</span>
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
            Вход в Control Plane
          </button>
        </form>
      </section>
    </main>
  );
}
