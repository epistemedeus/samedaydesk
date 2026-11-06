import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { packDelivery } from "../src/pack.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const ATOMS = ["2000000", "100000", "1900000", "earnedDebtAtomic", "feeBps"];

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("a fresh extraction runs the composed command and the direct consumers", { timeout: 180000 }, () => {
  const packedPath = join(mkdtempSync(join(tmpdir(), "composed-pack-")), "composed-machine-delivery.tar.gz");
  const packed = packDelivery({ out: packedPath, root });
  assert.equal(packed.ok, true, packed.message);
  const listing = spawnSync("tar", ["-tzf", packedPath], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  const names = listing.stdout.split("\n").filter(Boolean);
  assert.equal(names.some((name) => name.startsWith("tools/composed-machine-delivery/receiving")), false);
  assert.equal(names.some((name) => name.startsWith("tools/composed-machine-delivery/dist/")), false);
  assert.equal(names.some((name) => name.startsWith("docs/receiving/h155030-sds-consumer-composition-20261106/")), true);
  assert.equal(names.some((name) => name.endsWith("TERMINAL.md")), false);
  assert.equal(names.some((name) => name.endsWith("N7-RECEIVING.md")), false);
  assert.equal(names.some((name) => name.includes("whole-effort-receipt.json")), false);
  assert.equal(names.includes("tools/composed-machine-delivery/examples/changed-request.json"), true);
  assert.equal(names.includes("tools/composed-machine-delivery/examples/retained-output.json"), true);
  assert.equal(names.includes("vendor/hosted-wallet-market/src/fee.mjs"), true);

  const dir = mkdtempSync(join(tmpdir(), "composed-cold-"));
  const extracted = spawnSync("tar", ["-xzf", packedPath, "-C", dir], { encoding: "utf8" });
  assert.equal(extracted.status, 0, extracted.stderr);
  const env = { ...process.env, HOME: dir };
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
    body.decisions.map((row) => [row.intentId, row.outcome]),
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
});
