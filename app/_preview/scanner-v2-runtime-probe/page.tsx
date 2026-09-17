"use client";

import { useEffect, useState } from "react";

type ProbeState = {
  phase: "starting" | "credit" | "scan" | "done" | "error";
  message: string;
  runId?: string;
  scanRunId?: string;
  result?: unknown;
};

type SavedRun = {
  runId: string;
  scanRunId: string;
};

const STORAGE_KEY = "stayhub_scanner_v2_runtime_probe";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ScannerV2RuntimeProbePage() {
  const [state, setState] = useState<ProbeState>({
    phase: "starting",
    message: "Подготовка на Preview runtime тест…",
  });

  useEffect(() => {
    let cancelled = false;

    async function request(action: string, params: Record<string, string> = {}) {
      const query = new URLSearchParams({ action, ...params });
      const response = await fetch(`/api/_preview/scanner-v2-runtime-probe?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(body?.error || `probe_${action}_failed`);
      return body;
    }

    async function poll(saved: SavedRun) {
      setState({
        phase: "scan",
        message: "Workflow работи. Discovery → AI enrichment → PDF → verification → persistence…",
        runId: saved.runId,
        scanRunId: saved.scanRunId,
      });

      for (;;) {
        const polled = await request("status", { runId: saved.runId });
        if (cancelled) return;
        if (polled.status === "completed") {
          setState({
            phase: "done",
            message: "Runtime тестът завърши успешно.",
            runId: saved.runId,
            scanRunId: saved.scanRunId,
            result: polled.result,
          });
          return;
        }
        if (["failed", "cancelled"].includes(polled.status)) {
          throw new Error(`workflow_${polled.status}`);
        }
        setState({
          phase: "scan",
          message: `Workflow статус: ${polled.status}. Продължавам да следя…`,
          runId: saved.runId,
          scanRunId: saved.scanRunId,
        });
        await sleep(2500);
      }
    }

    async function run() {
      try {
        const savedRaw = window.sessionStorage.getItem(STORAGE_KEY);
        if (savedRaw) {
          const saved = JSON.parse(savedRaw) as SavedRun;
          if (saved.runId && saved.scanRunId) {
            await poll(saved);
            return;
          }
        }

        setState({ phase: "credit", message: "Проверявам OpenAI credit balance с минимална заявка…" });
        const credit = await request("credit");
        if (cancelled) return;

        setState({
          phase: "scan",
          message: `Credits OK (${credit.model}). Стартирам durable Scanner V2…`,
        });
        const started = await request("start");
        if (cancelled) return;

        const saved = { runId: started.runId, scanRunId: started.scanRunId } as SavedRun;
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        await poll(saved);
      } catch (error) {
        if (cancelled) return;
        setState({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Scanner V2 · Preview Runtime Probe</h1>
      <p style={{ marginTop: 12, fontSize: 17 }}>{state.message}</p>
      {state.runId ? <p style={{ marginTop: 12 }}><strong>Run ID:</strong> <code>{state.runId}</code></p> : null}
      {state.scanRunId ? <p style={{ marginTop: 8 }}><strong>Scan ID:</strong> <code>{state.scanRunId}</code></p> : null}
      <p style={{ marginTop: 16 }}><strong>Phase:</strong> {state.phase.toUpperCase()}</p>
      {state.result ? (
        <pre style={{ marginTop: 24, whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 18, border: "1px solid #ccc", borderRadius: 12 }}>
          {JSON.stringify(state.result, null, 2)}
        </pre>
      ) : null}
      {state.phase === "done" ? <p style={{ marginTop: 18, fontWeight: 700 }}>Можеш да ми изпратиш screenshot на този екран.</p> : null}
      {state.phase === "error" ? <p style={{ marginTop: 18, fontWeight: 700 }}>Изпрати ми screenshot на грешката.</p> : null}
    </main>
  );
}
