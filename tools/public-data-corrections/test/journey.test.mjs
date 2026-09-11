import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { CODES } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const cli = join(pkg, "bin/public-data-corrections.mjs");
const okFixture = join(pkg, "fixtures/ok.json");

function run(args, cwd = pkg) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

describe("literal user journey", () => {
  it("public catalog snippet + one field correction, then private email/address is rejected", () => {
    const r = run(["journey", "--fixture", "fixtures/ok.json"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.signal, null);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.rights, "cleared");
    assert.equal(body.publishAuthorized, false);
    assert.equal(body.privateData, false);
    assert.equal(body.code, CODES.ACCEPTED);
    assert.equal(body.correction.field, "runtime.purchaseAuthority");
    assert.equal(body.correction.to, false);
    assert.equal(
      body.correction.citation.url,
      "https://samedaydesk.com/for-agents/useful-jobs/catalog.json",
    );
    assert.match(body.correction.citation.digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(body.privatePacket.ok, false);
    assert.equal(body.privatePacket.code, CODES.PRIVATE_DATA);
    assert.equal(body.privatePacket.privateData, true);
    assert.equal(body.privatePacket.publishAuthorized, false);
    const blob = `${r.stdout}${r.stderr}`;
    assert.equal(blob.includes("jane.doe@customer.example"), false);
    assert.equal(blob.includes("Jane Doe"), false);
  });

  it("check on ok.json is rights-cleared and not publish-authorized", () => {
    const r = run(["check", "--fixture", okFixture], pkg);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.rights, "cleared");
    assert.equal(body.publishAuthorized, false);
  });

  it("journey without --fixture is a structured rejection", () => {
    const r = run(["journey"]);
    assert.equal(r.status, 2);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.publishAuthorized, false);
    assert.equal(body.code, CODES.FIXTURE_REQUIRED);
  });
});
