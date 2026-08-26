"use client";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

export type CommunicationDepartmentDraft = {
  key: string;
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
};

const COPY = {
  bg: {
    title: "Комуникации",
    intro:
      "Добави guest-facing телефон, WhatsApp и email за хотелските отдели. Venue reservation контактите остават в Native Venues и не се дублират тук.",
    help:
      "Контактите са optional. Те се записват в canonical department.contact и се използват от Guest runtime; integration credentials и staff лични контакти не принадлежат тук.",
    phone: "Телефон",
    whatsapp: "WhatsApp",
    email: "Email",
    emptyId: "Първо въведи валиден код на отдела в стъпката „Отдели“.",
  },
  en: {
    title: "Communications",
    intro:
      "Add guest-facing phone, WhatsApp, and email channels for hotel departments. Venue reservation contacts stay in Native Venues and are not duplicated here.",
    help:
      "Contacts are optional. They are stored in canonical department.contact and used by Guest runtime; integration credentials and staff personal contacts do not belong here.",
    phone: "Phone",
    whatsapp: "WhatsApp",
    email: "Email",
    emptyId: "Enter a valid department code in the Departments step first.",
  },
} as const;

const input =
  "mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-500";

export function validateCommunicationDepartments(
  departments: CommunicationDepartmentDraft[],
) {
  return departments.every((department) => {
    if (!department.id.trim()) return false;
    if (department.phone.trim().length > 160) return false;
    if (department.whatsapp.trim().length > 160) return false;
    const email = department.email.trim();
    if (email.length > 320) return false;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    return true;
  });
}

export default function FactoryCommunicationsStep({
  lang,
  departments,
  onPatch,
}: {
  lang: ControlPlaneLang;
  departments: CommunicationDepartmentDraft[];
  onPatch: (
    key: string,
    patch: Partial<Pick<CommunicationDepartmentDraft, "phone" | "whatsapp" | "email">>,
  ) => void;
}) {
  const copy = COPY[lang];

  return (
    <div className="mt-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{copy.title}</h2>
        <p className="mt-1 text-sm text-neutral-400">{copy.intro}</p>
        <p className="mt-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs leading-5 text-cyan-100">
          {copy.help}
        </p>
      </div>

      <div className="space-y-3">
        {departments.map((department) => (
          <div
            key={department.key}
            className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
          >
            <div>
              <p className="font-semibold text-neutral-100">
                {department.name.trim() || department.id.trim() || "Department"}
              </p>
              <p className="text-xs text-neutral-500">
                {department.id.trim() || copy.emptyId}
              </p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-neutral-400">
                {copy.phone}
                <input
                  value={department.phone}
                  onChange={(event) => onPatch(department.key, { phone: event.target.value })}
                  placeholder="+49 30 123456"
                  className={input}
                />
              </label>
              <label className="text-xs text-neutral-400">
                {copy.whatsapp}
                <input
                  value={department.whatsapp}
                  onChange={(event) => onPatch(department.key, { whatsapp: event.target.value })}
                  placeholder="+49 151 12345678"
                  className={input}
                />
              </label>
              <label className="text-xs text-neutral-400">
                {copy.email}
                <input
                  type="email"
                  value={department.email}
                  onChange={(event) => onPatch(department.key, { email: event.target.value })}
                  placeholder="reception@example.com"
                  className={input}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
