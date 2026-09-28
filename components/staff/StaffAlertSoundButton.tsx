"use client";

import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { staffText } from "@/lib/staff/ui-copy";

export default function StaffAlertSoundButton({
  soundEnabled,
  onToggle,
}: {
  soundEnabled: boolean;
  onToggle: () => void;
}) {
  const { lang } = useStaffUi();
  const t = staffText(lang);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={soundEnabled}
      className={[
        "manager-header-control flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-sm font-semibold transition",
        soundEnabled
          ? "border-violet-400/30 bg-violet-400/12 text-violet-50 hover:bg-violet-400/16"
          : "border-white/10 bg-black/20 text-white/80 hover:bg-white/10",
      ].join(" ")}
    >
      <span className="text-base leading-none">{soundEnabled ? "🔔" : "🔕"}</span>
      <span>{soundEnabled ? t.alertSoundOn : t.alertSoundOff}</span>
    </button>
  );
}
