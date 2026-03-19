type StaffFilterButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

export default function StaffFilterButton({
  label,
  active,
  onClick,
}: StaffFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-white text-neutral-950"
          : "border border-white/10 bg-black/20 text-white/70 hover:bg-white/10",
      ].join(" ")}
    >
      {label}
    </button>
  );
}