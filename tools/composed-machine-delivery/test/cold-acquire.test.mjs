import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { packDelivery } from "../src/pack.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const ATOMS = ["2000000", "100000", "1900000", "earnedDebtAtomic", "feeBps"];

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("a fresh extraction runs the composed command and the direct consumers", { timeout: 180000 }, (t) => {
  const temp = mkdtempSync(join(tmpdir(), "composed-cold-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const packedPath = join(temp, "composed-machine-delivery.tar.gz");
  const packed = packDelivery({ out: packedPath, root });
  assert.equal(packed.ok, true, packed.message);
  const listing = spawnSync("tar", ["-tzf", packedPath], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  const names = listing.stdout.trimEnd().split("\n");
  const allowlist = readFileSync(new URL("../archive-files.txt", import.meta.url), "utf8").trimEnd().split("\n");
  assert.deepEqual(names, allowlist);
  assert.equal(names.length, new Set(names).size);
  for (const name of names) {
    assert.doesNotMatch(name, /(?:^|\/)(?:docs|receiving|node_modules|dist|server|\.git|\.env)(?:\/|$)|receiving|terminal|whole-effort-receipt|private-control/i);
  }
  assert.ok(names.includes("tools/composed-machine-delivery/examples/changed-request.json"));
  assert.ok(names.includes("tools/composed-machine-delivery/examples/retained-output.json"));
  assert.ok(names.includes("tools/workflow-owned-extensions/package-lock.json"));
  assert.ok(names.includes("vendor/hosted-wallet-market/src/fee.mjs"));

  const dir = join(temp, "install");
  mkdirSync(dir);
  const extracted = spawnSync("tar", ["-xzf", packedPath, "-C", dir], { encoding: "utf8" });
  assert.equal(extracted.status, 0, extracted.stderr);
  const extractedFiles = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory());
  assert.ok(extractedFiles.every((entry) => entry.isFile()));
  assert.deepEqual(
    extractedFiles.map((entry) => relative(dir, join(entry.parentPath, entry.name))).sort(),
    [...allowlist].sort(),
  );
  const localNote = join(dir, "tools/workflow-owned-extensions/src/local-operator-note.json");
  writeJson(localNote, { sentinel: "excluded" });
  const repackPath = join(temp, "repack.tar.gz");
  const repack = packDelivery({ out: repackPath, root: dir });
  assert.equal(repack.ok, true, repack.message);
  assert.deepEqual(readFileSync(repackPath), readFileSync(packedPath));
  unlinkSync(localNote);

  const env = {
    PATH: process.env.PATH,
    HOME: temp,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    TMPDIR: temp,
  };
  const store = join(dir, "caller-store");
  const out = join(dir, "public.json");
  const deliver = spawnSync(process.execPath, [
    "tools/composed-machine-delivery/cli.mjs",
    "deliver",
    "--request",
    "tools/composed-machine-delivery/examples/changed-request.json",
    "--store",
    store,
    "--out",
    out,
  ], { cwd: dir, env, encoding: "utf8" });
  assert.equal(deliver.status, 0, deliver.stderr || deliver.stdout);
  const body = JSON.parse(deliver.stdout);
  const frozen = JSON.parse(readFileSync(join(dir, "tools/composed-machine-delivery/examples/retained-output.json"), "utf8"));
  assert.deepEqual(body, frozen);
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), frozen);
  const publicText = `${deliver.stdout}\n${readFileSync(out, "utf8")}`;
  for (const atom of ATOMS) assert.equal(publicText.includes(atom), false, atom);
  assert.equal(body.work.accepted, true);
  assert.equal(body.extension.acquired, true);
  assert.equal(body.extension.directObservationMatches, true);
  assert.equal(body.capture.transferred, true);

  const shown = spawnSync(process.execPath, [
    "tools/composed-machine-delivery/cli.mjs",
    "show",
    "--store",
    store,
  ], { cwd: dir, env, encoding: "utf8" });
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).work.taskId, "owned-example-page");
  for (const atom of ATOMS) assert.equal(shown.stdout.includes(atom), false, atom);

  const request = JSON.parse(readFileSync(join(dir, "tools/composed-machine-delivery/examples/changed-request.json"), "utf8"));
  const newTitle = "Harbor Library hours updated";
  const newDigest = `sha256:${createHash("sha256").update(newTitle).digest("hex")}`;
  request.capture.captureId = "consumer-fresh-capture";
  Object.assign(request.capture.payload, { title: newTitle, contentHash: newDigest });
  request.schedule.scope.source.captureId = request.capture.captureId;
  Object.assign(request.extension.input, { title: newTitle, contentHash: newDigest });
  request.work.artifact.heading = newTitle;
  request.work.taskId = "consumer-fresh-task";
  const newRequest = join(temp, "request.json");
  const newStore = join(temp, "store");
  writeJson(newRequest, request);
  const composed = (args) => spawnSync(process.execPath, ["tools/composed-machine-delivery/cli.mjs", ...args], {
    cwd: dir, env, encoding: "utf8",
  });
  const fresh = composed(["deliver", "--request", newRequest, "--store", newStore]);
  assert.equal(fresh.status, 0, fresh.stderr);
  const computed = JSON.parse(fresh.stdout);
  assert.equal(computed.capture.captureId, "consumer-fresh-capture");
  assert.notEqual(computed.capture.digest, body.capture.digest);
  assert.notEqual(computed.extension.observationDigest, body.extension.observationDigest);
  assert.deepEqual(computed.decisions[0].changedFields, ["title"]);
  assert.equal(computed.work.taskId, "consumer-fresh-task");
  assert.equal(computed.work.accepted, true);

  const replay = composed(["deliver", "--request", newRequest, "--store", newStore]);
  assert.equal(replay.status, 0, replay.stderr);
  assert.deepEqual(JSON.parse(replay.stdout), { ...computed, duplicateEffect: "replay" });
  const conflict = composed(["deliver", "--request", newRequest, "--store", store]);
  assert.equal(conflict.status, 1);
  assert.equal(JSON.parse(conflict.stderr).reason, "delivery_effect_conflict");
  unlinkSync(join(newStore, "capture.json"));
  const recovered = composed(["recover", "--store", newStore]);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(JSON.parse(recovered.stdout).source, "recovery");
  const shownAfterRecovery = composed(["show", "--store", newStore]);
  assert.equal(shownAfterRecovery.status, 0, shownAfterRecovery.stderr);
  assert.deepEqual(JSON.parse(shownAfterRecovery.stdout), computed);

  const inputDir = join(dir, "direct-input");
  mkdirSync(inputDir, { recursive: true });
  writeJson(join(inputDir, "capture.json"), request.capture);
  writeJson(join(inputDir, "intents.json"), {
    schema: "samedaydesk.recurring-decision-intents.v1",
    intents: request.intents,
  });
  writeJson(join(inputDir, "priors.json"), request.priors);
  writeJson(join(inputDir, "schedule.json"), request.schedule);
  writeJson(join(inputDir, "page.json"), request.extension.input);
  const recur = spawnSync(process.execPath, [
    "tools/recurring-decision-consumer/cli.mjs",
    "recur",
    "--capture",
    join(inputDir, "capture.json"),
    "--intents",
    join(inputDir, "intents.json"),
    "--priors",
    join(inputDir, "priors.json"),
    "--schedule",
    join(inputDir, "schedule.json"),
    "--clock",
    request.clock,
    "--horizon",
    String(request.horizonHours),
  ], { cwd: dir, env, encoding: "utf8" });
  assert.equal(recur.status, 0, recur.stderr || recur.stdout);
  const recurred = JSON.parse(recur.stdout);
  assert.deepEqual(
    recurred.decisions.map((row) => [row.intentId, row.result.outcome]),
    computed.decisions.map((row) => [row.intentId, row.outcome]),
  );

  const preview = spawnSync(process.execPath, [
    "tools/result-reuse/cli.mjs",
    "preview",
    "--input",
    join(inputDir, "page.json"),
    "--task-id",
    "example-page",
    "--subject",
    "example-page",
    "--sequence",
    "1",
    "--clock",
    request.clock,
  ], { cwd: dir, env, encoding: "utf8" });
  assert.equal(preview.status, 0, preview.stderr || preview.stdout);
  assert.equal(JSON.parse(preview.stdout).ok, true);

  const fitting = spawnSync(process.execPath, [
    "tools/task-repeat-use/cli.mjs",
    "walk",
    "--case",
    "fitting",
  ], { cwd: dir, env, encoding: "utf8" });
  assert.equal(fitting.status, 0, fitting.stderr || fitting.stdout);
  const fittingBody = JSON.parse(fitting.stdout);
  assert.equal(fittingBody.independentReuse, true);
  assert.equal(fittingBody.coverage.aglInstalledAtReceiving, null);
  assert.equal(fittingBody.charged, false);
  assert.equal(fittingBody.originalTerms.changed, false);

  const nonfitting = spawnSync(process.execPath, [
    "tools/task-repeat-use/cli.mjs",
    "walk",
    "--case",
    "nonfitting-capture",
  ], { cwd: dir, env, encoding: "utf8" });
  assert.equal(nonfitting.status, 0, nonfitting.stderr || nonfitting.stdout);
  const nonfittingBody = JSON.parse(nonfitting.stdout);
  assert.equal(nonfittingBody.fitting, false);
  assert.equal(nonfittingBody.independentReuse, false);
  assert.equal(nonfittingBody.directAlternative.path, "competent_direct_execution");

  const coverage = spawnSync(process.execPath, ["tools/task-repeat-use/cli.mjs", "coverage"], {
    cwd: dir, env, encoding: "utf8",
  });
  assert.equal(coverage.status, 0, coverage.stderr);
  assert.equal(JSON.parse(coverage.stdout).agl.receivingEvidence, "excluded_from_consumer_archive");

  const member = join(dir, "tools/task-repeat-use/src/coverage.mjs");
  unlinkSync(member);
  symlinkSync(join(root, "tools/task-repeat-use/src/coverage.mjs"), member);
  const refused = packDelivery({ out: repackPath, root: dir });
  assert.equal(refused.ok, false);
  assert.match(refused.message, /must be a regular file/);
  assert.deepEqual(readFileSync(repackPath), readFileSync(packedPath));
});
