import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadOrder, parseStdout, runCli, tmpOut, tmpStore } from "./helpers.mjs";

describe("public CLI journey: api-upgrade-brief ord-1", { timeout: 180_000 }, () => {
  it("creates a bound local-runtime order and refuses swapped files on the same orderId", () => {
    const store = tmpStore();
    const outDir = tmpOut();
    const first = runCli(
      ["create", "--request", "tools/managed-useful-jobs-order/fixtures/orders/ord-1.json"],
      { store, outDir },
    );
    assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}`);
    const body = parseStdout(first);
    assert.equal(body.ok, true);
    assert.equal(body.orderId, "ord-1");
    assert.equal(body.engineId, "api-upgrade-brief");
    assert.equal(body.archiveSha256, "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51");
    assert.equal(body.archiveBytes, 2522418);
    assert.equal(body.sold, false);
    assert.equal(body.charged, false);
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.example, false);
    assert.equal(body.sample, false);
    assert.equal(body.acceptanceClass, "local-runtime");
    assert.equal(body.liveCatalogItem, false);
    assert.equal(body.productionExpressRoute, false);
    assert.deepEqual(
      body.outputs.map((row) => row.name),
      ["upgrade-brief.json", "upgrade-brief.md"],
    );
    for (const row of body.outputs) {
      assert.match(row.sha256, /^[0-9a-f]{64}$/);
      assert.equal(existsSync(join(outDir, row.name)), true);
    }
    const fixture = loadOrder("ord-1.json");
    assert.deepEqual(body.inputSha256, fixture.inputs.map((inp) => inp.sha256));

    const jsonOut = JSON.parse(readFileSync(join(outDir, "upgrade-brief.json"), "utf8"));
    assert.equal(jsonOut.appId, "api-upgrade-brief");

    const replay = runCli(
      ["create", "--request", "tools/managed-useful-jobs-order/fixtures/orders/ord-1.json"],
      { store, outDir: tmpOut() },
    );
    assert.equal(replay.status, 0, `${replay.stderr}\n${replay.stdout}`);
    const replayed = parseStdout(replay);
    assert.equal(replayed.ok, true);
    assert.equal(replayed.orderId, "ord-1");
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.termsHash, body.termsHash);

    const swapped = runCli(
      ["create", "--request", "tools/managed-useful-jobs-order/fixtures/orders/ord-1-swapped.json"],
      { store, outDir: tmpOut() },
    );
    assert.equal(swapped.status, 2, `${swapped.stderr}\n${swapped.stdout}`);
    const refused = parseStdout(swapped);
    assert.equal(refused.ok, false);
    assert.equal(refused.sold, false);
    assert.equal(refused.charged, false);
    assert.equal(refused.falsifier, "F-ORDER");
    assert.equal(refused.code, "f-order");
    assert.equal(refused.orderId, "ord-1");
  });
});
