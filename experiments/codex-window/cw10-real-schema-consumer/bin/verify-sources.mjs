#!/usr/bin/env node
import assert from "node:assert/strict";
import { manifest, verifySources } from "../lib/witness.mjs";
import { sha256, root, readJson, run, requireSuccess } from "../lib/runtime.mjs";

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
// Audit Work's original later-head input too; adjacency is an improvement in
// causal attribution, not a replacement of an unverified original claim.
const historicalUrl = `https://raw.githubusercontent.com/${manifest.source.repository}/${manifest.source.historicalAfterCommit}/${manifest.source.path}`;
const historicalResponse = await fetch(historicalUrl, { signal: AbortSignal.timeout(30_000) });
assert(historicalResponse.ok, `historical root HTTP ${historicalResponse.status}`);
const historicalBytes = Buffer.from(await historicalResponse.arrayBuffer());
assert.equal(sha256(historicalBytes), manifest.source.historicalAfterSchemaSha256);
assert.deepEqual(JSON.parse(historicalBytes), readJson(`${root}/fixtures/upstream/organization-renamed/after/schema.json`));
const response = await fetch(`https://api.github.com/repos/${manifest.source.repository}/commits/${manifest.source.changeCommit}`, { signal: AbortSignal.timeout(30_000) });
let commit, commitTransport = "public GitHub API";
if (response.status === 403 || response.status === 429) {
  // Existing authenticated CLI is a read-only rate-limit fallback. Credentials
  // remain in gh's store; only public commit/parent IDs enter this process.
  const result = requireSuccess(run("gh", ["api", `repos/${manifest.source.repository}/commits/${manifest.source.changeCommit}`, "--jq", "{sha,parents:[.parents[]|{sha}]}" ]), "commit API via gh");
  commit = JSON.parse(result.stdout); commitTransport = "existing authenticated gh (public API rate limit)";
} else {
  assert(response.ok, `commit API HTTP ${response.status}`);
  commit = await response.json();
}
assert.equal(commit.sha, manifest.source.changeCommit);
assert.deepEqual(commit.parents.map((parent) => parent.sha), [manifest.source.beforeCommit]);
process.stdout.write(`${JSON.stringify({ ok: true, files: manifest.source.files.length, before: manifest.source.beforeCommit, after: manifest.source.afterCommit, historicalRootVerified: true, historicalRootSemanticallyEqual: true, commitTransport, verifiedAt: new Date().toISOString() })}\n`);
