import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseUnpaid402Payload } from "../../../client/scripts/verifiedFeedObservation.mjs";
import { REPO_ROOT } from "./lib/root.mjs";
import { COMMITTED_EXTRACT_CURRENT, EXTRACT_TERMS } from "./lib/cite.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("committed extract-current.json is a current unpaid-402 contract", () => {
  const fixture = JSON.parse(readFileSync(join(REPO_ROOT, COMMITTED_EXTRACT_CURRENT), "utf8"));
  const parsed = parseUnpaid402Payload({
    status: fixture.status,
    headers: fixture.headers || {},
    bodyText: JSON.stringify(fixture.body),
  });
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.observation.unpaid402.source, EXTRACT_TERMS.source);
  assert.equal(parsed.observation.unpaid402.amount, EXTRACT_TERMS.amount);
  assert.equal(parsed.observation.unpaid402.network, EXTRACT_TERMS.network);
  assert.equal(parsed.observation.unpaid402.asset, EXTRACT_TERMS.asset);
});

test("empty accepts 402 is missing_accepts, not a current contract", () => {
  const parsed = parseUnpaid402Payload({
    status: 402,
    headers: { "content-type": "application/json" },
    bodyText: JSON.stringify({ error: "Payment Required", accepts: [] }),
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.kind, "invalid_json");
  assert.equal(parsed.failure.detail, "missing_accepts");
});

test("HTTP 200 extract JSON is not unpaid-402", () => {
  const parsed = parseUnpaid402Payload({
    status: 200,
    headers: { "content-type": "application/json" },
    bodyText: JSON.stringify({ ok: true, title: "example", url: "https://example.com" }),
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.kind, "http_status");
  assert.equal(parsed.failure.detail, "status_200");
});

test("run.mjs --seeded-false-reject exits 1 SEED_REJECT on extract-current", () => {
  const result = spawnSync(process.execPath, [join(here, "run.mjs"), "--seeded-false-reject", "--json"], {
    encoding: "utf8",
    cwd: here,
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout.trim());
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.error.kind, "false_reject");
  assert.equal(body.result.observedVerdict, "accept");
  assert.equal(body.result.claimedVerdict, "reject");
  assert.equal(body.result.observedCode, "current_unpaid_402");
});
