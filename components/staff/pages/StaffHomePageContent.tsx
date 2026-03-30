"use client";

import Link from "next/link";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { staffText } from "@/lib/staff/ui-copy";

type Props = { hotelSlug: string };

type StaffAreaCard = {
  titleKey: "housekeeping" | "maintenance" | "reception" | "managerDashboard";
  descriptionKey: "housekeepingDesc" | "maintenanceDesc" | "receptionDesc" | "managerDesc";
  href: string;
  badgeKey: "departmentBadge" | "controlBadge" | "managementBadge";
};

export default function StaffHomePageContent({ hotelSlug }: Props) {
  const { lang } = useStaffUi();
  const t = staffText(lang);

  const staffAreas: StaffAreaCard[] = [
    {
      titleKey: "housekeeping",
      descriptionKey: "housekeepingDesc",
      href: `/staff/${hotelSlug}/housekeeping`,
      badgeKey: "departmentBadge",
    },
    {
      titleKey: "maintenance",
      descriptionKey: "maintenanceDesc",
      href: `/staff/${hotelSlug}/maintenance`,
      badgeKey: "departmentBadge",
    },
    {
      titleKey: "reception",
      descriptionKey: "receptionDesc",
      href: `/staff/${hotelSlug}/reception`,
      badgeKey: "controlBadge",
    },
    {
      titleKey: "managerDashboard",
      descriptionKey: "managerDesc",
      href: `/staff/${hotelSlug}/manager`,
      badgeKey: "managementBadge",
    },
  ];

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-xl font-semibold tracking-tight">{t.staffHubModules}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">{t.staffHubIntro}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {staffAreas.map((area) => (
          <Link
            key={area.href}
            href={area.href}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/10"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/70">
                {t[area.badgeKey]}
              </span>

              <span className="text-sm text-white/40 transition group-hover:text-white/70">{t.openArrow}</span>
            </div>

            <h3 className="text-lg font-semibold">{t[area.titleKey]}</h3>
            <p className="mt-2 text-sm leading-6 text-white/70">{t[area.descriptionKey]}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5">
        <h3 className="text-base font-semibold text-amber-200">{t.confirmedProductDecisions}</h3>

        <div className="mt-3 grid gap-3 text-sm leading-6 text-amber-50/90 sm:grid-cols-2">
          <div className="rounded-xl border border-amber-300/10 bg-black/10 p-3">{t.confirmedDecision1}</div>
          <div className="rounded-xl border border-amber-300/10 bg-black/10 p-3">{t.confirmedDecision2}</div>
          <div className="rounded-xl border border-amber-300/10 bg-black/10 p-3">{t.confirmedDecision3}</div>
          <div className="rounded-xl border border-amber-300/10 bg-black/10 p-3">{t.confirmedDecision4}</div>
        </div>
      </section>
    </main>
  );
}
