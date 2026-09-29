"use client";

import StaffAlertSoundButton from "@/components/staff/StaffAlertSoundButton";
import ManagerPwaControls from "@/components/staff/ManagerPwaControls";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type DepartmentRole = "reception" | "housekeeping" | "maintenance";

export default function StaffDepartmentUnifiedHeader({
  hotelSlug,
  role,
  departmentTitle,
  intro,
  operationalLabel,
  soundEnabled,
  onToggleSound,
}: {
  hotelSlug?: string;
  role: DepartmentRole;
  departmentTitle: string;
  intro: string;
  operationalLabel?: string;
  soundEnabled: boolean;
  onToggleSound: () => void | Promise<void>;
}) {
  const { hotelName } = useStaffStore();
  const { lang, setLang } = useStaffUi();
  const safeHotelSlug = String(hotelSlug || "demo").trim() || "demo";
  const displayHotelName =
    safeHotelSlug.toLowerCase() === "demo"
      ? lang === "bg"
        ? "Демо хотел"
        : lang === "de"
          ? "Demo-Hotel"
          : "Hotel Demo"
      : String(hotelName || safeHotelSlug);

  return (
    <section className="staff-unified-department-header rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#1479d3]">
            GOSTAYA
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#111111]">
            {displayHotelName} - {departmentTitle}
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{intro}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:max-w-[54%] xl:justify-end">
          <StaffAlertSoundButton
            soundEnabled={soundEnabled}
            onToggle={() => void onToggleSound()}
          />

          {operationalLabel ? (
            <span className="manager-header-control inline-flex min-h-11 items-center rounded-2xl border px-4 py-2.5 text-sm font-semibold">
              {operationalLabel}
            </span>
          ) : null}

          <ManagerPwaControls hotelSlug={safeHotelSlug} role={role} embedded />

          <select
            value={lang}
            onChange={(event) => setLang(event.target.value as typeof lang)}
            className="stayhub-staff-select min-h-11 w-fit rounded-2xl border px-4 py-2.5 text-sm outline-none"
            aria-label="Език на служебния интерфейс"
          >
            <option value="bg">BG</option>
            <option value="en">EN</option>
            <option value="de">DE</option>
          </select>
        </div>
      </div>
    </section>
  );
}
