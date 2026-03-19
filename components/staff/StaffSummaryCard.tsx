type StaffSummaryCardProps = {
  label: string;
  value: number;
  danger?: boolean;
};

export default function StaffSummaryCard({
  label,
  value,
  danger = false,
}: StaffSummaryCardProps) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        danger
          ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
          : "border-white/10 bg-white/5 text-white"
      }`}
    >
      <p className="text-sm text-white/50">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}