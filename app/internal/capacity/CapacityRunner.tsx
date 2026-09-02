"use client";

import { useState } from "react";

export function CapacityRunner() {
  const [challenge, setChallenge] = useState("");
  const [communicationId, setCommunicationId] = useState("");
  const [running, setRunning] = useState<"smoke" | "cold" | "warm" | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function run(mode: "smoke" | "cold" | "warm") {
    setRunning(mode);
    setResult(null);
    try {
      const query = new URLSearchParams({ challenge });
      query.set("mode", mode);
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

  async function runCommunications() {
    setRunning("warm");
    setResult(null);
    try {
      const response = await fetch("/api/internal/factory/guest-communications-synthetic-dispatch", {
        method: "POST",
        headers: { "content-type": "application/json", "x-stayhub-factory-load-secret": challenge },
        body: JSON.stringify({ communicationId, concurrency: 50 }),
      });
      setResult(await response.json());
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
      <label style={{ display: "grid", gap: 8, marginTop: 12 }}>
        Synthetic communication ID
        <input aria-label="Synthetic communication ID" value={communicationId}
          onChange={(event) => setCommunicationId(event.target.value)} autoComplete="off" />
      </label>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button disabled={!challenge || running !== null} onClick={() => run("smoke")}>
          {running === "smoke" ? "Running smoke…" : "Run smoke"}
        </button>
        <button disabled={!challenge || running !== null} onClick={() => run("cold")}>
          {running === "cold" ? "Running cold peak…" : "Run cold peak"}
        </button>
        <button disabled={!challenge || running !== null} onClick={() => run("warm")}>
          {running === "warm" ? "Running warm peak…" : "Run warm peak"}
        </button>
        <button disabled={!challenge || !communicationId || running !== null} onClick={runCommunications}>
          Run 400-device synthetic fanout
        </button>
      </div>
      <pre aria-label="Capacity result" style={{ marginTop: 24, overflow: "auto", whiteSpace: "pre-wrap" }}>
        {result ? JSON.stringify(result, null, 2) : "No result yet."}
      </pre>
    </main>
  );
}
