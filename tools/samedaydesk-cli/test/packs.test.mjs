import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packs = JSON.parse(readFileSync(join(root, "vendor/packs/PACKS.json"), "utf8"));
export const packMatches = (entry, sha256) => typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256) && entry.sha256 === sha256;

test("capability-compat pack entry pins the VM1-qualified tgz sha256", () => {
  const entry = packs.packs.find(item => item.name === "samedaydesk-capability-compat");
  assert.equal(entry.version, "0.1.0");
  assert.equal(entry.sourceSha, "967ec6a29a593b41e846b7b9004cbd5ad4c6b908");
  assert.deepEqual(entry.schemas.map(item => [item.export, item.sha256]), [["samedaydesk-capability-compat/schema/preview.v1", "7ca5b23a84683ca24d2140d0dfa81a5de23ff583f247626c3f53a3b549d824e2"]]);
  assert.equal(entry.status, "pinned");
  assert.equal(entry.sha256, "66158687088ae9347a61b2b97ace25267d65e2d673d1827bf768896bc7f61f41");
  assert.equal(packMatches(entry, entry.sha256), true);
  assert.equal(packMatches(entry, "0".repeat(64)), false);
  assert.equal(packMatches({ ...entry, sha256: null }, null), false, "a null pin never matches");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined, "no runtime dependency yet");
});

test("manifest references the provider schema by export and hash, matching PACKS.json, without copying it", async () => {
  const { PROVIDERS, TASKS } = await import("../src/manifest.mjs");
  const entry = packs.packs.find(item => item.name === "samedaydesk-capability-compat");
  const provider = PROVIDERS.find(item => item.id === entry.name);
  assert.equal(provider.schemaRef, entry.schemas[0].export);
  assert.equal(provider.schemaSha256, entry.schemas[0].sha256);
  assert.equal(provider.source, `${entry.sourceRepo}@${entry.sourceSha}`);
  assert.ok(TASKS.find(task => task.id === "task.find_capability").providerRefs.includes(provider.id));
  const { readdirSync } = await import("node:fs");
  const all = dir => readdirSync(join(root, dir), { withFileTypes: true }).flatMap(item => item.isDirectory() ? all(join(dir, item.name)) : [join(dir, item.name)]);
  assert.deepEqual(all(".").filter(path => path.endsWith(".schema.json")), [], "schema is referenced, not vendored");
});
