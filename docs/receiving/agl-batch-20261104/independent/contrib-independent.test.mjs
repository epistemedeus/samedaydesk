// Independent cases for the received CONTRIB pin. This file does not edit that pin.
import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const pin = process.env.AGL_CONTRIB_ROOT;
if (!pin) throw new Error("AGL_CONTRIB_ROOT is required");

const { applyRosterRename, evidenceX, NEED_X, RIGHTS_X } = await import(
  pathToFileURL(join(pin, "experiments/agl-contribution-delegation-20261104/inputs.mjs")).href
);
const { machineHost } = await import(
  pathToFileURL(join(pin, "server/scripts/root10940-machine-host.mjs")).href
);

const CLIENT = join(pin, "vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs");
const CLIENT_SHA = "38d4e05cc757223f20e727fc75cf5a8bfe6d4e6dcaadd6cecdaff248422529d4";
const PREFIX = "/api/neomorphic-contributor-journey";
const SOURCE_COMMIT = "0593026ad155352f263e4749dc889a1578d91675";
const SOURCE_REPOSITORY = "https://github.com/epistemedeus/samedaydesk.git";
const SOURCE_PATH = "vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs";
const OTHER_ROW = Object.freeze({
  crew_code: "SYN-Z-902",
  shift_window: "mid",
  dock: "south",
  gate: "2",
});

test("a different changed row maps renamed fields and leaves the extra fields unmapped", () => {
  const evidence = evidenceX();
  const beforeEvidence = JSON.stringify(evidence);
  const beforeRow = JSON.stringify(OTHER_ROW);
  const applied = applyRosterRename(evidence, OTHER_ROW);
  assert.deepEqual(applied.applied, { workerId: "SYN-Z-902", windowLabel: "mid" });
  assert.deepEqual(applied.unmapped, ["dock", "gate"]);
  assert.equal(Object.hasOwn(applied.applied, "dock"), false);
  assert.equal(Object.hasOwn(applied.applied, "gate"), false);
  assert.notDeepEqual(applied.sampleInput, OTHER_ROW);
  assert.equal(JSON.stringify(evidence), beforeEvidence);
  assert.equal(JSON.stringify(OTHER_ROW), beforeRow);

  assert.throws(() => applyRosterRename(evidence, { crew_code: "SYN-Z-902" }), /changed_input_field_missing/);
  const recovered = applyRosterRename(evidence, OTHER_ROW);
  assert.equal(recovered.applied.workerId, "SYN-Z-902");
  assert.throws(() => applyRosterRename({ businessResult: JSON.stringify({ schema: "other", implementation: "X", renames: [] }) }, OTHER_ROW), /artifact_schema_refused/);
});

