// components/marketing/Section.tsx
"use client";

import React from "react";

export default function Section({
  title,
  subtitle,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-5">
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2 text-sm md:text-base text-slate-300 leading-relaxed max-w-3xl">
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
