import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { classifyStaleOutput } from "./lib/classify.mjs";
import { CURRENT_PIN, STALE_PINS } from "./lib/pin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));

function runNode(script, args) {
  return spawnSync(process.execPath, [join(here, script), ...args], {
    encoding: "utf8",
    cwd: here,
  });
}

test("manifest has ≥5 cases including seeded greenwash", () => {
  assert.ok(manifest.cases.length >= 5);
  assert.ok(manifest.cases.some((c) => c.seededGreenwash || c.id === manifest.seededGreenwash));
  assert.equal(manifest.currentPin.sha256, CURRENT_PIN.sha256);
});

test("each fixture classifies as reject with reasons", () => {
  for (const c of manifest.cases) {
    const raw = JSON.parse(readFileSync(join(here, c.file), "utf8"));
    const v = classifyStaleOutput(raw.output || raw, { surface: raw.surface });
    assert.equal(v.reject, true, c.id);
    assert.ok(v.reasons.length > 0, c.id);
    assert.equal(v.detail.claimedSuccess, true, `${c.id} must claim success (greenwash shape)`);
    assert.equal(v.greenwash, true, c.id);
    for (const reason of raw.expectedReasons || []) {
      assert.ok(v.reasons.includes(reason), `${c.id} missing reason ${reason}: ${v.reasons}`);
    }
  }
});

test("CURRENT_PIN matches usefulJobsKit.json and STALE_PINS cover archives", () => {
  const kit = JSON.parse(
    readFileSync(join(here, "../../../client/src/data/usefulJobsKit.json"), "utf8"),
  );
  assert.equal(kit.version, CURRENT_PIN.version);
  assert.equal(kit.sha256, CURRENT_PIN.sha256);
  assert.equal(kit.bytes, CURRENT_PIN.bytes);
  const hist = [kit.previous, ...(kit.immutableArchives || [])].filter(Boolean);
  for (const h of hist) {
    if (h.version === kit.version) continue;
    const pin = STALE_PINS[h.version];
    assert.ok(pin, `missing stale pin ${h.version}`);
    assert.equal(pin.sha256, h.sha256, h.version);
    assert.equal(pin.bytes, h.bytes, h.version);
  }
});

test("current-pin-ok is not rejected", () => {
  const raw = JSON.parse(readFileSync(join(here, "fixtures/cases/current-pin-ok.json"), "utf8"));
  const v = classifyStaleOutput(raw.output, { surface: raw.surface });
  assert.equal(v.reject, false);
  assert.equal(v.greenwash, false);
  const r = runNode("verify.mjs", ["--json", "--fixture", "fixtures/cases/current-pin-ok.json", "--expect", "accept"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.result.reject, false);
});

test("string bytes still flag stale_bytes on useful-jobs", () => {
  const v = classifyStaleOutput(
    {
      ok: true,
      status: "pass",
      feature: "useful-jobs",
      version: "1.4.7",
      sha256: CURRENT_PIN.sha256,
      bytes: String(2577606),
    },
    { surface: "useful-jobs" },
  );
  assert.equal(v.reject, true);
  assert.ok(v.reasons.includes("stale_bytes"));
});

test("cold run.mjs exits 0 and rejects all", () => {
  const r = runNode("run.mjs", ["--json"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.result.failed, 0);
  assert.ok(body.result.total >= 5);
  assert.equal(body.boundary.paymentSent, false);
  assert.equal(body.boundary.stripeOrX402, false);
});

test("seeded greenwash as accept exits 1 with SEED_REJECT", () => {
  const r = runNode("run.mjs", ["--seeded-greenwash", "--json"]);
  assert.notEqual(r.status, 0);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_REJECT");
  assert.ok(
    (body.result?.reasons || body.error?.reasons || []).includes("greenwash") ||
      body.result?.greenwash === true,
  );
});

test("verify --expect accept on greenwash exits 1", () => {
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

test("seeded current-pin-ok is SEED_FALSE_ACCEPT not SEED_REJECT", () => {
  const r = runNode("run.mjs", [
    "--seeded-greenwash",
    "--seed-file",
    "fixtures/cases/current-pin-ok.json",
    "--json",
  ]);
  assert.equal(r.status, 1);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SEED_FALSE_ACCEPT");
  assert.equal(body.result.reject, false);
  assert.equal(body.result.childOk, true);
});

test("verify refuses fixture paths outside the package", () => {
  const r = runNode("verify.mjs", ["--json", "--fixture", "/tmp/stale-output-outside.json"]);
  assert.equal(r.status, 2);
  const body = JSON.parse(r.stdout.trim());
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "PATH_REFUSE");
});
