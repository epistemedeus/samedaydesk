import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getEngine, loadCatalog } from "../lib/catalog.mjs";
import { ensureEngineRoot } from "../lib/engine-root.mjs";
import { invokeEngine } from "../lib/invoke.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const M01_ROOT = join(here, "..");
export const OWNED_FIXTURES = join(M01_ROOT, "fixtures");

export function catalog() {
  return loadCatalog();
}

export function tmpOut(label) {
  return mkdtempSync(join(tmpdir(), `w5-m01-${label}-`));
}

export function engineRoot(id) {
  return ensureEngineRoot(getEngine(id, catalog()));
}

export function pinFixture(engineId, rel) {
  const { root } = engineRoot(engineId);
  return join(root, "fixtures", rel);
}

export function invoke(engineId, inputs, extra = {}) {
  return invokeEngine({
    engineId,
    outDir: extra.outDir || tmpOut(engineId),
    example: extra.example === true,
    mode: extra.mode,
    engineRoot: extra.engineRoot,
    inputs,
  });
}
