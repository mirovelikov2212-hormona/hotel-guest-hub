import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("guest install prompt is captured globally before room confirmation", async () => {
  const register = await source("components/PWARegister.tsx");
  const button = await source("components/InstallAppButton.tsx");
  const bridge = await source("lib/pwa/install-prompt.ts");

  assert.match(register, /window\.addEventListener\("beforeinstallprompt"/);
  assert.match(register, /event\.preventDefault\(\)/);
  assert.match(register, /storeGuestInstallPrompt/);
  assert.match(bridge, /__gostayaGuestInstallPrompt/);
  assert.match(button, /getGuestInstallPrompt\(\)/);
  assert.match(button, /GUEST_INSTALL_PROMPT_EVENT/);
  assert.doesNotMatch(button, /window\.addEventListener\("beforeinstallprompt"/);
});

test("guest install card never becomes a dead non-interactive card", async () => {
  const button = await source("components/InstallAppButton.tsx");

  assert.match(button, /onClick=\{\(\) => void handleInstall\(\)\}/);
  assert.match(button, /if \(!deferredPrompt\) \{\s*openInstructions\(\)/s);
  assert.match(button, /role="dialog"/);
  assert.match(button, /iosSteps/);
  assert.match(button, /chromeSteps/);
  assert.match(button, /samsungSteps/);
  assert.match(button, /otherSteps/);
});

test("iPhone and Android install help is localized in every guest language", async () => {
  const button = await source("components/InstallAppButton.tsx");

  for (const language of ["bg", "en", "de", "ro", "cs", "ru"]) {
    assert.match(button, new RegExp(`\\n  ${language}: \\{`));
  }

  assert.match(button, /Добавяне към началния екран/);
  assert.match(button, /Add to Home Screen/);
  assert.match(button, /Zum Home-Bildschirm/);
  assert.match(button, /Adăugați pe ecranul principal/);
  assert.match(button, /Přidat na plochu/);
  assert.match(button, /На экран/);
});

test("guest PWA install lifecycle is observable in hub analytics", async () => {
  const register = await source("components/PWARegister.tsx");
  const button = await source("components/InstallAppButton.tsx");

  assert.match(register, /pwa_install_available/);
  assert.match(register, /pwa_app_installed/);
  assert.match(register, /pwa_standalone_opened/);
  assert.match(button, /pwa_install_clicked/);
  assert.match(button, /pwa_install_accepted/);
  assert.match(button, /pwa_install_dismissed/);
  assert.match(button, /pwa_install_instructions_shown/);
  assert.match(register, /eventCategory: "pwa_install"/);
  assert.match(button, /eventCategory: "pwa_install"/);
});

test("hotel guest route advertises a hotel-scoped manifest", async () => {
  const hotelPage = await source("app/h/[hotelSlug]/page.tsx");
  const manifestRoute = await source("app/h/[hotelSlug]/manifest.webmanifest/route.ts");

  assert.match(hotelPage, /generateMetadata/);
  assert.match(hotelPage, /manifest: `\/h\/\$\{encodeURIComponent\(hotelSlug\)\}\/manifest\.webmanifest`/);
  assert.match(manifestRoute, /id: hubPath/);
  assert.match(manifestRoute, /start_url: `\$\{hubPath\}\?source=pwa`/);
  assert.match(manifestRoute, /scope: hubPath/);
  assert.match(manifestRoute, /display: "standalone"/);
  assert.match(manifestRoute, /config\.hotelName/);
  assert.match(manifestRoute, /config\.theme\?\.primary/);

  const entitlementGate = manifestRoute.indexOf("await resolveHotelByAnySlugAdmin(hotelSlug)");
  const configLoad = manifestRoute.indexOf("await getHotelConfig(hotelSlug)");
  assert.ok(entitlementGate >= 0);
  assert.ok(configLoad > entitlementGate);
});

test("service worker is registered even when hydration finishes after window load", async () => {
  const register = await source("components/PWARegister.tsx");

  assert.match(register, /document\.readyState === "complete"/);
  assert.match(register, /void registerServiceWorker\(\)/);
  assert.match(register, /window\.addEventListener\("load", registerServiceWorker/);
  assert.match(register, /updateViaCache: "none"/);
});

test("service worker keeps hotel guest navigation tenant-scoped offline", async () => {
  const sw = await source("public/sw.js");

  assert.match(sw, /url\.pathname\.startsWith\("\/h\/"\)/);
  assert.match(sw, /const guestCacheKey = url\.pathname/);
  assert.match(sw, /cache\.put\(guestCacheKey, copy\)/);
  assert.match(sw, /caches\.match\(guestCacheKey\)/);
  assert.doesNotMatch(
    sw,
    /fetch\(request\)\.catch\(\(\) => caches\.match\("\/"\)/,
  );
  assert.match(sw, /manifest\.webmanifest/);
  assert.match(sw, /fetch\(request, \{ cache: "no-store" \}\)/);
});

test("successful installation and standalone launches update the install card state", async () => {
  const register = await source("components/PWARegister.tsx");
  const button = await source("components/InstallAppButton.tsx");

  assert.match(register, /window\.addEventListener\("appinstalled"/);
  assert.match(register, /markGuestAppInstalled\(\)/);
  assert.match(button, /GUEST_APP_INSTALLED_EVENT/);
  assert.match(button, /isStandaloneDisplayMode\(\)/);
  assert.match(button, /setInstalled\(true\)/);
  assert.match(button, /installedTitle/);
  assert.match(button, /installedHint/);
});

test("installed state persists per hotel when the guest returns in the browser", async () => {
  const bridge = await source("lib/pwa/install-prompt.ts");

  assert.match(bridge, /GUEST_APP_INSTALLED_STORAGE_PREFIX/);
  assert.match(bridge, /function installedStorageKey\(\)/);
  assert.match(bridge, /window\.location\.pathname/);
  assert.match(bridge, /window\.localStorage\.setItem\(key, "1"\)/);
  assert.match(bridge, /window\.localStorage\.getItem\(key\) === "1"/);
  assert.match(bridge, /window\.localStorage\.removeItem\(key\)/);
  assert.match(bridge, /__gostayaGuestAppInstalled = false/);
});
