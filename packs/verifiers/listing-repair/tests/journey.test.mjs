import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FORBIDDEN_COMPLETION_LABEL } from "../src/constants.mjs";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));
const bin = join(pack, "bin/listing-repair-verifier.mjs");

function verdict(args) {
  const r = spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", cwd: pack });
  return { status: r.status, body: JSON.parse(String(r.stdout || "").trim()), stderr: r.stderr };
}

test("ok packet + ok source → ok:true with publish false", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/ok/ok.packet.json",
    "--source",
    "fixtures/ok/ok-source.json",
  ]);
  assert.equal(status, 0, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.checks.publish, false);
  assert.equal(body.checks.accepted_correction, true);
  assert.equal(body.provenance.purchaseAuthority, false);
  assert.equal(Object.hasOwn(body, FORBIDDEN_COMPLETION_LABEL), false);
  assert.equal(body.provenance.completionLabel, "local_run_ok");
});

test("same packet vs newer source digest → stale_source_digest", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/reject/stale-digest.packet.json",
    "--source",
    "fixtures/ok/newer-source.json",
  ]);
  assert.equal(status, 1);
  assert.ok(body.reasons.includes("stale_source_digest"));
  assert.equal(body.checks.accepted_correction, false);
});

test("1.4.7 --example cold packet must not be accepted_correction", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/cold/example-1.4.7.packet.json",
    "--source",
    "fixtures/cold/example-1.4.7.source.json",
  ]);
  assert.equal(status, 1);
  assert.equal(body.ok, false);
  assert.ok(body.reasons.includes("fabricated_sample"));
  assert.equal(body.checks.accepted_correction, false);
  assert.equal(body.checks.publish, false);
  assert.equal(body.provenance.purchaseAuthority, false);
});

test("helm bar: ≥30 packet fixtures and ≥6 adversarial", () => {
  function walk(dir, acc = []) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p, acc);
      else if (name.name.endsWith(".packet.json")) acc.push(p);
    }
    return acc;
  }
  const packets = walk(join(pack, "fixtures"));
  const adversarial = packets.filter((p) => p.includes(`${join("fixtures", "adversarial")}`) || p.includes("/adversarial/"));
  assert.ok(packets.length >= 30, `expected ≥30 packets, got ${packets.length}`);
  assert.ok(adversarial.length >= 6, `expected ≥6 adversarial, got ${adversarial.length}`);
});

test("ok route packet passes without corrections[]", () => {
  const { status, body } = verdict([
    "verify",
    "--packet",
    "fixtures/ok/ok-route.packet.json",
    "--source",
    "fixtures/ok/ok-source.json",
  ]);
  assert.equal(status, 0, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.checks.publish, false);
});
