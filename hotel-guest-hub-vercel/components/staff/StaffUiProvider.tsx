"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type StaffUiLang = "bg" | "en" | "de";

type StaffUiContextValue = {
  lang: StaffUiLang;
  setLang: (lang: StaffUiLang) => void;
};

const STAFF_UI_LANG_KEY = "guesthub_staff_ui_lang";
const StaffUiContext = createContext<StaffUiContextValue | null>(null);

export function StaffUiProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<StaffUiLang>("bg");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STAFF_UI_LANG_KEY) as StaffUiLang | null;
    if (stored === "bg" || stored === "en" || stored === "de") {
      setLangState(stored);
    }
  }, []);

  const setLang = (next: StaffUiLang) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STAFF_UI_LANG_KEY, next);
    }
  };

  const value = useMemo(() => ({ lang, setLang }), [lang]);

  return <StaffUiContext.Provider value={value}>{children}</StaffUiContext.Provider>;
}

export function useStaffUi() {
  const context = useContext(StaffUiContext);
  if (!context) {
    throw new Error("useStaffUi must be used inside StaffUiProvider");
  }
  return context;
}
