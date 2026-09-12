import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BINDER_CONTRACT } from "../lib/contract.mjs";
import { freezeCurrentInputs } from "../lib/freeze.mjs";
import { extractKit, readJson, runBind, runNode, sha256File, writeJson } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OWNED = path.resolve(here, "..");

function mutateAfter(src, dest) {
  const doc = JSON.parse(fs.readFileSync(src, "utf8"));
  doc.rows = doc.rows.map((row) =>
    row.field === "gpt-4.1-input" ? { ...row, value: 4 } : row,
  );
  writeJson(dest, doc);
}

function firstTicket(work) {
  const kit = extractKit();
  const firstOut = path.join(work, "first");
  fs.mkdirSync(firstOut, { recursive: true });
  const recorded = runNode(
    kit.usefulJobsCli,
    [
      "run",
      "repeat-job-record",
      "--next-run",
      path.join(kit.usefulJobsRoot, "samples/repeat/a/next-run.json"),
      "--out-dir",
      firstOut,
    ],
    { cwd: kit.usefulJobsRoot },
  );
  assert.equal(recorded.json.ok, true, recorded.stdout);
  const before = path.join(work, "before.json");
  const after = path.join(work, "after.json");
  fs.copyFileSync(path.join(kit.usefulJobsRoot, "samples/pricing/a/before.json"), before);
  mutateAfter(path.join(kit.usefulJobsRoot, "samples/pricing/a/after.json"), after);
  return {
    kit,
    firstOut,
    ticket: path.join(firstOut, "repeat-job.json"),
    before,
    after,
    newSha: sha256File(after),
    firstAfterSha: readJson(path.join(firstOut, "repeat-job.json")).repeatJob.inputs.verifiedDigests.after
      .sha256,
  };
}

test("contract export names frozen refs and transport/analysis split", () => {
  assert.equal(BINDER_CONTRACT.id, "W5-D09");
  assert.equal(BINDER_CONTRACT.schema, "w5.repeat-job-binder.second-run.v1");
  assert.equal(BINDER_CONTRACT.d01Binding.pinSha, "aeef964fa188443078958d9d6d393afae1d542ee");
  assert.ok(BINDER_CONTRACT.refuseCodes.includes("previous-output-reused"));
});

test("frozen copy is independent of later source mutation", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w5-d09-freeze-"));
  const src = path.join(work, "after.json");
  fs.writeFileSync(src, '{"n":1}\n');
  const sha = sha256File(src);
  const frozen = freezeCurrentInputs({
    verifiedInputs: {
      before: null,
      used: null,
      after: { state: "verified", actual: { path: src, bytes: 8, sha256: sha } },
    },
    destDir: path.join(work, "frozen-current"),
  });
  fs.writeFileSync(src, '{"tampered":true}\n');
  assert.equal(sha256File(frozen.after.frozenPath), sha);
  assert.notEqual(sha256File(src), sha);
});

test("CLI: changed after is analyzed from frozen-current, not the live path", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w5-d09-cli-freeze-"));
  const ctx = firstTicket(work);
  const out = path.join(work, "second");
  const bound = runBind([
    "--ticket",
    ctx.ticket,
    "--before",
    ctx.before,
    "--after",
    ctx.after,
    "--declare-after-sha256",
    ctx.newSha,
    "--engine",
    "catalog",
    "--out-dir",
    out,
  ]);
  assert.equal(bound.json.ok, true, bound.stdout);
  assert.equal(bound.json.status, "actionable");
  assert.equal(bound.json.analysisOutcome, "completed");
  assert.equal(bound.json.transport.ok, true);
  const second = readJson(path.join(out, "second-run.json"));
  const frozenAfter = second.frozen.current.after.frozenPath;
  assert.equal(fs.existsSync(frozenAfter), true);
  assert.equal(sha256File(frozenAfter), ctx.newSha);
  fs.writeFileSync(ctx.after, '{"tampered-after-bind":true}\n');
  assert.equal(sha256File(frozenAfter), ctx.newSha);
  assert.ok(second.secondRun.engine.argv.includes(frozenAfter));
  assert.equal(fs.existsSync(path.join(out, "engine/budget-impact.json")), true);
  const art = readJson(path.join(out, "engine/budget-impact.json"));
  assert.notEqual(art.status, "refused");
});

