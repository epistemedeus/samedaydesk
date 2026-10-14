import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listenLocal } from "../src/http.mjs";
import { runMaintenanceOccurrence } from "../src/occurrence.mjs";
import { packageRoot, request } from "./support.mjs";

const cli = join(packageRoot, "cli.mjs");
const fixtureRequest = join(packageRoot, "fixtures/request-repair-accept.json");

test("CLI and HTTP return the same occurrence JSON", async () => {
  const body = request();
  const direct = await runMaintenanceOccurrence(body);
  const cliRun = spawnSync(process.execPath, [cli, "run", "--request", fixtureRequest], {
    encoding: "utf8",
  });
  assert.equal(cliRun.status, 0, cliRun.stderr);
  const cliJson = JSON.parse(cliRun.stdout);
  assert.equal(cliJson.digest, direct.digest);
  assert.equal(cliJson.acceptance, direct.acceptance);
  assert.equal(cliJson.disposition, direct.disposition);
  assert.equal(cliJson.economics.feeAtoms, direct.economics.feeAtoms);

  const server = await listenLocal();
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/occurrence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    const httpJson = await response.json();
    assert.equal(httpJson.digest, direct.digest);
    assert.equal(httpJson.acceptance, "accepted");
    assert.equal(httpJson.httpStatusIsNotUsefulWork, true);
    assert.equal(httpJson.serving.publicEnabled, false);
    assert.equal(httpJson.serving.productionMoney, false);

    const refused = await fetch(`http://127.0.0.1:${port}/occurrence`, { method: "GET" });
    assert.equal(refused.status, 405);
    const methodJson = await refused.json();
    assert.equal(methodJson.code, "method_refused");
    assert.equal(methodJson.acceptance, "refused");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("CLI opt-in writes an observation and refuses a write without opt-in", () => {
  const dir = mkdtempSync(join(tmpdir(), "ae14-e11-out-"));
  const out = join(dir, "observation.json");
  const refused = spawnSync(process.execPath, [cli, "run", "--request", fixtureRequest, "--out", out], {
    encoding: "utf8",
  });
  assert.equal(refused.status, 1);
  const exported = spawnSync(process.execPath, [
    cli, "run", "--request", fixtureRequest, "--opt-in", "--out", out,
  ], { encoding: "utf8" });
  assert.equal(exported.status, 0, exported.stderr);
  const observation = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(observation.execute, false);
  assert.equal(observation.schema, "neomorphic.task-memory.observation.v1");
  const echoed = JSON.parse(exported.stdout);
  assert.equal(echoed.reuse.granted, false);
});
