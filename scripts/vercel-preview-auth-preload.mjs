const trustedOidc = String(process.env.STAYHUB_VERCEL_TRUSTED_OIDC_TOKEN || "").trim();
const automationBypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();

if (!trustedOidc && !automationBypass) {
  throw new Error(
    "Protected Preview acceptance requires STAYHUB_VERCEL_TRUSTED_OIDC_TOKEN or VERCEL_AUTOMATION_BYPASS_SECRET",
  );
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") {
  throw new Error("Global fetch is unavailable for protected Preview acceptance");
}

globalThis.fetch = async (input, init = {}) => {
  const inheritedHeaders = input instanceof Request ? input.headers : undefined;
  const headers = new Headers(init.headers || inheritedHeaders);
  if (trustedOidc) {
    headers.set("x-vercel-trusted-oidc-idp-token", trustedOidc);
  } else {
    headers.set("x-vercel-protection-bypass", automationBypass);
  }
  return originalFetch(input, { ...init, headers });
};
