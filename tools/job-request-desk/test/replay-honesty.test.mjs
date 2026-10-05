import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, it } from "node:test";
import { openDesk } from "../lib/index.mjs";
import { createLocalDeskServer } from "../lib/http-adapter.mjs";
import { OUTCOME_KIND } from "../lib/outcomes.mjs";
import { SDS52_PIN } from "../lib/pins.mjs";
import { resolveWrapperRoot } from "../lib/sds52.mjs";
import { CALLER_AFTER, CALLER_BEFORE, parseJson, runDesk, tempStore } from "./helpers.mjs";
import { spawnSync } from "node:child_process";

function failRunner() {
  return { status: 1, stdout: "", stderr: "boom", json: null };
}

function writeBothOutputs(dir, jsonText, mdText) {
  writeFileSync(join(dir, "budget-impact.json"), jsonText);
  writeFileSync(join(dir, "budget-impact.md"), mdText);
}

describe("honest replay and isolated outputs", { timeout: 180_000 }, () => {
  it("SDS52 wrapper CLI list is a real process at the pinned head", () => {
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

  it("CLI: rejected replay remains rejected and never returns ok true", () => {
    const store = tempStore("jrd-reject-replay-");
    const desk = openDesk(store, { engineRunner: failRunner });
    const first = desk.createRequest({
      engineId: "vendor-budget-impact",
      inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
    });
    assert.equal(first.ok, false);
    assert.equal(first.status, "rejected");
    assert.equal(first.refused, true);
    assert.equal(first.executionOk, false);
    assert.equal(first.outcomeKind, OUTCOME_KIND.transportFailure);
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
    const desk = openDesk(store, { engineRunner: failRunner });
    const first = desk.createRequest({
      engineId: "vendor-budget-impact",
      inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
    });
    assert.equal(first.status, "rejected");

    const { baseUrl, close } = await createLocalDeskServer(desk).listen();
    try {
      const res = await fetch(`${baseUrl}/v1/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engineId: "vendor-budget-impact",
          inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
        }),
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
      assert.equal(lookedUp.ok, true);
      assert.equal(lookedUp.status, "rejected");
      assert.equal(lookedUp.executionOk, false);
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
    assert.equal(body.outcomeKind, OUTCOME_KIND.delivered);
    assert.equal(body.sds52Pin, SDS52_PIN);
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

  it("HTTP: subset engine plus leftover catalog names cannot complete", async () => {
    const store = tempStore("jrd-subset-");
    const desk = openDesk(store, {
      engineRunner: (_id, { outDir }) => {
        writeFileSync(join(outDir, "budget-impact.md"), "fresh-md-only\n");
        return { status: 0, stdout: JSON.stringify({ ok: true, status: "ok" }), json: { ok: true, status: "ok" } };
      },
    });
    const queued = desk.createRequest({
      engineId: "vendor-budget-impact",
      inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
      defer: true,
    });
    writeFileSync(join(store, "results", queued.requestId, "budget-impact.json"), "STALE-FOREIGN-BYTES\n");

    const { baseUrl, close } = await createLocalDeskServer(desk).listen();
    try {
      const res = await fetch(`${baseUrl}/v1/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engineId: "vendor-budget-impact",
          inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.ok, false);
      assert.equal(body.status, "rejected");
      assert.equal(body.outcomeKind, OUTCOME_KIND.incompleteOutputs);
      assert.equal(body.code, "incomplete-outputs");
      assert.deepEqual(body.outputs || [], []);
      const leftover = join(store, "results", queued.requestId, "budget-impact.json");
      assert.equal(existsSync(leftover), false);
    } finally {
      await close();
    }
  });

  it("valid analysis refusal with complete artifacts is not a transport crash", () => {
    const store = tempStore("jrd-analysis-");
    const desk = openDesk(store, {
      engineRunner: (_id, { outDir }) => {
        writeBothOutputs(outDir, '{"status":"refused","ok":false}\n', "refused\n");
        return {
          status: 2,
          stdout: JSON.stringify({ ok: false, engine: { ok: false, status: "refused" } }),
          json: { ok: false, status: "refused" },
        };
      },
    });
    const first = desk.createRequest({
      engineId: "vendor-budget-impact",
      inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
    });
    assert.equal(first.ok, true);
    assert.equal(first.status, "completed");
    assert.equal(first.sold, false);
    assert.equal(first.outcomeKind, OUTCOME_KIND.analysisRefused);
    assert.equal(first.analysisOutcome, "refused");
    assert.equal(first.executionOk, true);

    const replay = desk.createRequest({
      engineId: "vendor-budget-impact",
      inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.replay, true);
    assert.equal(replay.status, "completed");
    assert.equal(replay.outcomeKind, OUTCOME_KIND.analysisRefused);
    assert.notEqual(replay.status, "rejected");
  });
});
