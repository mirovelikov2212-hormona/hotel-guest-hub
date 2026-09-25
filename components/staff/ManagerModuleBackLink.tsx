import Link from "next/link";

const COPY = {
  bg: "← Назад към Manager панела",
  en: "← Back to Manager dashboard",
  de: "← Zurück zum Manager-Dashboard",
} as const;

export default function ManagerModuleBackLink({
  hotelSlug,
  lang = "bg",
}: {
  hotelSlug: string;
  lang?: keyof typeof COPY;
}) {
  return (
    <div className="mb-4">
      <Link
        href={`/staff/${hotelSlug}/manager`}
        className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
      >
        {COPY[lang] || COPY.bg}
      </Link>
    </div>
  );
}
