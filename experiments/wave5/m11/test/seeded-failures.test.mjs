import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ensureUsefulJobsKit } from "../../../../server/paid-useful-jobs/lib/engine.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";
import { validateCorpus } from "../lib/run-corpus.mjs";
import { runWrapperCli } from "../lib/run-wrapper.mjs";
import { classifyRun } from "../lib/outcome.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/corpus.mjs");

function runCli(argv, timeoutMs = 60_000) {
  return spawnSync(process.execPath, [cli, ...argv], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe("seeded corpus refusals", { timeout: 120_000 }, () => {
  it("kit samples/pricing/caller-alpha stays SAMPLE even when copied into a corpus", () => {
    const kit = ensureUsefulJobsKit();
    const work = mkdtempSync(join(tmpdir(), "w5-m11-sample-"));
    const dest = join(work, "alpha");
    mkdirSync(dest);
    copyFileSync(join(kit, "samples/pricing/caller-alpha/before.json"), join(dest, "before.json"));
    copyFileSync(join(kit, "samples/pricing/caller-alpha/after.json"), join(dest, "after.json"));
    copyFileSync(join(kit, "samples/pricing/caller-alpha/SAMPLE.txt"), join(dest, "SAMPLE.txt"));
    writeFileSync(
      join(work, "corpus.json"),
      `${JSON.stringify({
        schema: "samedaydesk.caller-example-corpus.v1",
        id: "kit-sample-as-caller",
        cases: [
          {
            id: "alpha",
            jobId: "vendor-budget-impact",
            dir: "alpha",
            inputs: { before: "before.json", after: "after.json" },
          },
        ],
      })}\n`,
    );
    const body = validateCorpus(work);
    assert.equal(body.ok, false);
    assert.equal(body.code, "sample-not-caller-corpus");
    assert.equal(body.sold, false);
  });

  it("SAMPLE-labelled JSON copied outside the kit is still not a caller corpus", () => {
    const work = mkdtempSync(join(tmpdir(), "w5-m11-label-"));
    mkdirSync(join(work, "case-a"));
    const sample = {
      label: "SAMPLE",
      note: "SAMPLE fixture - not a customer",
      rows: [{ field: "x", value: 1, unit: "USD" }],
    };
    writeFileSync(join(work, "case-a/before.json"), `${JSON.stringify(sample)}\n`);
    writeFileSync(join(work, "case-a/after.json"), `${JSON.stringify(sample)}\n`);
    writeFileSync(
      join(work, "corpus.json"),
      `${JSON.stringify({
        schema: "samedaydesk.caller-example-corpus.v1",
        id: "labelled",
        cases: [
          {
            id: "case-a",
            jobId: "vendor-budget-impact",
            dir: "case-a",
            inputs: { before: "before.json", after: "after.json" },
          },
        ],
      })}\n`,
    );
    const body = validateCorpus(work);
    assert.equal(body.ok, false);
    assert.equal(body.code, "sample-not-caller-corpus");
  });

  it("wrapper --example is a labeled sample demonstration, not independently valid caller input", () => {
    const wrapper = runWrapperCli({
      jobId: "vendor-budget-impact",
      example: true,
      funding: "unfunded",
    });
    assert.equal(wrapper.json?.ok, true, wrapper.stderr + wrapper.stdout);
    assert.equal(wrapper.json?.sample, true);
    const outcome = classifyRun({ wrapper, artifact: wrapper.json?.engine, sample: true });
    assert.equal(outcome.transportOk, true);
    assert.equal(outcome.analysis, "sample");
    assert.equal(outcome.independentlyValidCaller, false);
  });

  it("corpus case with example:true is refused before wrapper sale semantics", () => {
    const work = mkdtempSync(join(tmpdir(), "w5-m11-ex-"));
    writeFileSync(
      join(work, "before.json"),
      `${JSON.stringify({ label: "caller", rows: [{ field: "a", value: 1, unit: "USD" }] })}\n`,
    );
    writeFileSync(
      join(work, "after.json"),
      `${JSON.stringify({ label: "caller", rows: [{ field: "a", value: 2, unit: "USD" }] })}\n`,
    );
    writeFileSync(
      join(work, "corpus.json"),
      `${JSON.stringify({
        schema: "samedaydesk.caller-example-corpus.v1",
        id: "example-flag",
        cases: [
          {
            id: "flagged",
            jobId: "vendor-budget-impact",
            dir: ".",
            example: true,
            inputs: { before: "before.json", after: "after.json" },
          },
        ],
      })}\n`,
    );
    const r = runCli(["validate", "--corpus", work]);
    assert.equal(r.status, 2);
    const body = JSON.parse(r.stdout);
    assert.equal(body.code, "sample-not-caller-corpus");
  });

  it("missing required caller file is a structured refusal, not a crash", () => {
    const work = mkdtempSync(join(tmpdir(), "w5-m11-miss-"));
    writeFileSync(
      join(work, "before.json"),
      `${JSON.stringify({ label: "caller", rows: [{ field: "a", value: 1, unit: "USD" }] })}\n`,
    );
    writeFileSync(
      join(work, "corpus.json"),
      `${JSON.stringify({
        schema: "samedaydesk.caller-example-corpus.v1",
        id: "missing-after",
        cases: [
          {
            id: "missing",
            jobId: "vendor-budget-impact",
            dir: ".",
            inputs: { before: "before.json", after: "after.json" },
          },
        ],
      })}\n`,
    );
    const r = runCli(["run", "--corpus", work]);
    assert.equal(r.status, 2);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "missing-required-inputs");
    assert.equal(r.signal, null);
  });

  it("path traversal input is refused", () => {
    const work = mkdtempSync(join(tmpdir(), "w5-m11-esc-"));
    mkdirSync(join(work, "case-a"));
    writeFileSync(
      join(work, "case-a/before.json"),
      `${JSON.stringify({ label: "caller", rows: [{ field: "a", value: 1, unit: "USD" }] })}\n`,
    );
    writeFileSync(
      join(work, "case-a/after.json"),
      `${JSON.stringify({ label: "caller", rows: [{ field: "a", value: 2, unit: "USD" }] })}\n`,
    );
    writeFileSync(
      join(work, "corpus.json"),
      `${JSON.stringify({
        schema: "samedaydesk.caller-example-corpus.v1",
        id: "escape",
        cases: [
          {
            id: "case-a",
            jobId: "vendor-budget-impact",
            dir: "case-a",
            inputs: { before: "before.json", after: "../../package.json" },
          },
        ],
      })}\n`,
    );
    const body = validateCorpus(work);
    assert.equal(body.ok, false);
    assert.equal(body.code, "path-escape");
  });

  it("unknown job is a structured refusal", () => {
    const work = mkdtempSync(join(tmpdir(), "w5-m11-job-"));
    writeFileSync(
      join(work, "corpus.json"),
      `${JSON.stringify({
        schema: "samedaydesk.caller-example-corpus.v1",
        id: "nope",
        cases: [{ id: ".", jobId: "not-a-real-job", dir: ".", inputs: {} }],
      })}\n`,
    );
    const body = validateCorpus(work);
    assert.equal(body.ok, false);
    assert.equal(body.code, "unknown-job");
  });
});
