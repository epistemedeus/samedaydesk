import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  DECISIONS,
  SCHEMA,
  SEEDED_FAILURES,
  codesFrom,
  invalidFixtureDir,
  listJsonFiles,
  loadInvalidManifest,
  loadJson,
  loadPins,
  probe,
  probeCold,
  probeFile,
  runSuite,
  validFixtureDir,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "cli.mjs");

function cloneValid(name) {
  return structuredClone(loadJson(join(validFixtureDir(), name)));
}

function spawnCli(args) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env,
  });
}

test("github core remaining window is observed without summing", () => {
  const result = probeFile(join(validFixtureDir(), "github-core-window.json"));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.decision, DECISIONS.OBSERVED);
  assert.equal(result.schemaVersion, SCHEMA);
  assert.equal(result.mode, "read_only");
  assert.equal(result.liveObserved, false);
  assert.equal(result.consumesQuota, false);
  assert.equal(result.moneyMovement, false);
  assert.equal(result.boundaries.payment, false);
  assert.equal(result.boundaries.checkout, false);
  assert.equal(result.boundaries.toolsCall, false);
  assert.equal(result.claims.sumAcrossWindows, false);
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].remaining, 4992);
  assert.equal(result.windows[0].limit, 5000);
  assert.equal(result.totalRemaining, undefined);
});

test("MCP tools/list is a declared cap, not a tools/call", () => {
  const result = probeFile(join(validFixtureDir(), "mcp-tools-list.json"));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.windows[0].rpcMethod, "tools/list");
  assert.equal(result.windows[0].remaining, null);
  assert.deepEqual(result.mcp.tools, loadPins().mcpToolNames);
  assert.equal(result.mcp.callAllowed, false);
  assert.equal(result.mcp.listAllowed, true);
});

test("honest HTTP 429 leaves remaining null", () => {
  const result = probeFile(join(validFixtureDir(), "github-429-honest.json"));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.windows[0].windowKind, "rate_limited");
  assert.equal(result.windows[0].remaining, null);
  assert.equal(result.windows[0].httpStatus, 429);
  assert.equal(result.claims.http429IsHeadroom, false);
});

test("declared pulse cap is not remaining headroom", () => {
  const result = probeFile(join(validFixtureDir(), "pulse-recent-cap.json"));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.windows[0].limit, 80);
  assert.equal(result.windows[0].remaining, null);
});

test("seeded tools/call is refused", () => {
  const result = probeFile(join(invalidFixtureDir(), "consume-quota-tools-call.json"));
  assert.equal(result.ok, false);
  assert.equal(result.decision, DECISIONS.INVALID_INPUT);
  assert.ok(codesFrom(result).includes("consume_quota_refused"));
  assert.equal(result.windows.length, 0);
});

