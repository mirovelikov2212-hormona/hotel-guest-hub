const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normalizeDemoSession(value: unknown) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
export function currentDemoSession() {
  if (typeof window === "undefined" || window.location.pathname !== "/h/demo") return null;
  return normalizeDemoSession(new URLSearchParams(window.location.search).get("demoSession"));
}
export function demoStorageKey(key: string) {
  const session = currentDemoSession();
  return session ? `${key}:demo:${session}` : key;
}
