"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "stayhub:control-panel-theme:v1";

const LIGHT = {
  "--cp-bg": "#f3f7f8",
  "--cp-surface": "#ffffff",
  "--cp-card": "#ffffff",
  "--cp-card-soft": "#f7fafb",
  "--cp-text": "#102a2d",
  "--cp-muted": "#5c7073",
  "--cp-faint": "#87979a",
  "--cp-border": "#d9e5e6",
  "--cp-accent": "#087f7b",
  "--cp-accent-soft": "#e4f6f3",
  "--cp-shadow": "0 24px 70px rgba(31, 72, 75, 0.10)",
} as CSSProperties;

const DARK = {
  "--cp-bg": "#090d0e",
  "--cp-surface": "#12191a",
  "--cp-card": "#151d1e",
  "--cp-card-soft": "#101718",
  "--cp-text": "#f3f8f8",
  "--cp-muted": "#a3b2b4",
  "--cp-faint": "#6f8082",
  "--cp-border": "#293638",
  "--cp-accent": "#67d9cf",
  "--cp-accent-soft": "#153936",
  "--cp-shadow": "0 24px 70px rgba(0, 0, 0, 0.34)",
} as CSSProperties;

export default function ControlPanelThemeShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  const variables = useMemo(() => theme === "dark" ? DARK : LIGHT, [theme]);

  function toggleTheme() {
    setTheme((current) => {
      const next: Theme = current === "light" ? "dark" : "light";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return (
    <div style={variables} data-control-panel-theme={theme} className="min-h-screen bg-[var(--cp-bg)] text-[var(--cp-text)] transition-colors duration-200">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "light" ? "Switch Control Panel to dark theme" : "Switch Control Panel to light theme"}
        className="fixed bottom-5 right-5 z-50 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-surface)] px-4 text-xs font-semibold text-[var(--cp-text)] shadow-lg transition hover:-translate-y-0.5"
      >
        <span aria-hidden="true">{theme === "light" ? "☀" : "◐"}</span>
        {theme === "light" ? "Light" : "Dark"}
      </button>
      {children}
    </div>
  );
}
