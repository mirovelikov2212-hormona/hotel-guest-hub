"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "stayhub.internal-tools.theme.v1";
type ToolsTheme = "light" | "dark";

export default function ToolsThemeShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ToolsTheme>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") setTheme(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [hydrated, theme]);

  const nextTheme: ToolsTheme = theme === "light" ? "dark" : "light";
  return (
    <div className="stayhub-tools-shell" data-stayhub-tools-theme={theme}>
      <button
        type="button"
        className="stayhub-tools-theme-toggle"
        onClick={() => setTheme(nextTheme)}
        aria-label={`Switch to ${nextTheme} theme`}
        title={`Switch to ${nextTheme} theme`}
      >
        <span aria-hidden="true">{theme === "light" ? "◐" : "◑"}</span>
        <span>{theme === "light" ? "Dark" : "Light"}</span>
      </button>
      {children}
    </div>
  );
}
