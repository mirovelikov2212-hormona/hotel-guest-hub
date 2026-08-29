"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";

export default function StaffCollapsiblePanel({
  title,
  summary,
  badge,
  defaultOpen = false,
  children,
  className = "",
}: {
  title: string;
  summary?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={`stayhub-staff-collapsible overflow-hidden rounded-2xl ${className}`.trim()}>
      <button
        type="button"
        className="stayhub-staff-collapsible-trigger flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{title}</span>
            {badge}
          </span>
          {summary ? (
            <span className="stayhub-staff-collapsible-summary mt-1 block text-sm leading-5">
              {summary}
            </span>
          ) : null}
        </span>
        <span
          className="stayhub-staff-collapsible-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg leading-none"
          aria-hidden="true"
        >
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div id={contentId} className="border-t px-4 py-4 sm:px-5" style={{ borderColor: "var(--staff-border)" }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
