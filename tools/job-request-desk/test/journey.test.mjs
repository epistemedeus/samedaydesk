import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CALLER_AFTER, CALLER_BEFORE, parseJson, runDesk, tempStore } from "./helpers.mjs";

describe("literal caller journey", { timeout: 120_000 }, () => {
  it("create vendor-budget-impact from F08 caller fixtures: queued->completed, stable requestId, outputs listed, sold false", () => {
    const store = tempStore("jrd-journey-");
    const created = runDesk([
      "create",
      "vendor-budget-impact",
      "--before",
      CALLER_BEFORE,
      "--after",
      CALLER_AFTER,
      "--store",
      store,
    ]);
    assert.equal(created.status, 0, created.stderr + created.stdout);
    const body = parseJson(created.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.engineId, "vendor-budget-impact");
    assert.equal(body.sold, false);
    assert.equal(body.purchaseAuthority, false);
    assert.equal(body.sample, false);
    assert.equal(body.status, "completed");
    assert.match(body.requestId, /^[0-9a-f]{64}$/);
    assert.match(body.termsVersion, /^sha256:[0-9a-f]{64}$/);
    assert.equal(body.requestId, body.termsVersion.slice("sha256:".length));
    assert.equal(typeof body.resultUri, "string");
    assert.match(body.resultUri, /^file:\/\//);
    const names = (body.outputs || []).map((o) => o.name).sort();
    assert.deepEqual(names, ["budget-impact.json", "budget-impact.md"]);
    for (const out of body.outputs) {
      assert.equal(existsSync(out.path), true);
      assert.match(out.sha256, /^[0-9a-f]{64}$/);
      assert.equal(typeof out.bytes, "number");
    }
    const history = (body.statusHistory || []).map((h) => h.status);
    assert.deepEqual(history, ["queued", "running", "completed"]);

    const status = runDesk(["status", "--store", store, "--request-id", body.requestId]);
    assert.equal(status.status, 0, status.stderr + status.stdout);
    const again = parseJson(status.stdout);
    assert.equal(again.requestId, body.requestId);
    assert.equal(again.status, "completed");
    assert.equal(again.sold, false);

    const listed = runDesk(["list", "--store", store]);
    assert.equal(listed.status, 0, listed.stderr + listed.stdout);
    const listBody = parseJson(listed.stdout);
    assert.equal(listBody.sold, false);
    assert.equal(listBody.requests.some((r) => r.requestId === body.requestId), true);

    const replay = runDesk([
      "create",
      "vendor-budget-impact",
      "--before",
      CALLER_BEFORE,
      "--after",
      CALLER_AFTER,
      "--store",
      store,
    ]);
    assert.equal(replay.status, 0, replay.stderr + replay.stdout);
    const replayBody = parseJson(replay.stdout);
    assert.equal(replayBody.requestId, body.requestId);
    assert.equal(replayBody.status, "completed");
    assert.equal(replayBody.sold, false);

    assert.equal(existsSync(join(store, "tickets", `${body.requestId}.json`)), true);
  });

  it("create --defer records queued without completing; later create runs the same requestId", () => {
    const store = tempStore("jrd-defer-");
    const deferred = runDesk([
      "create",
      "vendor-budget-impact",
      "--before",
      CALLER_BEFORE,
      "--after",
      CALLER_AFTER,
      "--store",
      store,
      "--defer",
    ]);
    assert.equal(deferred.status, 0, deferred.stderr + deferred.stdout);
    const queued = parseJson(deferred.stdout);
    assert.equal(queued.status, "queued");
    assert.equal(queued.sold, false);
    assert.match(queued.resultUri, /^file:\/\//);
    assert.deepEqual((queued.statusHistory || []).map((h) => h.status), ["queued"]);

    const ran = runDesk([
      "create",
      "vendor-budget-impact",
      "--before",
      CALLER_BEFORE,
      "--after",
      CALLER_AFTER,
      "--store",
      store,
    ]);
    assert.equal(ran.status, 0, ran.stderr + ran.stdout);
    const completed = parseJson(ran.stdout);
    assert.equal(completed.requestId, queued.requestId);
    assert.equal(completed.status, "completed");
    assert.equal(completed.sold, false);
    assert.deepEqual((completed.statusHistory || []).map((h) => h.status), ["queued", "running", "completed"]);
  });
});
