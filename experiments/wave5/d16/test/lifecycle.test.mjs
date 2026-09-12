import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { LIFECYCLE_KINDS, PINNED_IMPLEMENTATION } from "../src/contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const owned = join(here, "..");
const repo = join(owned, "../../..");
const harness = join(owned, "bin/lifecycle-harness.mjs");
const wrapperCli = join(repo, "server/paid-useful-jobs/bin/cli.mjs");
const engineLib = join(repo, "server/paid-useful-jobs/lib/engine.mjs");

function runHarness(args, timeoutMs = 90_000) {
  return spawnSync(process.execPath, [harness, ...args], {
    encoding: "utf8",
    cwd: repo,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parse(r) {
  assert.equal(r.error, undefined, r.stderr || r.error?.message);
  assert.ok(r.stdout, `empty stdout; stderr=${r.stderr}`);
  return JSON.parse(r.stdout);
}

function runCase(id) {
  const r = runHarness(["case", id]);
  const body = parse(r);
  assert.equal(body.caseId, id, r.stderr);
  assert.equal(body.pinnedImplementation.sha, PINNED_IMPLEMENTATION.sha);
  return { spawn: r, body };
}

describe("W5-D16 engine lifecycle harness", { timeout: 120_000 }, () => {
  it("requires the pinned wrapper CLI and engine module", () => {
    assert.equal(existsSync(wrapperCli), true, "missing server/paid-useful-jobs/bin/cli.mjs");
    assert.equal(existsSync(engineLib), true, "missing server/paid-useful-jobs/lib/engine.mjs");
  });

  it("positive wrapper CLI succeeds with usable outputs", () => {
    const { spawn, body } = runCase("positive");
    assert.equal(spawn.status, 0, spawn.stderr);
    assert.equal(body.via, "wrapper-cli");
    assert.equal(body.wrapper.ok, true, JSON.stringify(body.wrapper));
    assert.equal(body.wrapper.sold, false);
    assert.equal(body.wrapper.outputs.length, 2);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.ENGINE_RAN);
    assert.equal(body.classification.accepted, true);
    assert.equal(body.classification.hiddenByWrapperSuccess, false);
    assert.equal(body.cliExit, 0);
  });

  it("stub ok:true with no outputs is not accepted even if the wrapper returns ok", () => {
    const { body } = runCase("stub-ok-true-no-outputs");
    assert.equal(body.wrapper.sold, false);
    assert.equal(body.classification.accepted, false);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.HIDDEN_BY_WRAPPER);
    assert.equal(body.classification.hiddenByWrapperSuccess, body.wrapper.ok === true);
  });

  it("sliced decoy JSON cannot be accepted as engine success", () => {
    const { body } = runCase("decoy-json");
    assert.equal(body.classification.accepted, false);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.INVALID_JSON);
    assert.equal(body.wrapper?.sold, false);
  });

  it("nonzero engine exit is wrapper failure, not success", () => {
    const { body } = runCase("nonzero-exit");
    assert.equal(body.wrapper.ok, false);
    assert.equal(body.wrapper.sold, false);
    assert.equal(body.engineStatus, 7);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.NONZERO_EXIT);
    assert.equal(body.classification.accepted, false);
  });

  it("invalid JSON stdout is refused", () => {
    const { body } = runCase("invalid-json");
    assert.equal(body.wrapper.ok, false);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.INVALID_JSON);
    assert.equal(body.classification.accepted, false);
  });

  it("empty engine stdout is missing JSON, not success", () => {
    const { body } = runCase("empty-stdout");
    assert.equal(body.wrapper.ok, false);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.MISSING_JSON);
    assert.equal(body.classification.accepted, false);
  });

  it("engine ok:false JSON is a refused engine result, not wrapper success", () => {
    const { body } = runCase("ok-false-json");
    assert.equal(body.wrapper.ok, false);
    assert.equal(body.wrapper.sold, false);
    assert.equal(body.wrapper.code, "missing-required-inputs");
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.ENGINE_REFUSED_JSON);
    assert.equal(body.classification.accepted, false);
  });

  it("stderr-only JSON is not treated as success", () => {
    const { body } = runCase("stderr-json");
    assert.equal(body.wrapper.ok, false);
    assert.equal(body.classification.accepted, false);
    assert.notEqual(body.classification.kind, LIFECYCLE_KINDS.ENGINE_RAN);
  });

  it("missing CLI (path is a directory) cannot start the engine", () => {
    const { body } = runCase("cli-is-directory");
    assert.equal(body.wrapper.ok, false);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.START_FAILURE);
    assert.equal(body.classification.accepted, false);
  });

  it("kit install failure throws before a wrapper success JSON", () => {
    const { spawn, body } = runCase("install-cache-is-file");
    assert.equal(body.wrapper, null);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.INSTALL_FAILURE);
    assert.equal(body.classification.accepted, false);
    assert.notEqual(body.cliExit, 0);
    assert.match(String(body.stderr || ""), /EEXIST|mkdir/);
    assert.equal(spawn.status, 0);
  });

  it("runEngineJob timeout is not wrapper success and does not wait the default 120s", () => {
    const { body } = runCase("engine-timeout");
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.TIMEOUT);
    assert.equal(body.classification.accepted, false);
    assert.equal(body.engineStatus, null);
    assert.ok(body.elapsedMs < 5_000, `timeout took ${body.elapsedMs}ms`);
  });

  it("hanging wrapper CLI does not emit success JSON", () => {
    const { body } = runCase("wrapper-cli-hang");
    assert.equal(body.wrapper, null);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.TIMEOUT);
    assert.equal(body.classification.accepted, false);
  });

  it("engine timeout leaves a grandchild under the current pin, then the harness kills it", () => {
    const { body } = runCase("grandchild-timeout-orphan");
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.TIMEOUT);
    assert.equal(body.classification.accepted, false);
    assert.equal(body.orphanPidFilePresent, true);
    assert.ok(body.killed.length >= 1);
  });

  it("deleted extracted CLI is restored from the archive and can still succeed", () => {
    const { body } = runCase("delete-cli-reextract");
    assert.equal(body.cliRestored, true);
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.ENGINE_RAN);
    assert.equal(body.classification.accepted, true);
    assert.equal(body.wrapper.ok, true);
  });

  it("domain status refused is an engine-ran outcome, not an install/start/timeout/exit failure", () => {
    const { body } = runCase("domain-refused");
    assert.equal(body.wrapper.ok, true);
    assert.equal(body.wrapper.sold, false);
    assert.equal(body.engineJson.ok, true);
    assert.equal(body.engineJson.status, "refused");
    assert.equal(body.classification.kind, LIFECYCLE_KINDS.ENGINE_RAN);
    assert.equal(body.classification.accepted, true);
    assert.equal(body.classification.domainOutcome, "refused");
  });

  it("harness test gate passes: positive engine runs, broken engines are not accepted", () => {
    const r = runHarness(["test"], 120_000);
    const body = parse(r);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.results.length, 15);
    const byId = Object.fromEntries(body.results.map((row) => [row.caseId, row]));
    assert.equal(byId.positive.accepted, true);
    assert.equal(byId["stub-ok-true-no-outputs"].accepted, false);
    assert.equal(byId["stub-ok-true-no-outputs"].hiddenByWrapperSuccess, true);
    assert.equal(byId["domain-refused"].domainOutcome, "refused");
    assert.equal(byId["domain-refused"].accepted, true);
    for (const row of body.results) {
      assert.equal(row.sold, false);
    }
  });
});
