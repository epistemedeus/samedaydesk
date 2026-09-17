import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyStaleOutput } from "./lib/classify.mjs";
import { CURRENT_PIN } from "./lib/pin.mjs";
import { childEnv } from "./lib/spawn-env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));

function runNode(script, args) {
  return spawnSync(process.execPath, [join(here, script), ...args], {
    encoding: "utf8",
    cwd: here,
    env: childEnv(),
  });
}

test("manifest has ≥5 reject cases including seeded greenwash and one control", () => {
  const reject = manifest.cases.filter((c) => c.expect === "reject");
  const control = manifest.cases.filter((c) => c.class === "control");
  assert.ok(reject.length >= 5);
  assert.ok(manifest.cases.some((c) => c.seededGreenwash || c.id === manifest.seededGreenwash));
  assert.equal(control.length, 1);
  assert.equal(manifest.currentPin.sha256, CURRENT_PIN.sha256);
  assert.equal(manifest.currentPin.bytes, CURRENT_PIN.bytes);
});

test("each reject fixture classifies as reject with greenwash reasons", () => {
  for (const c of manifest.cases.filter((row) => row.expect === "reject")) {
    const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
    const v = classifyStaleOutput(raw.output || raw, { surface: raw.surface });
    assert.equal(v.reject, true, c.id);
    assert.ok(v.reasons.length > 0, c.id);
    assert.equal(v.detail.claimedSuccess, true, `${c.id} must claim success (greenwash shape)`);
    assert.equal(v.greenwash, true, c.id);
    for (const reason of raw.expectedReasons || []) {
      assert.ok(v.reasons.includes(reason), `${c.id} missing ${reason}: ${v.reasons.join(",")}`);
    }
  }
});

test("current-pin control is not rejected", () => {
  const c = manifest.cases.find((row) => row.class === "control");
  const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
  const v = classifyStaleOutput(raw.output, { surface: raw.surface });
  assert.equal(v.reject, false, JSON.stringify(v.reasons));
  assert.equal(v.greenwash, false);
  assert.equal(v.detail.claimedSuccess, true);
});

test("cold run.mjs exits 0 and rejects stale cases", () => {
  const r = runNode("run.mjs", ["--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.status, "pass");
  assert.equal(body.result.failed, 0);
  assert.ok(body.result.total >= 6);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
  const green = body.result.rows.find((row) => row.id === "greenwash-stale-pin");
  assert.equal(green.pass, true);
  assert.equal(green.reject, true);
  const control = body.result.rows.find((row) => row.id === "current-pin-honest");
  assert.equal(control.pass, true);
  assert.equal(control.reject, false);
});

test("seeded greenwash as accept exits 1 with SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--seeded-greenwash", "--json"]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(
    (body.result?.reasons || body.error?.reasons || []).includes("greenwash") ||
      body.result?.greenwash === true,
  );
  assert.equal(body.boundary.paymentSent, false);
});

test("verify --expect accept on greenwash exits 1 SEED_REJECT", () => {
  const r = runNode("verify.mjs", [
    "--json",
    "--fixture",
    "fixtures/cases/greenwash-stale-pin.json",
    "--expect",
    "accept",
  ]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
});

test("matching current pin as fixture does not diverge: SEED_MISS", () => {
  const r = runNode("run.mjs", ["--fixture", "fixtures/seeded/matching-current.json", "--json"]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_MISS");
});

test("seeded false-accept pointer exits 1 SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--fixture", "fixtures/seeded/false-accept.json", "--json"]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.error.code, "SEED_REJECT");
});
