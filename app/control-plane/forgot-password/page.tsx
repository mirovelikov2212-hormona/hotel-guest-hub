import Link from "next/link";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "GOSTAYA CONTROL PANEL",
    title: "Забравена парола",
    description:
      "Въведи имейла на Platform Admin акаунта. Ако има активен администратор с този имейл, ще изпратим еднократен линк за смяна на паролата.",
    email: "Имейл",
    send: "Изпрати reset линк",
    sent:
      "Ако този имейл принадлежи на активен Platform Admin, reset линкът е изпратен. Провери входящата поща и Spam.",
    unavailable:
      "В момента reset имейлът не може да бъде изпратен. Опитай отново след малко.",
    back: "Назад към входа",
  },
  en: {
    eyebrow: "GOSTAYA CONTROL PANEL",
    title: "Forgot password",
    description:
      "Enter the Platform Admin email. If an active administrator exists for this email, a one-time password reset link will be sent.",
    email: "Email",
    send: "Send reset link",
    sent:
      "If this email belongs to an active Platform Admin, a reset link has been sent. Check your inbox and Spam folder.",
    unavailable:
      "The reset email cannot be sent right now. Please try again shortly.",
    back: "Back to sign in",
  },
} as const;

export default async function ControlPlaneForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const lang = normalizeControlPlaneLang(params.lang);
  const copy = COPY[lang];

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-12 text-neutral-50">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">{copy.description}</p>

        {params.sent === "1" ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {copy.sent}
          </div>
        ) : null}

        {params.error === "unavailable" ? (
          <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {copy.unavailable}
          </div>
        ) : null}

        <form
          action={`/api/control-plane/password-reset/request?lang=${lang}`}
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

          <button
            type="submit"
            className="w-full rounded-2xl bg-neutral-50 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-white"
          >
            {copy.send}
          </button>
        </form>

        <Link
          href={`/control-plane/login?lang=${lang}`}
          className="mt-5 inline-flex text-sm font-semibold text-cyan-200 hover:text-cyan-100"
        >
          {copy.back}
        </Link>
      </section>
    </main>
  );
}
