import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pack = dirname(fileURLToPath(new URL(".", import.meta.url)));
const bin = join(pack, "bin/listing-repair-verifier.mjs");
const advDir = join(pack, "fixtures/adversarial");

for (const name of readdirSync(advDir).filter((n) => n.endsWith(".packet.json"))) {
  test(`adversarial ${name} is rejected`, () => {
    const r = spawnSync(
      process.execPath,
      [bin, "verify", "--packet", `fixtures/adversarial/${name}`, "--source", "fixtures/ok/ok-source.json"],
      { encoding: "utf8", cwd: pack },
    );
    const body = JSON.parse(String(r.stdout || "").trim());
    assert.equal(r.status, 1, `${name} should exit 1: ${JSON.stringify(body.reasons)}`);
    assert.equal(body.ok, false);
    assert.equal(body.checks.publish, false);
    assert.equal(body.checks.accepted_correction, false);
    assert.equal(body.provenance.purchaseAuthority, false);
  });
}
