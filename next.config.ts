import type { NextConfig } from "next";
import path from "path";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Playwright Core and @sparticuz/chromium load a small set of runtime assets
  // through filesystem paths that Next/Vercel output tracing cannot infer from
  // static imports. Keep the packages external, but explicitly trace the assets
  // needed by both the synchronous Scanner V2 route and the durable workflow
  // step function where browser rendering actually executes.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/control-plane/hotel-scanner/scan-v2": [
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
    "/.well-known/workflow/v1/step": [
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default withWorkflow(nextConfig);
