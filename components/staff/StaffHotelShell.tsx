"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";
import type { StaffHotelBrand } from "@/lib/server/staff-hotel-brand";
import { staffText } from "@/lib/staff/ui-copy";

type StaffThemeMode = "light" | "dark";

export default function StaffHotelShell({
  hotelSlug,
  brand,
  children,
}: {
  hotelSlug: string;
  brand: StaffHotelBrand;
  children: ReactNode;
}) {
  const { lang, setLang } = useStaffUi();
  const t = staffText(lang);
  const storageKey = useMemo(() => `stayhub:staff-theme:v1:${hotelSlug}`, [hotelSlug]);
  const [theme, setTheme] = useState<StaffThemeMode>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, [storageKey]);

  function selectTheme(nextTheme: StaffThemeMode) {
    setTheme(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
  }

  const style = {
    "--staff-brand-primary": brand.primary,
    "--staff-brand-secondary": brand.secondary,
    "--staff-brand-accent": brand.accent,
    "--staff-brand-background": brand.background,
    "--staff-brand-soft": brand.soft,
    "--staff-brand-surface": brand.surface,
  } as CSSProperties;

  return (
    <div
      className="stayhub-staff-shell min-h-screen"
      data-staff-theme={theme}
      data-brand-source={brand.source}
      style={style}
    >
      <div className="stayhub-staff-brand-rail" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="stayhub-staff-topbar mb-5 overflow-hidden rounded-3xl border p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="stayhub-staff-brand-dot" aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70">
                  StayHub Staff
                </p>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {brand.hotelName}
              </h1>
              <p className="mt-1 text-sm opacity-65">{t.simpleOperationalView}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="stayhub-staff-segmented flex rounded-xl border p-1" aria-label="Staff appearance">
                <button
                  type="button"
                  onClick={() => selectTheme("light")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${theme === "light" ? "is-active" : ""}`}
                  aria-pressed={theme === "light"}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => selectTheme("dark")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${theme === "dark" ? "is-active" : ""}`}
                  aria-pressed={theme === "dark"}
                >
                  Dark
                </button>
              </div>

              <select
                value={lang}
                onChange={(event) => setLang(event.target.value as typeof lang)}
                className="stayhub-staff-select rounded-xl border px-3 py-2 text-sm outline-none"
                aria-label="Staff UI language"
              >
                <option value="bg">BG</option>
                <option value="en">EN</option>
                <option value="de">DE</option>
              </select>
            </div>
          </div>
        </header>

        <div className="stayhub-staff-workspace">{children}</div>
      </div>
    </div>
  );
}
