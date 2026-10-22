import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseArgv } from "../lib/argv.mjs";
import { loadMap } from "../lib/map.mjs";
import { findRepoRoot } from "../lib/paths.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const slice = resolve(here, "..");
const proveBin = join(slice, "bin/prove.mjs");
const root = findRepoRoot(slice);

function runProve(args) {
  return spawnSync(process.execPath, [proveBin, ...args], {
    encoding: "utf8",
    cwd: root,
  });
}

function parseStdout(r) {
  const text = String(r.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(text);
}

test("map.json is a useful-jobs-only 1.4.7 slice with ten jobs", () => {
  const { map, pin, errors, ids } = loadMap();
  assert.deepEqual(errors, []);
  assert.equal(map.feature, "useful-jobs");
  assert.equal(map.pin.version, "1.4.7");
  assert.equal(map.pin.bytes, 5255824);
  assert.equal(map.pin.sha256, pin.sha256);
  assert.equal(map.pin.purchaseAuthority, false);
  assert.equal(ids.length, 10);
  assert.equal(ids[0], "lockfile-pin-delta");
  for (const item of ["publish", "registry", "payment", "checkout", "neomorphic-io"]) {
    assert.equal(map.outOfScope.includes(item), true, item);
  }
});

test("parseArgv defaults seeded-failure to missing-required-inputs", () => {
  const parsed = parseArgv(["--seeded-failure", "--json"]);
  assert.equal(parsed.seededFailure, true);
  assert.equal(parsed.seededId, "missing-required-inputs");
  assert.equal(parseArgv(["--seeded-failure", "sha-mismatch"]).seededId, "sha-mismatch");
  assert.equal(parseArgv(["map"]).command, "map");
});

test("map command binds committed surfaces without extract", () => {
  const r = runProve(["map", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.feature, "useful-jobs");
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.toolsCalled, false);
  assert.equal(body.result.pin.bytes, 5255824);
  assert.equal(body.result.jobs.length, 10);
});

test("dry-run cold does not spawn obtain or the useful-jobs CLI", () => {
  const r = runProve(["--dry-run", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, true);
  assert.ok(Array.isArray(body.result.would));
  assert.match(body.result.would.join("\n"), /list --json/);
});

test("seeded silent-empty-success is rejected without extract", () => {
  const r = runProve(["--seeded-failure", "silent-empty-success", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 1, `${r.status} ${r.stderr} ${r.stdout}`);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.error.message, "silent-empty-success");
  assert.equal(body.result.observedRefuse, true);
  assert.deepEqual(body.result.ids, []);
});

test("unknown command is usage exit 2", () => {
  const r = runProve(["apex-mcp", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 2);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "USAGE");
});

test("cold prove extracts 1.4.7 outside the tree and lists ten jobs", () => {
  const r = runProve(["--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
  assert.equal(body.ok, true);
  assert.equal(body.feature, "useful-jobs");
  assert.equal(body.result.pin.sha256, "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec");
  assert.equal(body.result.jobs.length, 10);
  assert.equal(body.result.jobs[0], "lockfile-pin-delta");
  assert.equal(body.result.lockfile.ok, true);
  assert.equal(body.result.pageChangeExample.refused, true);
  assert.equal(body.result.pageChangeExample.code, "sample_as_delivered_watch");
  assert.equal(body.result.purchaseAuthority, false);
  assert.equal(body.boundary.paymentSent, false);
  const obtain = body.evidence.find((e) => e.kind === "obtain");
  assert.equal(obtain.outsideTree, true);
  assert.equal(existsSync(body.result.kit), false);
});

test("seeded missing-required-inputs remaps product refuse to exit 1", () => {
  const r = runProve(["--seeded-failure", "missing-required-inputs", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 1, `${r.stderr}\n${r.stdout}`);
  assert.equal(body.ok, false);
  assert.equal(body.command, "seeded-failure");
  assert.equal(body.error.code, "SEED_REJECT");
  assert.equal(body.error.message, "missing-required-inputs");
  assert.equal(body.result.observedRefuse, true);
  assert.equal(body.result.product.code, "missing-required-inputs");
  assert.notEqual(body.result.childExit, 0);
});

test("expect-product-reject exits 0 after observing missing-required-inputs", () => {
  const r = runProve(["--expect-product-reject", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
  assert.equal(body.ok, true);
  assert.equal(body.result.observedReject, true);
  assert.equal(body.result.product.code, "missing-required-inputs");
});

test("seeded sha-mismatch remaps obtain-archive ok:false child 0 to exit 1", () => {
  const r = runProve(["--seeded-failure", "sha-mismatch", "--json"]);
  const body = parseStdout(r);
  assert.equal(r.status, 1, `${r.stderr}\n${r.stdout}`);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.match(body.error.message, /wrong-digest/);
  assert.equal(body.result.observedRefuse, true);
  assert.equal(body.result.product.ok, false);
  assert.equal(body.result.product.code, "wrong-digest");
  assert.equal(body.result.product.extracted, false);
  assert.equal(body.result.remappedFromChildZero, true);
  assert.equal(body.result.childExit, 0);
});

test("slice write boundary stays under tools/verify-sds/features/useful-jobs", () => {
  const map = JSON.parse(readFileSync(join(slice, "map.json"), "utf8"));
  assert.equal(slice.endsWith("tools/verify-sds/features/useful-jobs"), true);
  assert.equal(map.slice, "useful-jobs-only");
});
