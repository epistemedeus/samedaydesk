import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packs = JSON.parse(readFileSync(join(root, "vendor/packs/PACKS.json"), "utf8"));
export const packMatches = (entry, sha256) => typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256) && entry.sha256 === sha256;

test("capability-compat pack entry is a placeholder until its tgz sha256 is recorded", () => {
  const entry = packs.packs.find(item => item.name === "samedaydesk-capability-compat");
  assert.equal(entry.version, "0.1.0");
  assert.equal(entry.sourceSha, "60c8e161c6694df6da6f8476e87f29794954c136");
  if (entry.sha256 === null) {
    assert.equal(entry.status, "awaiting_tgz");
    assert.equal(packMatches(entry, null), false);
    assert.equal(packMatches(entry, "0".repeat(64)), false);
  } else {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined, "no runtime dependency yet");
});
