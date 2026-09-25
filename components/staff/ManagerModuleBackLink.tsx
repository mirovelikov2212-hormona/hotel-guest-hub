"use client";

import Link from "next/link";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

const COPY = {
  bg: "← Назад към Manager панела",
  en: "← Back to Manager dashboard",
  de: "← Zurück zum Manager-Dashboard",
} as const;

export default function ManagerModuleBackLink({
  hotelSlug,
}: {
  hotelSlug: string;
}) {
  const { lang } = useStaffUi();
  return (
    <div className="mb-4">
      <Link
        href={`/staff/${hotelSlug}/manager`}
        className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
      >
        {COPY[lang] || COPY.en}
      </Link>
    </div>
  );
}
