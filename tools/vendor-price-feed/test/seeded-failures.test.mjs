import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ingestObservation } from "../lib/ingest.mjs";
import { FeedRefuse } from "../lib/refuse.mjs";
import { replaceRecord, writeLiveCatalogFile } from "../lib/store.mjs";
import { fixture, parseStdout, runCli, tmpStore } from "./helpers.mjs";

function load(name) {
  return JSON.parse(readFileSync(fixture(name), "utf8"));
}

function ingestOrRefuse(input, storeDir, flags = {}) {
  try {
    return ingestObservation(input, { storeDir, flags });
  } catch (err) {
    if (err instanceof FeedRefuse) return err.toJSON();
    throw err;
  }
}

describe("seeded fail-closed cases", () => {
  it("missing source URL is rejected", () => {
    const storeDir = tmpStore("vpf-miss-");
    const body = ingestOrRefuse(load("missing-source-url.json"), storeDir);
    assert.equal(body.ok, false);
    assert.equal(body.code, "missing-source-url");
    assert.equal(body.refused, true);

    const cli = runCli(["ingest", "--file", fixture("missing-source-url.json")], { storeDir });
    assert.equal(cli.status, 2);
    const parsed = parseStdout(cli);
    assert.equal(parsed.code, "missing-source-url");
    assert.equal(parsed.ok, false);
  });

  it("wrong units / float amount are rejected", () => {
    const storeDir = tmpStore("vpf-unit-");
    const wrongUnit = ingestOrRefuse(load("wrong-unit.json"), storeDir);
    assert.equal(wrongUnit.ok, false);
    assert.equal(wrongUnit.code, "invalid-unit");
    assert.match(wrongUnit.error, /unit/i);

    const floatAmt = ingestOrRefuse(load("float-amount.json"), storeDir);
    assert.equal(floatAmt.ok, false);
    assert.equal(floatAmt.code, "amount-not-decimal");
    assert.match(floatAmt.error, /decimal|float/i);

    const cliUnit = runCli(["ingest", "--file", fixture("wrong-unit.json")], { storeDir });
    assert.equal(cliUnit.status, 2);
    assert.equal(parseStdout(cliUnit).code, "invalid-unit");

    const cliFloat = runCli(["ingest", "--file", fixture("float-amount.json")], { storeDir });
    assert.equal(cliFloat.status, 2);
    assert.equal(parseStdout(cliFloat).code, "amount-not-decimal");
  });

  it("SAMPLE as upstream is rejected", () => {
    const storeDir = tmpStore("vpf-sample-");
    const body = ingestOrRefuse(load("sample-as-upstream.json"), storeDir);
    assert.equal(body.ok, false);
    assert.equal(body.code, "sample-not-upstream");
    assert.equal(body.sample, true);
    assert.equal(body.purchaseAuthorized, false);

    const cli = runCli(["ingest", "--file", fixture("sample-as-upstream.json")], { storeDir });
    assert.equal(cli.status, 2);
    assert.equal(parseStdout(cli).code, "sample-not-upstream");
  });

  it("overwriting history is rejected", () => {
    const storeDir = tmpStore("vpf-hist-");
    const first = ingestOrRefuse(load("ok.json"), storeDir);
    assert.equal(first.ok, true);

    const uncoupled = ingestOrRefuse(load("overwrite-uncoupled.json"), storeDir);
    assert.equal(uncoupled.ok, false);
    assert.equal(uncoupled.code, "history-overwrite");

    assert.throws(() => replaceRecord(), (err) => {
      assert.equal(err.code, "history-overwrite");
      return true;
    });

    const listed = parseStdout(runCli(["list-current"], { storeDir }));
    assert.deepEqual(listed.currentIds, [first.id]);
    assert.equal(listed.current[0].observation.amount, "2.0");
  });

  it("changing live SDS prices is rejected", () => {
    const storeDir = tmpStore("vpf-live-");
    const body = ingestOrRefuse(load("live-sds-extract.json"), storeDir);
    assert.equal(body.ok, false);
    assert.equal(body.code, "live-sds-price-mutation");
    assert.equal(body.liveCatalogWritten, false);
    assert.equal(body.purchaseAuthorized, false);

    const flagged = ingestOrRefuse(load("ok.json"), storeDir, { "write-live": true });
    assert.equal(flagged.ok, false);
    assert.equal(flagged.code, "live-sds-price-mutation");

    assert.throws(() => writeLiveCatalogFile(), (err) => {
      assert.equal(err.code, "live-sds-price-mutation");
      return true;
    });

    const cli = runCli(["ingest", "--file", fixture("live-sds-extract.json")], { storeDir });
    assert.equal(cli.status, 2);
    assert.equal(parseStdout(cli).code, "live-sds-price-mutation");

    const writeLive = runCli(
      ["journey", "--fixture", fixture("ok.json"), "--write-live"],
      {},
    );
    assert.equal(writeLive.status, 2);
    assert.equal(parseStdout(writeLive).code, "live-sds-price-mutation");
  });
});
