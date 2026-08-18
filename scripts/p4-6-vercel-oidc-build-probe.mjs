const isPreview = process.env.VERCEL_ENV === "preview";

if (!isPreview) {
  console.log("P4.6 OIDC build probe: skipped outside Preview");
  process.exit(0);
}

const deploymentId = String(process.env.VERCEL_DEPLOYMENT_ID || "").trim();
const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
const gitSha = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim().toLowerCase();
const oidcToken = String(process.env.VERCEL_OIDC_TOKEN || "").trim();

const safe = {
  systemIdentityAvailable: Boolean(deploymentId && projectId && gitSha),
  deploymentIdAvailable: Boolean(deploymentId),
  projectIdAvailable: Boolean(projectId),
  gitShaAvailable: Boolean(gitSha),
  oidcAvailable: Boolean(oidcToken),
  managementApiStatus: 0,
  managementApiAuthenticated: false,
  deploymentMatches: false,
};

if (deploymentId && oidcToken) {
  try {
    const response = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        Accept: "application/json",
      },
    });
    safe.managementApiStatus = response.status;
    safe.managementApiAuthenticated = response.ok;
    const payload = await response.json().catch(() => null);
    safe.deploymentMatches = Boolean(
      response.ok
      && payload
      && typeof payload === "object"
      && String(payload.id || "") === deploymentId,
    );
  } catch {
    safe.managementApiStatus = -1;
  }
}

console.log(`P4.6 OIDC build probe result: ${JSON.stringify(safe)}`);
