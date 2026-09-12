import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadCatalog } from "../lib/catalog.mjs";
import { normalizeRequest } from "../lib/contract.mjs";
import { buildTerms } from "../lib/create-order.mjs";
import { hashTerms } from "../lib/digest.mjs";
import { loadPins } from "../lib/pins.mjs";
import { loadOrder, ORDERS, parseStdout, runCli, spawnCli, tmpOut, tmpStore } from "./helpers.mjs";

describe("concurrent reserve and interrupted resume", { timeout: 240_000 }, () => {
  it("two CLI processes produce one intended order, not duplicate execution", async () => {
    const store = tmpStore();
    const request = "tools/managed-useful-jobs-order/fixtures/orders/ord-1.json";
    const a = spawnCli(["create", "--request", request], { store, outDir: tmpOut() });
    const b = spawnCli(["create", "--request", request], { store, outDir: tmpOut() });
    const [first, second] = await Promise.all([a.done, b.done]);
    assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}`);
    assert.equal(second.status, 0, `${second.stderr}\n${second.stdout}`);
    const one = parseStdout(first);
    const two = parseStdout(second);
    assert.equal(one.ok, true, JSON.stringify(one));
    assert.equal(two.ok, true, JSON.stringify(two));
    assert.equal(one.orderId, "ord-1");
    assert.equal(two.orderId, "ord-1");
    assert.equal(one.termsHash, two.termsHash);
    assert.equal(one.wrapper.executionId, two.wrapper.executionId);
    const replayedCount = [one.replayed, two.replayed].filter(Boolean).length;
    assert.equal(replayedCount, 1, `expected one replay, got a.replayed=${one.replayed} b.replayed=${two.replayed}`);
    const journal = readFileSync(join(store, "executions.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.equal(journal.length, 1, `duplicate execution journal: ${journal.join("\n")}`);
  });

  it("interrupted reserved order resumes once instead of creating a second order", () => {
    const store = tmpStore();
    const pins = loadPins();
    const catalog = loadCatalog(pins.catalogPath);
    const raw = loadOrder("ord-1.json");
    const request = normalizeRequest(raw, { catalog, pins, requestDir: ORDERS });
    const termsHash = hashTerms(buildTerms(request, pins));
    writeFileSync(
      join(store, "ord-1.json"),
      `${JSON.stringify(
        {
          orderId: "ord-1",
          termsHash,
          status: "reserved",
          holderPid: 999999999,
          executionCount: 0,
          engineId: "api-upgrade-brief",
          archiveSha256: pins.archiveSha256,
          request: { engineId: "api-upgrade-brief", orderId: "ord-1" },
          result: null,
        },
        null,
        2,
      )}\n`,
    );

    const resumed = runCli(["create", "--request", "tools/managed-useful-jobs-order/fixtures/orders/ord-1.json"], {
      store,
      outDir: tmpOut(),
    });
    assert.equal(resumed.status, 0, `${resumed.stderr}\n${resumed.stdout}`);
    const body = parseStdout(resumed);
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(body.orderId, "ord-1");
    assert.equal(body.replayed, false);
    assert.equal(body.termsHash, termsHash);
    const journal = readFileSync(join(store, "executions.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.equal(journal.length, 1);
    const stored = JSON.parse(readFileSync(join(store, "ord-1.json"), "utf8"));
    assert.equal(stored.status, "complete");
    assert.equal(stored.result.orderId, "ord-1");
  });
});
