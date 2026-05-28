const fs = require('fs');
const path = require('path');

const root = process.cwd();
const THEME = '#F5F5F5';
const BRAND_DARK = '#202627';
const BRAND_TEAL = '#43B5A1';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content, 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function backup(rel) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    const bak = abs + `.bak-${Date.now()}`;
    fs.copyFileSync(abs, bak);
  }
}

function patchManifestTs() {
  const rel = 'app/manifest.ts';
  if (!exists(rel)) return false;
  backup(rel);
  let s = read(rel);
  s = s.replace(/background_color:\s*["'`][^"'`]+["'`]/, `background_color: "${THEME}"`);
  s = s.replace(/theme_color:\s*["'`][^"'`]+["'`]/, `theme_color: "${THEME}"`);
  if (!/background_color:\s*["'`]/.test(s)) {
    s = s.replace(/display:\s*["'`]standalone["'`],/, `display: "standalone",\n    background_color: "${THEME}",`);
  }
  if (!/theme_color:\s*["'`]/.test(s)) {
    s = s.replace(/background_color:\s*["'`][^"'`]+["'`],/, `background_color: "${THEME}",\n    theme_color: "${THEME}",`);
  }
  write(rel, s);
  return true;
}

function patchLayout() {
  const rel = 'app/layout.tsx';
  if (!exists(rel)) return false;
  backup(rel);
  let s = read(rel);

  // Import Viewport type.
  s = s.replace(/import\s+type\s+\{\s*Metadata\s*\}\s+from\s+["']next["'];/, 'import type { Metadata, Viewport } from "next";');
  if (!/import\s+type\s+\{[^}]*Viewport[^}]*\}\s+from\s+["']next["'];/.test(s)) {
    s = s.replace(/import\s+type\s+\{([^}]+)\}\s+from\s+["']next["'];/, (m, inner) => {
      const parts = inner.split(',').map(x => x.trim()).filter(Boolean);
      if (!parts.includes('Viewport')) parts.push('Viewport');
      return `import type { ${parts.join(', ')} } from "next";`;
    });
  }

  // Ensure metadata has themeColor fallback for older Next versions.
  if (!/themeColor\s*:/.test(s)) {
    s = s.replace(/export\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{/, `export const metadata: Metadata = {\n  themeColor: "${THEME}",`);
  } else {
    s = s.replace(/themeColor\s*:\s*(["'`])[^"'`]+\1/, `themeColor: "${THEME}"`);
  }

  // Add/replace viewport export. This is the current Next.js way to output <meta name="theme-color">.
  const viewportBlock = `export const viewport: Viewport = {\n  themeColor: "${THEME}",\n  colorScheme: "light",\n};\n\n`;
  if (/export\s+const\s+viewport\s*:\s*Viewport\s*=\s*\{[\s\S]*?\};\s*/.test(s)) {
    s = s.replace(/export\s+const\s+viewport\s*:\s*Viewport\s*=\s*\{[\s\S]*?\};\s*/, viewportBlock);
  } else if (/export\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{/.test(s)) {
    const endMeta = s.indexOf('};', s.indexOf('export const metadata'));
    if (endMeta !== -1) {
      s = s.slice(0, endMeta + 3) + '\n\n' + viewportBlock + s.slice(endMeta + 3);
    } else {
      s = viewportBlock + s;
    }
  } else {
    s = viewportBlock + s;
  }

  // Apple standalone bar should not stay black/purple.
  s = s.replace(/statusBarStyle:\s*["'`][^"'`]+["'`]/, 'statusBarStyle: "default"');

  write(rel, s);
  return true;
}

function patchPWARegister() {
  const rel = 'components/PWARegister.tsx';
  if (!exists(rel)) return false;
  backup(rel);
  let s = read(rel);

  if (!s.includes('STAYHUB_BROWSER_THEME_COLOR')) {
    // Add runtime meta updater at the start of the effect body. This fixes mobile browser bars even when old metadata was cached.
    s = s.replace(/useEffect\(\(\)\s*=>\s*\{/, `useEffect(() => {\n    const STAYHUB_BROWSER_THEME_COLOR = "${THEME}";\n    try {\n      let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;\n      if (!meta) {\n        meta = document.createElement("meta");\n        meta.name = "theme-color";\n        document.head.appendChild(meta);\n      }\n      meta.content = STAYHUB_BROWSER_THEME_COLOR;\n      document.documentElement.style.backgroundColor = STAYHUB_BROWSER_THEME_COLOR;\n      document.body.style.backgroundColor = STAYHUB_BROWSER_THEME_COLOR;\n    } catch {}\n`);
  }

  write(rel, s);
  return true;
}

function patchPublicManifestJson() {
  const candidates = ['public/manifest.json', 'public/manifest.webmanifest', 'manifest.json'];
  let patched = false;
  for (const rel of candidates) {
    if (!exists(rel)) continue;
    backup(rel);
    try {
      const json = JSON.parse(read(rel));
      json.theme_color = THEME;
      json.background_color = THEME;
      write(rel, JSON.stringify(json, null, 2) + '\n');
      patched = true;
    } catch {
      let s = read(rel);
      s = s.replace(/"theme_color"\s*:\s*"[^"]+"/, `"theme_color": "${THEME}"`);
      s = s.replace(/"background_color"\s*:\s*"[^"]+"/, `"background_color": "${THEME}"`);
      write(rel, s);
      patched = true;
    }
  }
  return patched;
}

function patchServiceWorker() {
  const rel = 'public/sw.js';
  const abs = path.join(root, rel);
  if (exists(rel)) backup(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const sw = `const CACHE_VERSION = "stayhub-aquamarine-light-v${Date.now()}";\nconst APP_SHELL = ["/", "/manifest.webmanifest"];\n\nself.addEventListener("install", (event) => {\n  self.skipWaiting();\n  event.waitUntil(\n    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))\n  );\n});\n\nself.addEventListener("activate", (event) => {\n  event.waitUntil(\n    caches.keys().then((keys) =>\n      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))\n    ).then(() => self.clients.claim())\n  );\n});\n\nself.addEventListener("fetch", (event) => {\n  const request = event.request;\n  if (request.method !== "GET") return;\n  const url = new URL(request.url);\n  if (url.origin !== self.location.origin) return;\n\n  if (request.mode === "navigate") {\n    event.respondWith(\n      fetch(request).catch(() => caches.match("/").then((cached) => cached || Response.error()))\n    );\n    return;\n  }\n\n  event.respondWith(\n    caches.match(request).then((cached) => {\n      if (cached) return cached;\n      return fetch(request).then((response) => {\n        if (response && response.ok) {\n          const copy = response.clone();\n          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);\n        }\n        return response;\n      });\n    })\n  );\n});\n`;
  write(rel, sw);
  return true;
}

function patchGuestHub() {
  const rel = 'components/GuestHub.tsx';
  if (!exists(rel)) return false;
  backup(rel);
  let s = read(rel);

  const replacements = [
    ['Секциите ще се отворят, когато въведете номера на стаята.', 'Заключените секции ще се отворят, когато въведете номера на стаята.'],
    ['The sections will open when you enter your room number.', 'Locked sections will open after you enter your room number.'],
    ['Die Bereiche werden geöffnet, wenn Sie Ihre Zimmernummer eingeben.', 'Gesperrte Bereiche werden geöffnet, nachdem Sie Ihre Zimmernummer eingegeben haben.'],
    ['Secțiunile se vor deschide după introducerea numărului camerei.', 'Secțiunile blocate se vor deschide după introducerea numărului camerei.'],
    ['Sekce se otevřou po zadání čísla pokoje.', 'Uzamčené sekce se otevřou po zadání čísla pokoje.'],
  ];
  for (const [from, to] of replacements) {
    s = s.split(from).join(to);
  }

  const start = s.indexOf('function LockedSectionCard(');
  const end = s.indexOf('\nfunction OutletsAccordion(', start);
  if (start !== -1 && end !== -1) {
    const fn = `function LockedSectionCard({\n  title,\n}: {\n  title: string;\n  message?: string;\n}) {\n  return (\n    <div\n      className="rounded-2xl border px-4 py-4 shadow-sm"\n      style={{\n        backgroundColor: "${THEME}",\n        borderColor: "${BRAND_DARK}",\n        color: "${BRAND_DARK}",\n      }}\n      aria-disabled="true"\n    >\n      <div className="flex items-center justify-between gap-3">\n        <div className="text-base font-semibold" style={{ color: "${BRAND_DARK}" }}>\n          {title}\n        </div>\n        <div\n          className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm"\n          style={{ borderColor: "${BRAND_DARK}", color: "${BRAND_DARK}" }}\n          aria-label="Locked"\n          title="Locked"\n        >\n          🔒\n        </div>\n      </div>\n    </div>\n  );\n}\n`;
    s = s.slice(0, start) + fn + s.slice(end);
  }

  // Make room card readable in the light theme if old dark hardcoded styles are still present.
  s = s.replace(/<div className="rounded-2xl bg-neutral-900\/60 p-4 ring-1 ring-neutral-800">/, `<div className="rounded-2xl p-4" style={{ backgroundColor: "${THEME}", border: "1px solid ${BRAND_TEAL}", color: "${BRAND_DARK}" }}>`);
  s = s.replace(/<h2 className="text-base font-semibold text-white">\{roomCopy\.cardTitle\}<\/h2>/, `<h2 className="text-base font-semibold" style={{ color: "${BRAND_DARK}" }}>{roomCopy.cardTitle}</h2>`);
  s = s.replace(/<p className="mt-2 text-sm leading-6 text-neutral-300">\{roomCopy\.cardText\}<\/p>/, `<p className="mt-2 text-sm leading-6" style={{ color: "${BRAND_DARK}" }}>{roomCopy.cardText}</p>`);
  s = s.replace(/<label className="mb-2 block text-xs font-semibold uppercase tracking-\[0\.18em\] text-neutral-400">/, `<label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "${BRAND_DARK}" }}>`);
  s = s.replace(/className="w-full rounded-xl bg-neutral-950\/70 px-4 py-3 text-sm text-white outline-none ring-1 ring-neutral-800 placeholder:text-neutral-500"/, `className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{ backgroundColor: "${BRAND_TEAL}", color: "${THEME}", border: "1px solid ${BRAND_TEAL}" }}`);
  s = s.replace(/<div className="mt-3 rounded-xl bg-neutral-950\/60 px-3 py-3 text-sm text-neutral-300 ring-1 ring-neutral-800">\s*\{roomCopy\.lockedNotice\}\s*<\/div>/, `<div className="mt-3 rounded-xl px-3 py-3 text-sm" style={{ backgroundColor: "${BRAND_TEAL}", color: "${THEME}" }}>\n              {roomCopy.lockedNotice}\n            </div>`);

  write(rel, s);
  return true;
}

const results = {
  manifestTs: patchManifestTs(),
  layout: patchLayout(),
  pwaRegister: patchPWARegister(),
  publicManifest: patchPublicManifestJson(),
  serviceWorker: patchServiceWorker(),
  guestHub: patchGuestHub(),
};

console.log('StayHub mobile theme + locked sections patch applied:');
console.table(results);
console.log('\nNext steps: npm run build && git add . && git commit -m "Fix mobile theme and locked sections" && git push');
