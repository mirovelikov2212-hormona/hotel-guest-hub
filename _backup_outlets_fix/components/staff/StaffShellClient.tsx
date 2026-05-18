"use client";

import type { ReactNode } from "react";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { staffText } from "@/lib/staff/ui-copy";

export default function StaffShellClient({
  children,
}: {
  children: ReactNode;
}) {
  const { lang, setLang } = useStaffUi();
  const t = staffText(lang);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-white/50">
                {t.guestHub}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                {t.staffHub}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/70">
                {t.simpleOperationalView}
              </div>

              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as typeof lang)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                aria-label="Staff UI language"
              >
                <option value="bg">BG</option>
                <option value="en">EN</option>
                <option value="de">DE</option>
              </select>
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}