test("CLI: previous-run output cannot be reused as the new after", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w5-d09-prevout-"));
  const ctx = firstTicket(work);
  const prev = ctx.ticket;
  const r = runBind(
    [
      "--ticket",
      ctx.ticket,
      "--before",
      ctx.before,
      "--after",
      prev,
      "--declare-after-sha256",
      sha256File(prev),
      "--out-dir",
      path.join(work, "second"),
    ],
    { expectStatus: 2 },
  );
  assert.equal(r.json.ok, false);
  assert.equal(r.json.refused, true);
  assert.equal(r.json.code, "previous-output-reused");
});

test("CLI: reused first-run out-dir is refused", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w5-d09-reuse-"));
  const ctx = firstTicket(work);
  const r = runBind(
    [
      "--ticket",
      ctx.ticket,
      "--before",
      ctx.before,
      "--after",
      ctx.after,
      "--declare-after-sha256",
      ctx.newSha,
      "--out-dir",
      ctx.firstOut,
    ],
    { expectStatus: 2 },
  );
  assert.equal(r.json.code, "reused-output-path");
});

test("CLI: nonzero catalog JSON that looks successful is a transport failure", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w5-d09-nonzero-"));
  const ctx = firstTicket(work);
  const fakeRoot = path.join(OWNED, "fixtures/nonzero-engine");
  const r = runBind(
    [
      "--ticket",
      ctx.ticket,
      "--before",
      ctx.before,
      "--after",
      ctx.after,
      "--declare-after-sha256",
      ctx.newSha,
      "--engine",
      "catalog",
      "--useful-jobs-root",
      fakeRoot,
      "--record-repeat-bin",
      ctx.kit.recordRepeatBin,
      "--out-dir",
      path.join(work, "second"),
    ],
    { expectStatus: 2 },
  );
  assert.equal(r.json.code, "nonzero-engine-exit");
  assert.equal(r.json.ok, false);
});

test("CLI: valid analysis-refused is delivered, not a crash and not actionable", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w5-d09-refuse-"));
  const ctx = firstTicket(work);
  const garbage = path.join(work, "garbage-after.json");
  fs.writeFileSync(garbage, '{"not":"a-pricing-table"}\n');
  const sha = sha256File(garbage);
  const out = path.join(work, "second");
  const r = runBind([
    "--ticket",
    ctx.ticket,
    "--before",
    ctx.before,
    "--after",
    garbage,
    "--declare-after-sha256",
    sha,
    "--engine",
    "catalog",
    "--out-dir",
    out,
  ]);
  assert.equal(r.json.ok, true, r.stdout);
  assert.equal(r.json.status, "analysis-refused");
  assert.equal(r.json.analysisOutcome, "refused");
  assert.equal(r.json.transport.ok, true);
  const second = readJson(path.join(out, "second-run.json"));
  assert.equal(second.status, "analysis-refused");
  assert.equal(fs.existsSync(path.join(out, "engine/budget-impact.json")), true);
});

test("CLI: changed after that is domain-identical to before is valid no-change analysis", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "w5-d09-nochange-"));
  const ctx = firstTicket(work);
  const sameAsBefore = path.join(work, "after-is-before.json");
  fs.copyFileSync(ctx.before, sameAsBefore);
  const sha = sha256File(sameAsBefore);
  assert.notEqual(sha, ctx.firstAfterSha);
  const out = path.join(work, "second");
  const r = runBind([
    "--ticket",
    ctx.ticket,
    "--before",
    ctx.before,
    "--after",
    sameAsBefore,
    "--declare-after-sha256",
    sha,
    "--engine",
    "catalog",
    "--out-dir",
    out,
  ]);
  assert.equal(r.json.ok, true, r.stdout);
  assert.equal(r.json.status, "analysis-no-change");
  assert.equal(r.json.analysisOutcome, "no-change");
  assert.equal(r.json.transport.ok, true);
  assert.equal(r.json.distinctFromFirst, true);
});
