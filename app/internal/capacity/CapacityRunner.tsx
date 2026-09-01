"use client";

import { useState } from "react";

export function CapacityRunner() {
  const [challenge, setChallenge] = useState("");
  const [running, setRunning] = useState<"smoke" | "peak" | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function run(mode: "smoke" | "peak") {
    setRunning(mode);
    setResult(null);
    try {
      const query = new URLSearchParams({ challenge });
      if (mode === "smoke") query.set("mode", "smoke");
      const response = await fetch(`/api/internal/capacity/mixed-peak?${query}`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({
        ok: false,
        status: response.status,
        error: "NON_JSON_RESPONSE",
      }));
      setResult(body);
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      setRunning(null);
    }
  }

  return (
    <main style={{ margin: "40px auto", maxWidth: 900, padding: 24, fontFamily: "sans-serif" }}>
      <h1>Factory mixed capacity runner</h1>
      <p>Preview-only. Run smoke before peak.</p>
      <label style={{ display: "grid", gap: 8 }}>
        Challenge
        <input
          aria-label="Capacity challenge"
          type="password"
          value={challenge}
          onChange={(event) => setChallenge(event.target.value)}
          autoComplete="off"
        />
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button disabled={!challenge || running !== null} onClick={() => run("smoke")}>
          {running === "smoke" ? "Running smoke…" : "Run smoke"}
        </button>
        <button disabled={!challenge || running !== null} onClick={() => run("peak")}>
          {running === "peak" ? "Running peak…" : "Run peak"}
        </button>
      </div>
      <pre aria-label="Capacity result" style={{ marginTop: 24, overflow: "auto", whiteSpace: "pre-wrap" }}>
        {result ? JSON.stringify(result, null, 2) : "No result yet."}
      </pre>
    </main>
  );
}
