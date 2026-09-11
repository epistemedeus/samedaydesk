import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { cacheRoot } from "../../../../server/paid-useful-jobs/lib/engine.mjs";
import { USEFUL_JOBS_ARCHIVE_PATH } from "../../../../server/paid-useful-jobs/lib/pins.mjs";
import { OUTCOMES, SCHEMA } from "../src/classify.mjs";
import { REPO_ROOT } from "../src/run-wrapper-cli.mjs";
import {
  budgetAfter,
  budgetBefore,
  feedAfter,
  feedBefore,
  htmlRefuse,
  oaBefore,
  oaUnusedOnly,
  oaUsed,
  oaUsedRemoved,
  runJob,
  writeEvidenceBadSchema,
  writeEvidenceFail,
  writeNoteOnlyAfter,
  writeRepeatDigestMismatch,
} from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const classifyBin = join(here, "../bin/classify-domain-outcome.mjs");

function work(name) {
  return mkdtempSync(join(tmpdir(), `w5-d17-${name}-`));
}

describe("W5-D17 domain-outcome CLI contract", { timeout: 180_000 }, () => {
  it("pricing field change is analysis_change, not wrapper refusal", () => {
    const outDir = work("change");
    const { result, classified } = runJob(
      "vendor-budget-impact",
      ["--before", budgetBefore, "--after", budgetAfter],
      outDir,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.body.ok, true);
    assert.equal(classified.schema, SCHEMA);
    assert.equal(classified.outcome, OUTCOMES.ANALYSIS_CHANGE);
    assert.equal(classified.engineStatus, "actionable");
    assert.equal(classified.layers.analysis, "change");
    assert.equal(classified.layers.engine, "ok");
    assert.equal(classified.layers.delivery, "complete");
    assert.equal(classified.layers.transport, "ok");
    assert.notEqual(classified.outcome, OUTCOMES.ENGINE_FAILURE);
    assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
    assert.equal(existsSync(join(outDir, "budget-impact.md")), true);
  });

  it("identical pricing pair is analysis_no_change and CLI exit 0", () => {
    const outDir = work("ident");
    const { result, classified } = runJob(
      "vendor-budget-impact",
      ["--before", budgetBefore, "--after", budgetBefore],
      outDir,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.body.ok, true);
    assert.equal(classified.outcome, OUTCOMES.ANALYSIS_NO_CHANGE);
    assert.equal(classified.engineStatus, "informational");
    assert.equal(classified.wrapperOk, true);
    assert.equal(classified.wrapperRefused, false);
  });

  it("unrelated note-only edit stays no-change and does not share the identical-pair digest", () => {
    const identDir = work("ident2");
    const noteDir = work("note");
    const noteAfter = join(noteDir, "after-note-only.json");
    writeNoteOnlyAfter(noteAfter);
    const ident = runJob("vendor-budget-impact", ["--before", budgetBefore, "--after", budgetBefore], identDir);
    const note = runJob("vendor-budget-impact", ["--before", budgetBefore, "--after", noteAfter], noteDir);
    assert.equal(ident.classified.outcome, OUTCOMES.ANALYSIS_NO_CHANGE);
    assert.equal(note.classified.outcome, OUTCOMES.ANALYSIS_NO_CHANGE);
    assert.equal(ident.classified.engineStatus, "informational");
    assert.equal(note.classified.engineStatus, "informational");
    assert.notEqual(ident.classified.engineDigest, note.classified.engineDigest);
    assert.match(ident.classified.engineDigest, /^[0-9a-f]+$/);
    assert.match(note.classified.engineDigest, /^[0-9a-f]+$/);
  });

  it("feed agenda change vs identical pair stay distinct analysis outcomes", () => {
    const change = runJob("feed-agenda", ["--before", feedBefore, "--after", feedAfter], work("feed-c"));
    const none = runJob("feed-agenda", ["--before", feedBefore, "--after", feedBefore], work("feed-n"));
    assert.equal(change.classified.outcome, OUTCOMES.ANALYSIS_CHANGE);
    assert.equal(none.classified.outcome, OUTCOMES.ANALYSIS_NO_CHANGE);
    assert.equal(change.result.body.ok, none.result.body.ok);
    assert.equal(change.result.body.ok, true);
    assert.notEqual(change.classified.engineDigest, none.classified.engineDigest);
  });

  it("used-op removal is change; unused-path-only edit is no-change", () => {
    const change = runJob(
      "api-upgrade-brief",
      ["--before", oaBefore, "--after", oaUsedRemoved, "--used", oaUsed],
      work("oa-c"),
    );
    const scoped = runJob(
      "api-upgrade-brief",
      ["--before", oaBefore, "--after", oaUnusedOnly, "--used", oaUsed],
      work("oa-n"),
    );
    assert.equal(change.classified.outcome, OUTCOMES.ANALYSIS_CHANGE, change.result.stderr + change.result.stdout);
    assert.equal(scoped.classified.outcome, OUTCOMES.ANALYSIS_NO_CHANGE);
    assert.equal(change.result.body.engine.status, "actionable");
    assert.equal(scoped.result.body.engine.status, "informational");
  });

  it("delivered HTML pricing refusal is analysis_refusal, not engine or transport failure", () => {
    const outDir = work("html");
    const { result, classified } = runJob(
      "vendor-budget-impact",
      ["--before", htmlRefuse, "--after", budgetAfter],
      outDir,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.engine.status, "refused");
    assert.equal(result.body.receipt.engineResult.refused, false);
    assert.equal(classified.outcome, OUTCOMES.ANALYSIS_REFUSAL);
    assert.equal(classified.layers.analysis, "refusal");
    assert.equal(classified.layers.engine, "ok");
    assert.equal(classified.layers.delivery, "complete");
    assert.notEqual(classified.outcome, OUTCOMES.ENGINE_FAILURE);
    assert.notEqual(classified.outcome, OUTCOMES.TRANSPORT_FAILURE);
    assert.equal(classified.receiptRefused, false);
    assert.equal(existsSync(join(outDir, "budget-impact.json")), true);
  });

  it("schema-compatible evidence fail delivers analysis_refusal with artifacts", () => {
    const dir = work("ev-fail");
    const input = writeEvidenceFail(join(dir, "fail.json"));
    const { result, classified } = runJob("evidence-ci-annotation", ["--input", input], join(dir, "out"));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(classified.outcome, OUTCOMES.ANALYSIS_REFUSAL);
    assert.equal(classified.engineStatus, "refused");
    assert.equal(result.body.ok, true);
    assert.equal(classified.deliveredOutputs.includes("annotations.json"), true);
  });

  it("unsupported evidence schema is engine_failure with no analysis artifacts", () => {
    const dir = work("ev-bad");
    const input = writeEvidenceBadSchema(join(dir, "bad.json"));
    const { result, classified } = runJob("evidence-ci-annotation", ["--input", input], join(dir, "out"));
    assert.equal(result.status, 2);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.refused, true);
    assert.equal(result.body.code, "unsupported-evidence-schema");
    assert.equal(classified.outcome, OUTCOMES.ENGINE_FAILURE);
    assert.equal(classified.layers.delivery, "none");
    assert.notEqual(classified.outcome, OUTCOMES.ANALYSIS_REFUSAL);
  });

  it("repeat digest mismatch refuses at the engine without a delivered analysis report", () => {
    const dir = work("mismatch");
    const { nextRun, inputRoot } = writeRepeatDigestMismatch(dir);
    const { result, classified } = runJob(
      "repeat-job-record",
      ["--next-run", nextRun, "--input-root", inputRoot],
      join(dir, "out"),
    );
    assert.equal(result.status, 2);
    assert.equal(result.body.code, "input-digest-mismatch");
    assert.equal(classified.outcome, OUTCOMES.ENGINE_FAILURE);
    assert.equal(classified.deliveredOutputs.length, 0);
    assert.notEqual(classified.outcome, OUTCOMES.ANALYSIS_REFUSAL);
    assert.notEqual(classified.outcome, OUTCOMES.ANALYSIS_CHANGE);
  });

  it("unknown job and missing inputs are wrapper_refusal, distinct from analysis_refusal", () => {
    const unknown = runJob("not-a-real-job", []);
    assert.equal(unknown.result.status, 2);
    assert.equal(unknown.result.body.code, "unknown-job");
    assert.equal(unknown.classified.outcome, OUTCOMES.WRAPPER_REFUSAL);
    assert.equal(unknown.classified.layers.engine, "not-run");

    const missing = runJob("api-upgrade-brief", ["--before", budgetBefore]);
    assert.equal(missing.result.body.code, "missing-required-inputs");
    assert.equal(missing.classified.outcome, OUTCOMES.WRAPPER_REFUSAL);
    assert.notEqual(missing.classified.outcome, OUTCOMES.ANALYSIS_REFUSAL);
  });

  it("reused outDir after deleting one catalog file is incomplete_delivery, not no-change", () => {
    const outDir = work("stale");
    const first = runJob("vendor-budget-impact", ["--before", budgetBefore, "--after", budgetAfter], outDir);
    assert.equal(first.classified.outcome, OUTCOMES.ANALYSIS_CHANGE);
    rmSync(join(outDir, "budget-impact.md"));
    const noteAfter = join(outDir, "after-note-only.json");
    writeNoteOnlyAfter(noteAfter);
    const second = runJob("vendor-budget-impact", ["--before", budgetBefore, "--after", noteAfter], outDir);
    assert.equal(second.result.status, 0, second.result.stderr);
    assert.equal(second.result.body.ok, true);
    assert.equal(second.result.body.engine.status, "informational");
    assert.equal(second.result.body.outputs.length, 1);
    assert.equal(second.classified.outcome, OUTCOMES.INCOMPLETE_DELIVERY);
    assert.equal(second.classified.layers.delivery, "incomplete");
    assert.notEqual(second.classified.outcome, OUTCOMES.ANALYSIS_NO_CHANGE);
    assert.notEqual(second.classified.outcome, OUTCOMES.ANALYSIS_CHANGE);
  });

  it("CLI crash when --out-dir is a file is transport_failure, not analysis_refusal", () => {
    const { result, classified } = runJob(
      "vendor-budget-impact",
      ["--before", budgetBefore, "--after", budgetAfter, "--out-dir", budgetBefore],
    );
    assert.equal(result.body, null);
    assert.notEqual(result.status, 0);
    assert.equal(classified.outcome, OUTCOMES.TRANSPORT_FAILURE);
    assert.notEqual(classified.outcome, OUTCOMES.ANALYSIS_REFUSAL);
    assert.match(result.stderr, /EEXIST|mkdir/i);
  });

  it("kit acquisition failure before the wrapper try is transport_failure", () => {
    const archive = USEFUL_JOBS_ARCHIVE_PATH;
    const mode = statSync(archive).mode;
    rmSync(cacheRoot(), { recursive: true, force: true });
    try {
      chmodSync(archive, 0);
      const { result, classified } = runJob(
        "vendor-budget-impact",
        ["--before", budgetBefore, "--after", budgetAfter],
        work("acq"),
      );
      assert.equal(result.body, null);
      assert.equal(classified.outcome, OUTCOMES.TRANSPORT_FAILURE);
      assert.notEqual(classified.outcome, OUTCOMES.ANALYSIS_REFUSAL);
      assert.match(result.stderr, /EACCES|permission denied/i);
    } finally {
      chmodSync(archive, mode);
    }
    const restored = runJob("vendor-budget-impact", ["--before", budgetBefore, "--after", budgetAfter], work("acq-ok"));
    assert.equal(restored.classified.outcome, OUTCOMES.ANALYSIS_CHANGE, restored.result.stderr);
  });

  it("classify CLI prints analysis_change and exits 0 for a successful change report", () => {
    const outDir = work("bin");
    const r = spawnSync(
      process.execPath,
      [
        classifyBin,
        "run",
        "vendor-budget-impact",
        "--before",
        budgetBefore,
        "--after",
        budgetAfter,
        "--out-dir",
        outDir,
      ],
      { encoding: "utf8", cwd: REPO_ROOT, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.classified.outcome, OUTCOMES.ANALYSIS_CHANGE);
    assert.equal(body.classified.schema, SCHEMA);
    assert.equal(body.processStatus, 0);
  });
});
