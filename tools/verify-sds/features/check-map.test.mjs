import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FEATURES_DIR,
  PRIMARY_MISSING_SURFACE,
  REQUIRED_FAMILIES,
  checkFeatureMap,
  loadCatalog,
  parseSurfacesFromMarkdown,
  seededMapDir,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const cli = join(here, "check-map.mjs");

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function parseStdout(proc) {
  return JSON.parse(proc.stdout);
}

test("catalog names useful-jobs, packs, and mcp", () => {
  const catalog = loadCatalog();
  assert.deepEqual(catalog.families, REQUIRED_FAMILIES);
  const families = new Set(catalog.surfaces.map((s) => s.family));
  for (const family of REQUIRED_FAMILIES) assert.equal(families.has(family), true);
  assert.equal(
    catalog.surfaces.some((s) => s.id === PRIMARY_MISSING_SURFACE),
    true,
  );
});

test("Surfaces table parser reads backtick ids and stops at the next H2", () => {
  const ids = parseSurfacesFromMarkdown(`# x

## Surfaces

| id | kind |
| --- | --- |
| \`alpha.one\` | a |
| \`beta.two\` | b |

## Sub-features

| \`not-a-surface\` | skip |
`);
  assert.deepEqual([...ids], ["alpha.one", "beta.two"]);
});

test("live feature map documents every catalog surface and repo path", () => {
  const result = checkFeatureMap({ repoRoot, mapDir: FEATURES_DIR });
  assert.equal(result.ok, true, JSON.stringify(result.error || result.missing, null, 2));
  assert.equal(result.missing.length, 0);
  assert.equal(result.missingRepo.length, 0);
  assert.equal(result.missingFamilies.length, 0);
  for (const family of REQUIRED_FAMILIES) {
    assert.ok(result.families[family] > 0, `family ${family} undocumented`);
  }
});

test("seeded map omits MCP and is not a live-map pass", () => {
  const result = checkFeatureMap({
    repoRoot,
    mapDir: seededMapDir(),
    seed: "missing-surface",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SEED_REJECT");
  assert.equal(result.error.productCode, "missing_surface");
  assert.equal(result.error.surface, PRIMARY_MISSING_SURFACE);
  assert.ok(result.missing.includes(PRIMARY_MISSING_SURFACE));
  assert.ok(result.missingFamilies.includes("mcp"));
  assert.ok(result.families["useful-jobs"] > 0);
  assert.ok(result.families.packs > 0);
  assert.equal(result.families.mcp, 0);
});

test("check-map.mjs live map exits 0", () => {
  const proc = runCli(["--json"]);
  assert.equal(proc.status, 0, proc.stderr);
  const body = parseStdout(proc);
  assert.equal(body.ok, true);
  assert.equal(body.schema, "samedaydesk.verify-sds.feature-map.v1");
  assert.match(proc.stderr, /feature-map ok/);
});

test("check-map.mjs --seed missing-surface exits 1 and quotes mcp.tools.list", () => {
  const proc = runCli(["--seed", "missing-surface", "--json"]);
  assert.equal(proc.status, 1, proc.stdout);
  const body = parseStdout(proc);
  assert.equal(body.ok, false);
  assert.equal(body.seed, "missing-surface");
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.error.productCode, "missing_surface");
  assert.equal(body.error.surface, "mcp.tools.list");
  assert.match(body.error.message, /seeded missing surface flagged: mcp\.tools\.list/);
  assert.match(proc.stderr, /SEED_REJECT missing_surface mcp\.tools\.list/);
  assert.ok(body.missing.includes("mcp.initialize"));
  assert.ok(body.missing.includes("mcp.tools.check_ai_readiness"));
});

test("unknown seed is usage, not a green map", () => {
  const proc = runCli(["--seed", "does-not-exist"]);
  assert.equal(proc.status, 2);
  const body = parseStdout(proc);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "unknown_seed");
});
