import "server-only";

export function createApiStageTiming(route: string, requestId: string | null) {
  const startedAt = performance.now();
  let previousAt = startedAt;
  const stages: Record<string, number> = {};

  return {
    mark(stage: string) {
      const now = performance.now();
      stages[stage] = Number((now - previousAt).toFixed(1));
      previousAt = now;
    },
    finish(result: "success" | "rejected" | "failed", context: Record<string, unknown> = {}) {
      console.log(JSON.stringify({
        level: "info",
        message: "api_stage_timing",
        route,
        requestId,
        result,
        totalMs: Number((performance.now() - startedAt).toFixed(1)),
        stages,
        ...context,
      }));
    },
  };
}
