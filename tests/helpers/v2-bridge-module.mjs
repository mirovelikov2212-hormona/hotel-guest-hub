import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

// Execute actual TS server modules with explicitly local boundary doubles.
// SQL tests remain static: this helper does not simulate a PostgreSQL engine.
const require = createRequire(import.meta.url);
export function loadBridgeModule(path, overrides = {}, cache = new Map()) {
  const root = resolve(new URL("../../", import.meta.url).pathname);
  const filename = resolve(root, path);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/")) {
      const relative = name.slice(2);
      return relative.endsWith(".mjs") ? require(resolve(root, relative)) : loadBridgeModule(`${relative}.ts`, overrides, cache);
    }
    if (name.startsWith(".")) return createRequire(filename)(name);
    return require(name);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}
