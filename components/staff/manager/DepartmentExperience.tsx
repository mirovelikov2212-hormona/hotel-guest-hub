"use client";

import type { ReactNode } from "react";
import ManagerExperience from "./ManagerExperience";
import type { ManagerModule } from "./ManagerModuleDialog";
import ManagerPwaControls from "../ManagerPwaControls";
import StaffAlertSoundButton from "../StaffAlertSoundButton";
import StaffDevelopmentAccessCard from "../StaffDevelopmentAccessCard";
import { useStaffStore } from "../store/StaffStoreProvider";
import { useStaffUi } from "../StaffUiProvider";

type Role = "reception" | "housekeeping" | "maintenance";
const COPY = {
  bg: { roles: { reception: "Рецепция", housekeeping: "Хаускипинг", maintenance: "Технически отдел" }, requests: "Заявки", training: "Стандарти и обучения", settings: "Известия и настройки", tasks: "Задачите и статусите на отдела", learn: "Материали и правила за екипа", configure: "Звук и push известия" },
  en: { roles: { reception: "Reception", housekeeping: "Housekeeping", maintenance: "Maintenance" }, requests: "Requests", training: "Standards and training", settings: "Notifications and settings", tasks: "Department tasks and statuses", learn: "Team materials and rules", configure: "Sound and push notifications" },
  de: { roles: { reception: "Rezeption", housekeeping: "Housekeeping", maintenance: "Technik" }, requests: "Anfragen", training: "Standards und Schulungen", settings: "Mitteilungen und Einstellungen", tasks: "Aufgaben und Status der Abteilung", learn: "Materialien und Regeln für das Team", configure: "Ton und Push-Mitteilungen" },
};

/** Shared intro; the existing role-scoped components own all operational actions. */
export default function DepartmentExperience({ role, operations, extraModules = [], count, soundEnabled, onToggleSound }: {
  role: Role;
  operations: ReactNode;
  extraModules?: ManagerModule[];
  count: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
}) {
  const { hotelSlug, hotelName } = useStaffStore();
  const { lang, setLang } = useStaffUi();
  const copy = COPY[lang];
  const slug = hotelSlug || "demo";
  const displayHotelName = slug === "demo"
    ? (lang === "bg" ? "Демо хотел" : lang === "de" ? "Demo-Hotel" : "Demo hotel")
    : hotelName || slug;
  const modules: ManagerModule[] = [
    { id: "requests", label: copy.requests, description: copy.tasks, icon: role === "maintenance" ? "hammer_and_wrench" : "clipboard", badge: count, content: operations },
    ...extraModules,
    { id: "training", label: copy.training, description: copy.learn, icon: "graduation_cap", content: <StaffDevelopmentAccessCard hotelSlug={slug} role={role} /> },
    { id: "settings", label: copy.settings, description: copy.configure, icon: "desktop_computer", content: <><ManagerPwaControls hotelSlug={slug} role={role} /><StaffAlertSoundButton soundEnabled={soundEnabled} onToggle={onToggleSound} /></> },
  ];
  return <ManagerExperience hotelSlug={slug} hotelName={displayHotelName} lang={lang} role={role} panelTitle={copy.roles[role]} modules={modules}
    toolbar={<select value={lang} onChange={(event) => setLang(event.target.value as typeof lang)} aria-label="Staff UI language"><option value="bg">BG</option><option value="en">EN</option><option value="de">DE</option></select>} />;
}
