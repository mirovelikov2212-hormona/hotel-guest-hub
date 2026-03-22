// components/marketing/Faq.tsx
"use client";

import React, { useState } from "react";

function clsx(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export default function Faq({
  items,
}: {
  items: { q: string; a: string }[];
}) {
  return (
    <div className="space-y-3">
      {items.map((it, idx) => (
        <FaqItem key={idx} q={it.q} a={it.a} />
      ))}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "w-full px-5 py-4 text-left",
          "flex items-center justify-between gap-4",
          "hover:bg-white/[0.06] transition"
        )}
      >
        <div className="font-semibold text-white">{q}</div>
        <div className="text-slate-300 text-lg">{open ? "▾" : "▸"}</div>
      </button>

      {open ? (
        <div className="px-5 pb-5">
          <div className="text-sm text-slate-300 leading-relaxed">{a}</div>
        </div>
      ) : null}
    </div>
  );
}
