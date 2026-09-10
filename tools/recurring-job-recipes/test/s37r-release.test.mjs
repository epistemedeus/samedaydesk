import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPublicSafe } from "../lib/fetch.mjs";
import { fetchPublicIssue, issueFingerprint } from "../lib/github-issue.mjs";
import { buildWorkBrief } from "../lib/work-brief.mjs";
import { persistResult, runRecipe } from "../lib/run.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const priorPath = join(root, "fixtures/priors/issue-brief.prior.json");
const issueFixturePath = join(root, "fixtures/issues/samedaydesk-1.json");
const fixture = JSON.parse(readFileSync(issueFixturePath, "utf8")).issue;
const raw = { number: fixture.number, title: fixture.title, body: fixture.body,
  state: fixture.state, html_url: fixture.url, updated_at: fixture.updatedAt };

function response(body = raw, status = 200, options = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, ...options });
}

test("S37R issue fetch rejects redirect and oversized body once without consuming error payload", async () => {
  for (const result of [response("", 302), response("x", 200, { headers: { "content-length": String(1024 * 1024 + 1) } }), response("x".repeat(1024 * 1024 + 1))]) {
    let calls = 0;
    const out = await fetchPublicIssue("epistemedeus/samedaydesk#1", { fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.redirect, "manual");
      assert.ok(options.signal);
      return result;
    } });
    assert.equal(out.ok, false);
    assert.equal(out.error.retryable, false);
    assert.equal(calls, 1);
  }
});

test("S37R public timeout, final URL mismatch and credentials fail without retry", async () => {
  await assert.rejects(fetchPublicSafe("file:///tmp/source"), (error) => error.retryable === false);
  await assert.rejects(fetchPublicSafe("https://user:secret@example.com/"), (error) => error.retryable === false);
  await assert.rejects(fetchPublicSafe("https://example.com/", { fetchImpl: async () => ({ url: "https://elsewhere.invalid/", status: 200 }) }), /final url/);
  let calls = 0;
  const out = await fetchPublicIssue("owner/repo#1", { timeoutMs: 10, fetchImpl: async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  } });
  assert.equal(out.error.code, "timed_out");
  assert.equal(out.error.retryable, false);
  assert.equal(calls, 1);
});

test("S37R public issue failures and wrong response identity produce error evidence", async () => {
  for (const res of [response("unavailable", 503), response({ ...raw, number: 99 }), response(null), response("not JSON")]) {
    const out = await fetchPublicIssue("epistemedeus/samedaydesk#1", { fetchImpl: async () => res });
    assert.equal(out.ok, false);
  }
  let calls = 0;
  const out = await fetchPublicIssue({ owner: "owner?bad", repo: "repo", number: 1 }, { fetchImpl: async () => { calls++; } });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
});

test("S37R companion documents use the same no-redirect byte bound and preserve the issue on partial", async () => {
  const calls = [];
  const result = await runRecipe("issue-to-work-brief", {
    priorPath, issueUrl: fixture.url, docsUrl: "https://example.com/docs", clock: "2026-09-09T16:00:00Z",
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, "manual");
      assert.ok(options.signal);
      return url.includes("api.github.com") ? response() : response("", 302);
    },
  });
  assert.equal(result.outcome, "partial");
  assert.equal(result.evidence.brief.sourceBody, fixture.body);
  assert.equal(calls.length, 2);
});

test("S37R buyer probes each target at most once and stop at free failure boundaries", async () => {
  const calls = [];
  const result = await runRecipe("buyer-setup-trace", {
    gatewayOrigin: "https://fixture.invalid", fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, "manual");
      assert.ok(options.signal);
      return response("", 307);
    },
  });
  assert.equal(result.outcome, "error");
  assert.equal(calls.length, 5);
  assert.equal(new Set(calls).size, 5);
  assert.equal(result.payment.paid, false);
  assert.equal(result.payment.signed, false);
});

test("S37R complete source constraints and equal-byte changes affect source fingerprint", () => {
  const first = { ...fixture, body: "Must preserve ALL constraints.\nDo not pay." };
  const second = { ...first, body: "Must preserve ALL constraints.\nDo not bid." };
  assert.equal(Buffer.byteLength(first.body), Buffer.byteLength(second.body));
  assert.notDeepEqual(issueFingerprint(first), issueFingerprint(second));
  assert.notDeepEqual(issueFingerprint(first), issueFingerprint({ ...first, repo: "other" }));
  const brief = buildWorkBrief(first);
  assert.equal(brief.sourceBody, first.body);
  assert.notEqual(brief.contentHash, buildWorkBrief(second).contentHash);
});

test("S37R generated issue prior roundtrips unchanged; changed source and previous bytes remain explicit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s37r-issue-"));
  try {
    const input = { priorPath, issueFixturePath, clock: "2026-09-09T16:00:00Z" };
    const original = readFileSync(priorPath);
    const first = await runRecipe("issue-to-work-brief", input);
    assert.equal(first.outcome, "changed", "legacy fingerprint cannot prove complete source equality");
    const stored = persistResult(first, { outDir: dir, writeArtifact: true });
    assert.equal(stored.artifact.ok, true);
    const priorBytes = readFileSync(stored.artifact.path);
    const second = await runRecipe("issue-to-work-brief", { ...input, priorPath: stored.artifact.path });
    assert.equal(second.outcome, "unchanged");
    const changedPath = join(dir, "changed.json");
    writeFileSync(changedPath, JSON.stringify({ issue: { ...fixture, body: fixture.body + "\nPreserve every constraint." } }));
    const changed = await runRecipe("issue-to-work-brief", { ...input, priorPath: stored.artifact.path, issueFixturePath: changedPath });
    assert.equal(changed.outcome, "changed");
    assert.deepEqual(readFileSync(priorPath), original);
    assert.deepEqual(readFileSync(stored.artifact.path), priorBytes);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
