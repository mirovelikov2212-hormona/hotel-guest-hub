import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  const deploymentId = String(process.env.VERCEL_DEPLOYMENT_ID || "").trim();
  const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
  const gitSha = String(process.env.VERCEL_GIT_COMMIT_SHA || "").trim().toLowerCase();
  const oidcToken = String(process.env.VERCEL_OIDC_TOKEN || "").trim();

  if (!deploymentId || !projectId || !gitSha || !oidcToken) {
    return NextResponse.json({
      ok: false,
      systemIdentityAvailable: Boolean(deploymentId && projectId && gitSha),
      oidcAvailable: Boolean(oidcToken),
      managementApiAuthenticated: false,
    });
  }

  let status = 0;
  let deploymentMatches = false;
  let responseShape: string[] = [];

  try {
    const response = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${oidcToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    status = response.status;
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    responseShape = payload && typeof payload === "object" ? Object.keys(payload).sort().slice(0, 20) : [];
    deploymentMatches = Boolean(
      response.ok
      && payload
      && String(payload.id || "") === deploymentId
      && String(payload.projectId || payload.project || "").includes(projectId),
    );
  } catch {
    status = 0;
  }

  return NextResponse.json({
    ok: true,
    systemIdentityAvailable: true,
    oidcAvailable: true,
    managementApiStatus: status,
    managementApiAuthenticated: status >= 200 && status < 300,
    deploymentMatches,
    responseShape,
    identity: {
      deploymentId,
      projectId,
      gitSha,
      environment: process.env.VERCEL_ENV,
    },
  });
}
