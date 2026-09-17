import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const pack = dirname(here);
const bin = join(pack, "bin/listing-repair-verifier.mjs");
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));

function verdict(c) {
  const args = ["verify", "--packet", c.packet];
  if (c.source) args.push("--source", c.source);
  const r = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: pack,
  });
  const body = JSON.parse(String(r.stdout || "").trim());
  return { status: r.status, body };
}

test("fixtures-extra MANIFEST has ≥15 packet cases", () => {
  assert.ok(manifest.cases.length >= 15, `got ${manifest.cases.length}`);
});

test("fixtures-extra never accepts publish/purchaseAuthority ok cases", () => {
  for (const c of manifest.cases) {
    if (c.expect !== "ok") continue;
    const pkt = JSON.parse(readFileSync(join(pack, c.packet), "utf8"));
    assert.notEqual(pkt.publish, true, c.id);
    assert.notEqual(pkt.purchaseAuthority, true, c.id);
  }
});

for (const c of manifest.cases) {
  test(`fixtures-extra ${c.id} → exit ${c.expectedExit}`, () => {
    const { status, body } = verdict(c);
    assert.equal(status, c.expectedExit, JSON.stringify(body.reasons));
    if (c.expect === "ok") assert.equal(body.ok, true);
    else assert.equal(body.ok, false);
    assert.equal(body.checks.publish, false);
    assert.equal(body.provenance.purchaseAuthority, false);
  });
}

test("seeded failure: publish-attempt exits 1", () => {
  const c = manifest.cases.find((x) => x.id === "publish-attempt");
  assert.ok(c);
  const { status, body } = verdict(c);
  assert.equal(status, 1);
  assert.equal(body.ok, false);
  assert.ok(
    body.reasons.includes("publish_attempted") || body.reasons.includes("live_sds_write"),
    JSON.stringify(body.reasons),
  );
});
