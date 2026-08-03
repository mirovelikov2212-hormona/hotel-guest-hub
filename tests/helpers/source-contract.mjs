import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export async function readProjectFile(relativePath) {
  return readFile(resolve(projectRoot, relativePath), "utf8");
}

export function assertContains(source, fragment, message) {
  assert.ok(
    source.includes(fragment),
    message || `Expected source to contain: ${fragment}`,
  );
}

export function assertNotContains(source, fragment, message) {
  assert.ok(
    !source.includes(fragment),
    message || `Expected source not to contain: ${fragment}`,
  );
}

export function assertBefore(source, firstFragment, secondFragment, message) {
  const firstIndex = source.indexOf(firstFragment);
  const secondIndex = source.indexOf(secondFragment);

  assert.notEqual(firstIndex, -1, `Missing first contract fragment: ${firstFragment}`);
  assert.notEqual(secondIndex, -1, `Missing second contract fragment: ${secondFragment}`);
  assert.ok(
    firstIndex < secondIndex,
    message || `Expected "${firstFragment}" before "${secondFragment}"`,
  );
}

export function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}
