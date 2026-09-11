import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { checkFixture } from "../lib/journey.mjs";
import { evaluate } from "../lib/evaluate.mjs";
import { CODES } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const cli = join(pkg, "bin/public-data-corrections.mjs");
const fixtures = join(pkg, "fixtures");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

function runCheck(name) {
  return spawnSync(
    process.execPath,
    [cli, "check", "--fixture", join(fixtures, name)],
    { encoding: "utf8", cwd: pkg, timeout: 30_000 },
  );
}

describe("seeded fail-closed cases", () => {
  it("private data in the collection is rejected", () => {
    const result = checkFixture(join(fixtures, "private-data.json"));
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.PRIVATE_DATA);
    assert.equal(result.privateData, true);
    assert.equal(result.publishAuthorized, false);
    assert.ok(result.reasons.includes("email-shape"));
    assert.ok(result.reasons.includes("street-address-shape"));
    const blob = JSON.stringify(result);
    assert.equal(blob.includes("jane.doe@customer.example"), false);
    assert.equal(blob.includes("123 Main Street"), false);

    const cliResult = runCheck("private-data.json");
    assert.equal(cliResult.status, 2);
    const body = JSON.parse(cliResult.stdout);
    assert.equal(body.code, CODES.PRIVATE_DATA);
    assert.equal(`${cliResult.stdout}${cliResult.stderr}`.includes("jane.doe@customer.example"), false);
  });

  it("unknown rights labelled cleared is rejected", () => {
    const result = checkFixture(join(fixtures, "unknown-rights-labelled-cleared.json"));
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.UNKNOWN_RIGHTS_LABELLED_CLEARED);
    assert.equal(result.publishAuthorized, false);
    assert.equal(result.rights, "cleared");
  });

  it("SAMPLE as customer-owned is rejected", () => {
    const result = checkFixture(join(fixtures, "sample-as-customer-owned.json"));
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.SAMPLE_AS_CUSTOMER_OWNED);
    assert.equal(result.publishAuthorized, false);
    assert.equal(result.sample, true);
  });

  it("auto-publish is rejected", () => {
    const result = checkFixture(join(fixtures, "auto-publish.json"));
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.AUTO_PUBLISH);
    assert.equal(result.publishAuthorized, false);
  });

  it("inventing a paying rights holder is rejected", () => {
    const result = checkFixture(join(fixtures, "invented-paying-rights-holder.json"));
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.INVENTED_PAYING_RIGHTS_HOLDER);
    assert.equal(result.publishAuthorized, false);
  });

  it("unknown rights cannot publish", () => {
    const result = checkFixture(join(fixtures, "unknown-rights.json"));
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.UNKNOWN_RIGHTS_CANNOT_PUBLISH);
    assert.equal(result.rights, "unknown");
    assert.equal(result.publishAuthorized, false);
  });

  it("H3 Neo ledger is out of directory", () => {
    const result = checkFixture(join(fixtures, "h3-neo-ledger.json"));
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.H3_NEO_OUT_OF_DIRECTORY);
    assert.equal(result.publishAuthorized, false);
  });

  it("privateData: false is required", () => {
    const packet = load("ok.json");
    delete packet.privateData;
    const result = evaluate(packet);
    assert.equal(result.ok, false);
    assert.equal(result.code, CODES.PRIVATE_DATA_FLAG_REQUIRED);
    assert.equal(result.publishAuthorized, false);
  });
});
