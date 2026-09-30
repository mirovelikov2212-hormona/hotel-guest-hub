import Link from "next/link";

import { normalizeControlPlaneLang } from "@/lib/control-plane-i18n";

export const dynamic = "force-dynamic";

const COPY = {
  bg: {
    eyebrow: "GOSTAYA CONTROL PANEL",
    title: "Нова парола",
    description:
      "Задай нова силна парола за Platform Admin. След успешната промяна всички стари Control Plane сесии ще бъдат прекратени.",
    password: "Нова парола",
    confirm: "Повтори паролата",
    submit: "Смени паролата",
    rule:
      "Минимум 12 символа, с малка и главна буква, цифра и специален символ.",
    mismatch: "Паролите не съвпадат.",
    weak: "Паролата не отговаря на изискванията за сигурност.",
    invalid: "Reset линкът е невалиден или вече е използван. Поискай нов.",
    unavailable: "Паролата не можа да бъде сменена. Поискай нов reset линк.",
    newLink: "Поискай нов reset линк",
    back: "Назад към входа",
  },
  en: {
    eyebrow: "GOSTAYA CONTROL PANEL",
    title: "New password",
    description:
      "Set a new strong Platform Admin password. All previous Control Plane sessions will be revoked after the change.",
    password: "New password",
    confirm: "Confirm password",
    submit: "Change password",
    rule:
      "At least 12 characters with lowercase, uppercase, a number and a special character.",
    mismatch: "The passwords do not match.",
    weak: "The password does not meet the security requirements.",
    invalid: "The reset link is invalid or has already been used. Request a new one.",
    unavailable: "The password could not be changed. Request a new reset link.",
    newLink: "Request a new reset link",
    back: "Back to sign in",
  },
} as const;

export default async function ControlPlaneResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; token_hash?: string; error?: string }>;
}) {
  const params = await searchParams;
  const lang = normalizeControlPlaneLang(params.lang);
  const copy = COPY[lang];
  const tokenHash = String(params.token_hash || "").trim().slice(0, 512);
  const error =
    params.error === "mismatch"
      ? copy.mismatch
      : params.error === "weak"
        ? copy.weak
        : params.error === "invalid" || !tokenHash
          ? copy.invalid
          : params.error === "unavailable"
            ? copy.unavailable
            : null;

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-12 text-neutral-50">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/70">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">{copy.description}</p>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {tokenHash ? (
          <form
            action={`/api/control-plane/password-reset/confirm?lang=${lang}`}
            method="post"
            className="mt-6 space-y-4"
          >
            <input type="hidden" name="token_hash" value={tokenHash} />

            <label className="block">
              <span className="text-sm font-medium text-neutral-200">{copy.password}</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={512}
                className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-50 outline-none transition focus:border-cyan-400/60"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-200">{copy.confirm}</span>
              <input
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={512}
                className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-neutral-50 outline-none transition focus:border-cyan-400/60"
              />
            </label>

            <p className="text-xs leading-5 text-neutral-500">{copy.rule}</p>

            <button
              type="submit"
              className="w-full rounded-2xl bg-neutral-50 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-white"
            >
              {copy.submit}
            </button>
          </form>
        ) : (
          <Link
            href={`/control-plane/forgot-password?lang=${lang}`}
            className="mt-6 inline-flex rounded-xl bg-neutral-50 px-4 py-2.5 text-sm font-semibold text-neutral-950"
          >
            {copy.newLink}
          </Link>
        )}

        <div>
          <Link
            href={`/control-plane/login?lang=${lang}`}
            className="mt-5 inline-flex text-sm font-semibold text-cyan-200 hover:text-cyan-100"
          >
            {copy.back}
          </Link>
        </div>
      </section>
    </main>
  );
}
