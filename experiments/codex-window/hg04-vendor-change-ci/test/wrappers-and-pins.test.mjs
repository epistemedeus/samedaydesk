import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadPins, inTreeArchive, inTreePin } from "../lib/paths.mjs";
import { sha256File as kitSha } from "../lib/kit.mjs";
import { lastJson, ROOT, runNode, runPython, sha256File, tmpOut } from "./helpers.mjs";

test("released 1.4.0 in-tree archive matches pins.json", () => {
  const pins = loadPins();
  const archive = inTreeArchive(pins);
  const pinFile = inTreePin(pins);
  assert.equal(existsSync(archive), true);
  assert.equal(existsSync(pinFile), true);
  const bufHash = kitSha(archive);
  const pin = JSON.parse(readFileSync(pinFile, "utf8"));
  assert.equal(bufHash, pins.released.sha256);
  assert.equal(pin.sha256, pins.released.sha256);
  assert.equal(pin.bytes, pins.released.bytes);
  assert.equal(readFileSync(archive).length, pins.released.bytes);
  assert.equal(pins.released.sourceCommit, "ad9bc7b448cf1f635ff1488affbe206aaf981ac0");
  assert.equal(pins.honesty.autoUpdateBaselineOnFailure, false);
  assert.equal(pins.honesty.invoiceClaimWithoutUsage, false);
  assert.equal(pins.candidate.status, "draft-pr-not-deployed");
  assert.equal(pins.candidate.pr, 119);
  assert.equal(pins.candidate.sha256, "b365d95c8fb7695f96248433a7d440c9917b4d5085b1ce71b3982e4291e1bc3d");
  assert.equal(pins.candidate.bytes, 2575456);
  assert.ok(pins.released.urls.includes("https://samedaydesk.com/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz"));
  assert.ok(
    pins.released.urls.includes(
      "https://github.com/epistemedeus/samedaydesk/raw/ad9bc7b448cf1f635ff1488affbe206aaf981ac0/client/public/for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz",
    ),
  );
});

test("1.4.1 candidate is not the default obtain target", () => {
  const proc = runNode(["obtain", "--version", "1.4.1", "--dest", join(tmpOut("hg04-obt-"), "x.tar.gz")]);
  assert.equal(proc.status, 2);
  const body = lastJson(proc.stdout);
  assert.equal(body.code, "candidate-not-default");
});

test("python wrapper agrees with node on both fixtures", () => {
  const openaiOutN = tmpOut("hg04-py-oa-n-");
  const openaiOutP = tmpOut("hg04-py-oa-p-");
  const n1 = runNode(["run", "--fixture", "openai-gpt35-turbo-20230613-20240125", "--out-dir", openaiOutN]);
  const p1 = runPython(["run", "--fixture", "openai-gpt35-turbo-20230613-20240125", "--out-dir", openaiOutP]);
  assert.equal(n1.status, 0, n1.stderr + n1.stdout);
  assert.equal(p1.status, 0, p1.stderr + p1.stdout);
  const nr = lastJson(n1.stdout);
  const pr = lastJson(p1.stdout);
  assert.equal(pr.wrapperStatus, nr.wrapperStatus);
  assert.equal(pr.machineAction, nr.machineAction);
  assert.equal(pr.invoiceClaim, false);
  assert.equal(pr.updateBaseline, false);

  const hN = tmpOut("hg04-py-h-n-");
  const hP = tmpOut("hg04-py-h-p-");
  const n2 = runNode(["run", "--fixture", "hostile-partial-capture", "--out-dir", hN]);
  const p2 = runPython(["run", "--fixture", "hostile-partial-capture", "--out-dir", hP]);
  assert.equal(n2.status, 2);
  assert.equal(p2.status, 2);
  assert.equal(lastJson(n2.stdout).machineAction, "resolve-partial-capture");
  assert.equal(lastJson(p2.stdout).machineAction, "resolve-partial-capture");
  assert.equal(lastJson(p2.stdout).wrapperStatus, "partial");
});

test("local obtain of the in-tree 1.4.0 archive verifies pins", () => {
  const pins = loadPins();
  const dest = join(tmpOut("hg04-obt2-"), "useful-jobs-1.4.0.tar.gz");
  const proc = runNode(["obtain", "--version", "1.4.0", "--from", inTreeArchive(pins), "--dest", dest]);
  assert.equal(proc.status, 0, proc.stderr + proc.stdout);
  const body = lastJson(proc.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.sha256, pins.released.sha256);
  assert.equal(body.bytes, pins.released.bytes);
  assert.equal(sha256File(dest), pins.released.sha256);
  assert.equal(body.executed, false);
});
