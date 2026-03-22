type StaffSummaryCardProps = {
  label: string;
  value: number;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
};

export default function StaffSummaryCard({
  label,
  value,
  danger = false,
  active = false,
  onClick,
}: StaffSummaryCardProps) {
  const baseClasses = danger
    ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
    : "border-white/10 bg-white/5 text-white";

  const activeClasses = active
    ? danger
      ? "ring-2 ring-rose-300/60"
      : "ring-2 ring-violet-300/50"
    : "";

  const content = (
    <>
      <p className="text-sm text-white/50">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-2xl border p-4 text-left transition hover:border-white/20 hover:bg-white/10 ${baseClasses} ${activeClasses}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`rounded-2xl border p-4 ${baseClasses} ${activeClasses}`}>{content}</div>;
}
