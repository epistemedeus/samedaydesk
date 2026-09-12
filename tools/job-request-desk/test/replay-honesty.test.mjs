import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, it } from "node:test";
import { openDesk } from "../lib/index.mjs";
import { createLocalDeskServer } from "../lib/http-adapter.mjs";
import { CURRENT_CORE_BASE, runCurrent } from "../lib/current.mjs";
import { resolveWrapperRoot } from "../lib/sds52.mjs";
import { CALLER_AFTER, CALLER_BEFORE, parseJson, runDesk, tempStore } from "./helpers.mjs";
import { spawnSync } from "node:child_process";

const request = {
  engineId: "vendor-budget-impact",
  inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
};

function failExecute() {
  throw new Error("boom");
}

describe("honest replay and isolated outputs", { timeout: 180_000 }, () => {
  it("current wrapper CLI list is a real process at the consumed pin", () => {
    const root = resolveWrapperRoot();
    const cli = join(root, "bin/cli.mjs");
    assert.equal(existsSync(cli), true);
    const listed = spawnSync(process.execPath, [cli, "list"], {
      encoding: "utf8",
      cwd: join(root, "../.."),
      timeout: 30_000,
    });
    assert.equal(listed.status, 0, listed.stderr + listed.stdout);
    const body = parseJson(listed.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.jobs.includes("vendor-budget-impact"), true);
  });

  it("rejected replay remains rejected and never returns ok true", () => {
    const store = tempStore("jrd-reject-replay-");
    const desk = openDesk(store, { execute: failExecute });
    const first = desk.createRequest(request);
    assert.equal(first.ok, false);
    assert.equal(first.status, "rejected");
    assert.equal(first.refused, true);
    assert.equal(first.executionOk, false);
    assert.equal(first.sold, false);
    assert.match(first.requestId, /^[0-9a-f]{64}$/);

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
    assert.equal(replay.status, 2, replay.stderr + replay.stdout);
    const body = parseJson(replay.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.replay, true);
    assert.equal(body.status, "rejected");
    assert.equal(body.sold, false);
    assert.equal(body.requestId, first.requestId);
  });

  it("HTTP POST of a rejected replay is 400 and stays rejected", async () => {
    const store = tempStore("jrd-http-reject-");
    const desk = openDesk(store, { execute: failExecute });
    const first = desk.createRequest(request);
    assert.equal(first.status, "rejected");

    const { baseUrl, close } = await createLocalDeskServer(desk).listen();
    try {
      const res = await fetch(`${baseUrl}/v1/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.ok, false);
      assert.equal(body.refused, true);
      assert.equal(body.status, "rejected");
      assert.equal(body.replay, true);
      assert.equal(body.sold, false);

      const got = await fetch(`${baseUrl}/v1/requests/${first.requestId}`);
      const lookedUp = await got.json();
      assert.equal(got.status, 200);
      assert.equal(lookedUp.ok, false);
      assert.equal(lookedUp.status, "rejected");
      assert.equal(lookedUp.executionOk, false);
      assert.equal(lookedUp.sold, false);
    } finally {
      await close();
    }
  });

  it("CLI: clean request succeeds without stale bytes from a prior result dir", () => {
    const store = tempStore("jrd-clean-stale-");
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
    const resultDir = join(store, "results", queued.requestId);
    mkdirSync(resultDir, { recursive: true });
    writeFileSync(join(resultDir, "budget-impact.json"), "STALE-FOREIGN-BYTES\n");
    writeFileSync(join(resultDir, "budget-impact.md"), "STALE-MD\n");

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
    const body = parseJson(ran.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.status, "completed");
    assert.equal(body.sold, false);
    assert.equal(body.coreBase, CURRENT_CORE_BASE);
    const jsonPath = join(resultDir, "budget-impact.json");
    assert.equal(existsSync(jsonPath), true);
    const jsonText = readFileSync(jsonPath, "utf8");
    assert.equal(jsonText.includes("STALE-FOREIGN-BYTES"), false);
    const listed = (body.outputs || []).find((o) => o.name === "budget-impact.json");
    assert.ok(listed);
    assert.match(listed.sha256, /^[0-9a-f]{64}$/);
    const staleSha = createHash("sha256").update("STALE-FOREIGN-BYTES\n").digest("hex");
    assert.notEqual(listed.sha256, staleSha);
  });

  it("subset outputs plus leftover catalog names cannot complete", async () => {
    const store = tempStore("jrd-subset-");
    const desk = openDesk(store, {
      execute: (req) => {
        writeFileSync(join(req.outDir, "budget-impact.md"), "fresh-md-only\n");
        const result = runCurrent(req);
        result.outputs = result.outputs.filter((o) => o.name === "budget-impact.md");
        result.receipt.outputs = result.receipt.outputs.filter((o) => o.name === "budget-impact.md");
        result.delivery.present = ["budget-impact.md"];
        result.delivery.missing = ["budget-impact.json"];
        result.delivery.complete = false;
        result.receipt.delivery = { ...result.delivery };
        return result;
      },
    });
    const queued = desk.createRequest({ ...request, defer: true });
    mkdirSync(join(store, "results", queued.requestId), { recursive: true });
    writeFileSync(join(store, "results", queued.requestId, "budget-impact.json"), "STALE-FOREIGN-BYTES\n");

    const { baseUrl, close } = await createLocalDeskServer(desk).listen();
    try {
      const res = await fetch(`${baseUrl}/v1/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.ok, false);
      assert.equal(body.sold, false);
      assert.notEqual(body.status, "completed");
      assert.deepEqual(body.outputs || [], []);
      const leftover = join(store, "results", queued.requestId, "budget-impact.json");
      const staleSha = createHash("sha256").update("STALE-FOREIGN-BYTES\n").digest("hex");
      assert.equal((body.outputs || []).some((o) => o.sha256 === staleSha), false);
      if (existsSync(leftover)) {
        const listed = (body.outputs || []).find((o) => o.name === "budget-impact.json");
        assert.equal(listed, undefined);
      }
    } finally {
      await close();
    }
  });

  it("valid analysis refusal with complete artifacts is not a transport crash", () => {
    const store = tempStore("jrd-analysis-");
    const desk = openDesk(store, {
      execute: (req) => {
        const result = runCurrent(req);
        result.analysis = { ...result.analysis, outcome: "refused", status: "refused" };
        result.receipt.analysis = { ...result.receipt.analysis, outcome: "refused", status: "refused" };
        return result;
      },
    });
    const first = desk.createRequest(request);
    assert.equal(first.ok, true);
    assert.equal(first.status, "completed");
    assert.equal(first.sold, false);
    assert.equal(first.outcomeKind, "analysis-refused");
    assert.equal(first.analysisOutcome, "refused");
    assert.equal(first.executionOk, true);

    const replay = desk.createRequest(request);
    assert.equal(replay.ok, true);
    assert.equal(replay.replay, true);
    assert.equal(replay.status, "completed");
    assert.equal(replay.outcomeKind, "analysis-refused");
    assert.notEqual(replay.status, "rejected");
  });
});
