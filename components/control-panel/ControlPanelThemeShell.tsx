"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "stayhub.internal-tools.theme.v1";

const LIGHT = {
  "--cp-bg": "#F7F5FA",
  "--cp-surface": "#FFFFFF",
  "--cp-card": "#FFFFFF",
  "--cp-card-soft": "#F1EDF6",
  "--cp-text": "#0D1B2A",
  "--cp-muted": "#667085",
  "--cp-faint": "#858B96",
  "--cp-border": "#DCD4E8",
  "--cp-accent": "#7A659B",
  "--cp-accent-soft": "#F1EBF7",
  "--cp-shadow": "0 24px 70px rgba(13, 27, 42, 0.10)",
} as CSSProperties;

const DARK = {
  "--cp-bg": "#0D1B2A",
  "--cp-surface": "#122235",
  "--cp-card": "#14273A",
  "--cp-card-soft": "#182C42",
  "--cp-text": "#FFFFFF",
  "--cp-muted": "#BEC5CF",
  "--cp-faint": "#8E99A8",
  "--cp-border": "#34455A",
  "--cp-accent": "#C8B9DF",
  "--cp-accent-soft": "#2A2940",
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
