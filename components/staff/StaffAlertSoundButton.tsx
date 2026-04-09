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
        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
        soundEnabled
          ? "border-violet-400/30 bg-violet-400/12 text-violet-50 hover:bg-violet-400/16"
          : "border-white/10 bg-black/20 text-white/80 hover:bg-white/10",
      ].join(" ")}
    >
      <span className="text-lg leading-none">{soundEnabled ? "🔔" : "🔕"}</span>
      <div>
        <div className="text-sm font-semibold">
          {soundEnabled ? t.alertSoundOn : t.alertSoundOff}
        </div>
        <div className="text-xs text-white/60">{t.soundAlertsLabel}</div>
      </div>
    </button>
  );
}