test("second grant, lost response, withdrawal, and re-grant stay on the disposable host", { timeout: 180000 }, async () => {
  const host = await machineHost();
  const directory = mkdtempSync(join(host.scratch, "agl-ind-"));
  const file = (name) => join(directory, name);
  let seq = 0;
  const secrets = {};
  try {
    await host.boot({ participation: true, acceptedWorkPublic: false });
    const beforeMoney = await host.financialSnapshot();
    const pins = ["--origin", host.origin, "--ca-file", host.caFile];
    async function cold(args) {
      try {
        const { stdout } = await exec(process.execPath, ["--max-old-space-size=256", CLIENT, ...args], {
          encoding: "utf8",
          timeout: 20000,
          maxBuffer: 1024 * 1024,
          env: { ...process.env, UV_THREADPOOL_SIZE: "1", OMP_NUM_THREADS: "1" },
        });
        return { status: 0, body: JSON.parse(stdout) };
      } catch (error) {
        const status = Number.isInteger(error.code) ? error.code : 1;
        let body = {};
        try { body = JSON.parse(error.stdout || "{}"); } catch { body = {}; }
        return { status, body };
      }
    }
    function must(step, response) {
      if (response.status !== 0 || response.body?.ok !== true) {
        const code = response.body?.code || "";
        throw new Error(`${step} failed status=${response.status} code=${code}`);
      }
      return response.body;
    }
    async function act(name, action, input) {
      const path = file(`${action}-${name}-${++seq}.json`);
      writeFileSync(path, JSON.stringify(input));
      return cold(["act", ...pins, "--secret-file", secrets[name], "--action", action, "--input", path]);
    }
    async function readOut(command, name, taskId) {
      const path = file(`${command}-${name}-${++seq}.json`);
      const response = await cold([command, ...pins, "--secret-file", secrets[name], "--task-id", taskId, "--out", path]);
      return {
        response,
        value: response.body?.ok ? JSON.parse(readFileSync(path, "utf8")) : null,
      };
    }
    async function countRows(sql, args = []) {
      const result = await host.query(sql, args);
      return Number(result.rows[0].n);
    }

    const clientSha = createHash("sha256").update(readFileSync(CLIENT)).digest("hex");
    assert.equal(clientSha, CLIENT_SHA);
    const opened = await cold(["profile", ...pins]);
    must("profile", opened);
    assert.equal(opened.body.money, "unfunded");
    assert.equal(opened.body.signerAuthority, false);
    assert.equal(opened.body.participation, "voluntary-artifact-v1");
    const descriptor = {
      schema: "neomorphic.machine-participation.acquisition.v1",
      version: "0.3.0",
      bytes: readFileSync(CLIENT).length,
      sha256: clientSha,
      source: { repository: SOURCE_REPOSITORY, commit: SOURCE_COMMIT, path: SOURCE_PATH },
      requiredProfile: {
        money: "unfunded",
        participation: "voluntary-artifact-v1",
        sourceSha256: opened.body.sourceSha256,
        hostSha256: opened.body.hostSha256,
      },
    };
    const descriptorPath = file("acquisition.json");
    writeFileSync(descriptorPath, JSON.stringify(descriptor));
    const descriptorSha = createHash("sha256").update(readFileSync(descriptorPath)).digest("hex");
    const acquire = [
      "--descriptor", descriptorPath,
      "--descriptor-sha256", descriptorSha,
      "--source-repository", SOURCE_REPOSITORY,
      "--source-commit", SOURCE_COMMIT,
      "--source-path", SOURCE_PATH,
    ];
    const accounts = [
      ["A", "requester", "SYNTHETIC requester A"],
      ["B", "contributor", "SYNTHETIC contributor B"],
      ["C", "requester", "SYNTHETIC requester C"],
      ["E", "requester", "SYNTHETIC requester E"],
    ];
    for (const [name, role, displayName] of accounts) {
      secrets[name] = file(`secret-${name}.json`);
      must(`signup ${name}`, await cold([
        "signup", ...pins, "--secret-file", secrets[name],
        "--display-name", displayName, "--role", role, ...acquire,
      ]));
    }

    const sourcePost = must("post", await cold([
      "post", ...pins, "--secret-file", secrets.A,
      "--title", NEED_X.title, "--summary", NEED_X.summary, "--criterion", NEED_X.criterion,
    ]));
    const sourceId = sourcePost.taskId;
    must("interest", await cold([
      "interest", ...pins, "--secret-file", secrets.B, "--task-id", sourceId,
      "--note", "Synthetic contributor B offers the rename for a different later row.",
    ]));
    let source = must("offer", await act("A", "offerVoluntary", {
      taskId: sourceId, contributorId: JSON.parse(readFileSync(secrets.B, "utf8")).accountId,
      authorizedToRequest: true, rights: RIGHTS_X,
    }));
    const spec = await readOut("inspect", "B", sourceId);
    must("inspect", spec.response);
    source = must("assent", await act("B", "assentVoluntary", {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      authorizedToShare: true, spec: spec.value.spec,
    }));
    source = must("deliver", await act("B", "deliverVoluntary", {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      evidence: evidenceX(),
    }));
    source = must("review", await act("A", "reviewVoluntary", {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      artifactDigest: source.artifactDigest, accepted: true, exportAuthorized: true,
      reason: "The roster rename may be granted to two later synthetic requesters.",
    }));
    source = must("grant C", await act("A", "grantVoluntary", {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      consumerId: JSON.parse(readFileSync(secrets.C, "utf8")).accountId,
    }));
    source = must("grant E", await act("A", "grantVoluntary", {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      consumerId: JSON.parse(readFileSync(secrets.E, "utf8")).accountId,
    }));
    const exported = await readOut("export", "C", sourceId);
    must("export C", exported.response);
    const exportedE = await readOut("export", "E", sourceId);
    must("export E", exportedE.response);
    const applied = applyRosterRename(exported.value.evidence, OTHER_ROW);
    assert.deepEqual(applied.applied, { workerId: "SYN-Z-902", windowLabel: "mid" });
    assert.deepEqual(applied.unmapped, ["dock", "gate"]);
    assert.equal(exported.value.paidWork, false);
    assert.equal(exported.value.relationship, "authorized_later_consumer");

    const later = must("later post", await cold([
      "post", ...pins, "--secret-file", secrets.C,
      "--title", "SYNTHETIC impl Z roster apply",
      "--summary", "Synthetic requester C applies the rename to row SYN-Z-902.",
      "--criterion", "apply-roster-rename-z",
    ]));
    const decision = "Applied implementation X rename to implementation Y row SYN-Z-902. workerId SYN-Z-902 windowLabel mid.";
    const useBefore = await countRows(
      `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`,
      [sourceId],
    );
    const idempotencyBefore = await countRows(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`);
    host.fault.dropAction = "useVoluntary";
    const lost = await act("C", "useVoluntary", {
      taskId: sourceId, laterTaskId: later.taskId,
      artifactDigest: exported.value.artifactDigest, decision,
    });
    assert.equal(lost.status, 2);
    assert.equal(lost.body?.code, "unknown_outcome");
    assert.equal(lost.body?.nextAction, "readback");
    assert.equal(host.fault.dropAction, null);
    const useAfterLost = await countRows(
      `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`,
      [sourceId],
    );
    const idempotencyAfterLost = await countRows(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`);
    host.fault.dropAction = "useVoluntary";
    const recovered = await cold(["readback", ...pins, "--secret-file", secrets.C, "--operation", "useVoluntary"]);
    assert.equal(host.fault.dropAction, "useVoluntary");
    host.fault.dropAction = null;
    assert.equal(recovered.status, 0);
    assert.equal(recovered.body?.ok, true);
    assert.equal(recovered.body?.artifactDigest, exported.value.artifactDigest);
    assert.equal(recovered.body?.paidWork, false);
    const useAfterReadback = await countRows(
      `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`,
      [sourceId],
    );
    const idempotencyAfterReadback = await countRows(`SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency`);
    assert.equal(useBefore, 0);
    assert.equal(useAfterLost, 1);
    assert.equal(useAfterReadback, 1);
    assert.equal(idempotencyAfterLost, idempotencyBefore + 1);
    assert.equal(idempotencyAfterReadback, idempotencyAfterLost);
    const storedDecision = (await host.query(
      `SELECT payload FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`,
      [sourceId],
    )).rows;
    assert.equal(storedDecision.length, 1);
    assert.equal(storedDecision[0].payload.decision, decision);
    assert.equal(String(storedDecision[0].payload.decision).includes("SYN-Y-441"), false);
    assert.equal(storedDecision[0].payload.verification, "authenticated_self_report");
    assert.equal(storedDecision[0].payload.paidWork, false);

    const withdrawn = must("withdraw", await act("A", "withdrawVoluntary", {
      taskId: sourceId, termsDigest: source.termsDigest, expectedRevision: source.revision,
      reason: "Synthetic requester A stops later retrieval before any re-grant.",
    }));
    assert.equal(withdrawn.state, "withdrawn");
    assert.equal(withdrawn.paidWork, false);
    const exportAfter = await readOut("export", "C", sourceId);
    const exportEAfter = await readOut("export", "E", sourceId);
    assert.equal(exportAfter.response.body?.code, "voluntary_withdrawn");
    assert.equal(exportEAfter.response.body?.code, "voluntary_withdrawn");
    const regrant = await act("A", "grantVoluntary", {
      taskId: sourceId, termsDigest: withdrawn.termsDigest, expectedRevision: withdrawn.revision,
      consumerId: JSON.parse(readFileSync(secrets.C, "utf8")).accountId,
    });
    assert.equal(regrant.body?.code, "voluntary_withdrawn");
    const secondWithdraw = await act("A", "withdrawVoluntary", {
      taskId: sourceId, termsDigest: withdrawn.termsDigest, expectedRevision: withdrawn.revision,
      reason: "Synthetic requester A repeats the stop after the refused re-grant.",
    });
    assert.equal(secondWithdraw.body?.code, "voluntary_withdrawn");
    const useAfter = await act("C", "useVoluntary", {
      taskId: sourceId, laterTaskId: later.taskId,
      artifactDigest: exported.value.artifactDigest,
      decision: "Synthetic requester C tries another handback after the refused re-grant.",
    });
    assert.equal(useAfter.body?.code, "voluntary_withdrawn");
    const consumers = await countRows(
      `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_voluntary_consumers WHERE task_id=$1`,
      [sourceId],
    );
    const useFinal = await countRows(
      `SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'`,
      [sourceId],
    );
    assert.equal(consumers, 0);
    assert.equal(useFinal, 1);
    const profileAfter = await host.request(PREFIX + "/v1/market/profile", { method: "GET" });
    assert.equal(profileAfter.body?.value?.signerAuthority, false);
    assert.equal(profileAfter.body?.value?.acceptedWork ?? null, null);
    const afterMoney = await host.financialSnapshot();
    assert.equal(JSON.stringify(beforeMoney), JSON.stringify(afterMoney));
    assert.equal(host.rpcMethods.some((name) => name.startsWith("eth_send") || name.includes("sign")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    await host.close();
  }
});
