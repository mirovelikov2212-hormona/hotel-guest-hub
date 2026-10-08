"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import type { StaffHotelBrand } from "@/lib/server/staff-hotel-brand";
import { staffText } from "@/lib/staff/ui-copy";

const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;
const STANDARD_ROLES = ["manager", "reception", "housekeeping", "maintenance"];
const BRAND_STYLE = {
  "--staff-brand-primary": "#7c3aed",
  "--staff-brand-secondary": "#7c3aed",
  "--staff-brand-accent": "#a855f7",
  "--staff-brand-background": "#f3eef9",
  "--staff-brand-soft": "#ede9fe",
  "--staff-brand-surface": "#ffffff",
  "--staff-on-brand": "#ffffff",
} as CSSProperties;

export default function StaffHotelShell({ hotelSlug, brand, children }: {
  hotelSlug: string;
  brand: StaffHotelBrand;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const query = useSearchParams();
  const compact = hotelSlug === "demo" && query.get("demoCompact") === "1";
  const { lang, setLang } = useStaffUi();
  const copy = staffText(lang);
  const displayHotelName = hotelSlug.toLowerCase() === "demo"
    ? (lang === "bg" ? "Демо хотел" : lang === "de" ? "Demo-Hotel" : "Hotel Demo")
    : brand.hotelName;
  const role = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const candidate = parts[0] === "staff" && parts[1] ? String(parts[2] || "").toLowerCase() : "";
    return candidate && candidate !== "pin" && ROLE_PATTERN.test(candidate) ? candidate : null;
  }, [pathname]);

  return <div
    className={`stayhub-staff-shell gostaya-light-staff min-h-screen ${compact ? "gostaya-demo-compact-shell" : ""}`}
    data-staff-theme="light" data-brand-source="gostaya" style={BRAND_STYLE}
  >
    <div className="stayhub-staff-brand-rail" aria-hidden="true" />
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      {role && !STANDARD_ROLES.includes(role) ? <header className="stayhub-staff-topbar mb-5 overflow-hidden rounded-3xl border p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] opacity-70">GOSTAYA</p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">{displayHotelName}</h1>
            <p className="mt-1 text-sm opacity-65">{copy.simpleOperationalView}</p>
          </div>
          <select value={lang} onChange={(event) => setLang(event.target.value as typeof lang)}
            className="stayhub-staff-select rounded-xl border px-3 py-2 text-sm outline-none" aria-label="Staff UI language">
            <option value="bg">BG</option><option value="en">EN</option><option value="de">DE</option>
          </select>
        </div>
      </header> : null}
      <div className="stayhub-staff-workspace">{children}</div>
    </div>
  </div>;
}
