#!/usr/bin/env node
import assert from "node:assert/strict";
import { manifest, verifySources } from "../lib/witness.mjs";
import { sha256 } from "../lib/runtime.mjs";

// Explicit online provenance check, kept out of offline regression CI.
verifySources();
for (const entry of manifest.source.files) {
  const url = `https://raw.githubusercontent.com/${manifest.source.repository}/${entry.commit}/${entry.path}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, entry.bytes, `${entry.file} upstream bytes`);
  assert.equal(sha256(bytes), entry.sha256, `${entry.file} upstream SHA-256`);
}
const response = await fetch(`https://api.github.com/repos/${manifest.source.repository}/commits/${manifest.source.changeCommit}`, { signal: AbortSignal.timeout(30_000) });
assert(response.ok, `commit API HTTP ${response.status}`);
const commit = await response.json();
assert.equal(commit.sha, manifest.source.changeCommit);
assert.deepEqual(commit.parents.map((parent) => parent.sha), [manifest.source.beforeCommit]);
process.stdout.write(`${JSON.stringify({ ok: true, files: manifest.source.files.length, before: manifest.source.beforeCommit, after: manifest.source.afterCommit, verifiedAt: new Date().toISOString() })}\n`);