test("seeded HTTP 429 as headroom is refused", () => {
  const result = probeFile(join(invalidFixtureDir(), "http-429-as-headroom.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("http_429_is_not_headroom"));
});

test("seeded HTTP 402 as remaining is refused", () => {
  const result = probeFile(join(invalidFixtureDir(), "http-402-as-remaining.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("http_402_is_not_remaining"));
});

test("totalRemaining is refused as a cross-window sum", () => {
  const result = probeFile(join(invalidFixtureDir(), "sum-across-windows.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("sum_across_windows"));
});

test("checkout object is money movement", () => {
  const result = probeFile(join(invalidFixtureDir(), "money-movement.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("money_movement_refused"));
});

test("PUT is mutating HTTP", () => {
  const result = probeFile(join(invalidFixtureDir(), "mutating-http.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("mutating_http_refused"));
});

test("checkout mode is money movement", () => {
  const result = probeFile(join(invalidFixtureDir(), "checkout-intent.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("money_movement_refused"));
});

test("autoRetry on Retry-After is refused", () => {
  const result = probeFile(join(invalidFixtureDir(), "auto-retry-on-retry-after.json"));
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("auto_retry_refused"));
});

test("remaining cannot exceed limit", () => {
  const pack = cloneValid("github-core-window.json");
  pack.windows[0].remaining = 5001;
  pack.windows[0].used = 0;
  const result = probe(pack);
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("remaining_exceeds_limit"));
});

test("used + remaining must equal limit", () => {
  const pack = cloneValid("github-core-window.json");
  pack.windows[0].used = 1;
  const result = probe(pack);
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("used_remaining_mismatch"));
});

test("declared cap with remaining is refused", () => {
  const pack = cloneValid("pulse-recent-cap.json");
  pack.windows[0].remaining = 12;
  const result = probe(pack);
  assert.equal(result.ok, false);
  assert.ok(codesFrom(result).includes("declared_cap_has_no_remaining"));
});

test("cold run matches pinned SDS source caps", () => {
  const result = probeCold();
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.liveObserved, false);
  assert.equal(result.consumesQuota, false);
  assert.equal(result.mcp.callAllowed, false);
  const byId = Object.fromEntries(result.windows.map((window) => [window.id, window]));
  assert.equal(byId["pulse.recent_cap"].limit, 80);
  assert.equal(byId["pulse.mcp_batch_max"].limit, 25);
  assert.equal(byId["observatory.max_response_bytes"].limit, 262144);
  assert.equal(byId["tools.ai_readiness.max_bytes"].limit, 2500000);
  assert.equal(byId["mcp.tool_inventory"].limit, 5);
  assert.ok(result.windows.every((window) => window.matched === true));
  assert.ok(result.windows.every((window) => window.remaining === null));
});

test("suite accepts valid fixtures and rejects each invalid fixture", () => {
  const report = runSuite();
  assert.equal(report.failed, 0, JSON.stringify(report.results.filter((item) => !item.ok)));
  assert.equal(report.passed, 14);
  assert.equal(report.total, 14);
});

test("invalid fixtures match the manifest", () => {
  const manifest = loadInvalidManifest();
  const files = listJsonFiles(invalidFixtureDir()).map((filePath) => filePath.split("/").pop());
  assert.deepEqual(files.sort(), Object.keys(manifest).sort());
});

test("CLI --cold quotes declared SDS source caps", () => {
  const proc = spawnCli(["--cold"]);
  assert.equal(proc.status, 0, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.decision, "observed");
  assert.equal(result.liveObserved, false);
  assert.ok(result.windows.some((window) => window.id === "pulse.recent_cap" && window.limit === 80));
  assert.equal(result.mcp.callAllowed, false);
});

test("CLI seeded tools/call is quoted and rejected", () => {
  const proc = spawnCli(["--seeded-failure", "consume-quota-tools-call"]);
  assert.equal(proc.status, 0, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.rejected, true);
  assert.equal(result.code, "consume_quota_refused");
  assert.equal(result.message, SEEDED_FAILURES["consume-quota-tools-call"].message);
  assert.match(result.message, /tools\/call is not a quota remaining reading/);
});

test("CLI seeded HTTP 429 as headroom is quoted and rejected", () => {
  const proc = spawnCli(["--seeded-failure", "http-429-as-headroom"]);
  assert.equal(proc.status, 0, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.rejected, true);
  assert.equal(result.code, "http_429_is_not_headroom");
});

test("CLI --input of tools/call exits 2", () => {
  const proc = spawnCli(["--input", join(invalidFixtureDir(), "consume-quota-tools-call.json")]);
  assert.equal(proc.status, 2, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("consume_quota_refused"));
});

test("CLI --expect-reject http_429_is_not_headroom", () => {
  const proc = spawnCli([
    "--expect-reject",
    "http_429_is_not_headroom",
    join(invalidFixtureDir(), "http-429-as-headroom.json"),
  ]);
  assert.equal(proc.status, 0, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.expectReject, "http_429_is_not_headroom");
});

test("CLI --pay is refused as money movement", () => {
  const proc = spawnCli(["--pay", "--cold"]);
  assert.equal(proc.status, 2, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["money_movement_refused"]);
});

test("CLI --live is refused", () => {
  const proc = spawnCli(["--live", "--cold"]);
  assert.equal(proc.status, 2, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["live_fetch_refused"]);
});

test("CLI --tools-call is refused", () => {
  const proc = spawnCli(["--tools-call"]);
  assert.equal(proc.status, 2, proc.stderr);
  const result = JSON.parse(proc.stdout);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ["consume_quota_refused"]);
});

test("CLI --suite matches the library", () => {
  const proc = spawnCli(["--suite"]);
  assert.equal(proc.status, 0, proc.stderr);
  const report = JSON.parse(proc.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.passed, 14);
  assert.equal(report.failed, 0);
});

test("quota probe sources never fetch, pay, or import stripe", () => {
  const files = ["lib.mjs", "cli.mjs"].map((name) => join(here, name));
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    assert.doesNotMatch(text, /from ["']stripe["']/);
    assert.doesNotMatch(text, /require\(["']stripe["']\)/);
    assert.doesNotMatch(text, /\bfetch\s*\(/);
    assert.doesNotMatch(text, /createPaymentIntent/);
    assert.doesNotMatch(text, /neomorphic/);
  }
});
