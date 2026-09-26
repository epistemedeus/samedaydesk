import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import {
  CATALOG,
  completePackage,
  f08Root,
  tempDir,
  vendorBudgetPaths,
  verifyCli,
} from "./helpers.mjs";
import { digestNamedBytes } from "../lib/digest.mjs";
import { hashTermsVersion } from "../vendor/i01-hash-terms/hash.mjs";
import { launchPaidWrapper } from "../lib/launch.mjs";
import { VERIFY_CODES, F08_TESTED_SHA } from "../index.mjs";
import { verifyComplete } from "../lib/verify.mjs";

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function writeReceipt(root, receipt) {
  writeFileSync(join(root, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}

function parseCli(cli) {
  return JSON.parse(cli.stdout);
}

describe("Co17 output completeness and identity", { timeout: 180_000 }, () => {
  it("empty output objects cannot count complete through verify-complete CLI", () => {
    const root = tempDir("joa-empty-obj-");
    writeReceipt(root, {
      schema: "samedaydesk.paid-useful-jobs.receipt.v1",
      jobId: "not-a-catalog-job",
      sold: false,
      purchaseAuthority: false,
      outputs: [{}],
    });
    const cli = verifyCli(root);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, false);
    assert.notEqual(body.classification, "complete");
    assert.equal(body.code, VERIFY_CODES.EMPTY_OUTPUT_OBJECT);
    assert.equal(body.testedProducer.sha, F08_TESTED_SHA);
  });

  it("unknown job with named foreign bytes cannot count complete through verify-complete CLI", () => {
    const root = tempDir("joa-unknown-job-");
    const bytes = Buffer.from("foreign-bytes\n");
    writeFileSync(join(root, "foreign.txt"), bytes);
    writeReceipt(root, {
      schema: "samedaydesk.paid-useful-jobs.receipt.v1",
      jobId: "not-a-catalog-job",
      sold: false,
      purchaseAuthority: false,
      outputs: [{ name: "foreign.txt", bytes: bytes.length, sha256: sha(bytes) }],
    });
    const cli = verifyCli(root);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, false);
    assert.equal(body.code, VERIFY_CODES.UNKNOWN_JOB);
  });

  it("unknown receipt schema cannot count complete", () => {
    const src = completePackage();
    const dest = join(tempDir("joa-schema-"), "pkg");
    cpSync(src, dest, { recursive: true });
    const receipt = JSON.parse(readFileSync(join(dest, "receipt.json"), "utf8"));
    receipt.schema = "samedaydesk.paid-useful-jobs.receipt.v9-not-real";
    writeReceipt(dest, receipt);
    const cli = verifyCli(dest);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, false);
    assert.equal(body.code, VERIFY_CODES.UNRECOGNIZED_RECEIPT_SCHEMA);
  });

  it("extra listed foreign name cannot count complete even when outputsDigest is rewritten", () => {
    const src = completePackage();
    const dest = join(tempDir("joa-foreign-name-"), "pkg");
    cpSync(src, dest, { recursive: true });
    const ics = Buffer.from("BEGIN:VCALENDAR\nEND:VCALENDAR\n");
    writeFileSync(join(dest, "agenda.ics"), ics);
    const receipt = JSON.parse(readFileSync(join(dest, "receipt.json"), "utf8"));
    receipt.outputs = [
      ...receipt.outputs,
      { name: "agenda.ics", kind: "file", bytes: ics.length, sha256: sha(ics) },
    ];
    receipt.outputsDigest = digestNamedBytes(
      receipt.outputs.map((e) => ({
        name: e.name,
        kind: e.kind || "file",
        bytes: e.bytes,
        sha256: e.sha256,
      })),
    );
    writeReceipt(dest, receipt);
    const cli = verifyCli(dest);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, false);
    assert.equal(body.code, VERIFY_CODES.FOREIGN_OUTPUT_NAME);
  });

  it("foreign bytes without per-file sha256 cannot count complete", () => {
    const src = completePackage();
    const dest = join(tempDir("joa-foreign-bytes-"), "pkg");
    cpSync(src, dest, { recursive: true });
    writeFileSync(join(dest, "budget-impact.md"), "FOREIGN MD BYTES THAT ARE NOT THE REPORT\n");
    const receipt = JSON.parse(readFileSync(join(dest, "receipt.json"), "utf8"));
    for (const entry of receipt.outputs) {
      delete entry.sha256;
      if (entry.name === "budget-impact.md") entry.bytes = Buffer.byteLength("FOREIGN MD BYTES THAT ARE NOT THE REPORT\n");
    }
    delete receipt.outputsDigest;
    writeReceipt(dest, receipt);
    const cli = verifyCli(dest);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, false);
    assert.equal(body.code, VERIFY_CODES.MISSING_OUTPUT_DIGEST);
  });

  it("FIFO special file cannot count complete and does not hang", () => {
    const src = completePackage();
    const dest = join(tempDir("joa-fifo-"), "pkg");
    cpSync(src, dest, { recursive: true });
    spawnSync("rm", ["-f", join(dest, "budget-impact.md")]);
    const fifo = spawnSync("mkfifo", [join(dest, "budget-impact.md")], { encoding: "utf8" });
    assert.equal(fifo.status, 0, fifo.stderr);
    const started = Date.now();
    const result = verifyComplete({ root: dest, catalogPath: CATALOG, evidenceClass: "fixture" });
    assert.ok(Date.now() - started < 2_000, "FIFO open blocked the verifier");
    assert.equal(result.ok, false);
    assert.equal(result.code, VERIFY_CODES.SPECIAL_OUTPUT_FILE);
    const cli = verifyCli(dest);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    assert.equal(parseCli(cli).code, VERIFY_CODES.SPECIAL_OUTPUT_FILE);
  });

  it("symlink to foreign bytes cannot count complete even when receipt hashes match the target", () => {
    const src = completePackage();
    const dest = join(tempDir("joa-symlink-"), "pkg");
    cpSync(src, dest, { recursive: true });
    const foreign = Buffer.from("not the report\n");
    writeFileSync(join(dest, "outside.md"), foreign);
    spawnSync("rm", ["-f", join(dest, "budget-impact.md")]);
    symlinkSync(join(dest, "outside.md"), join(dest, "budget-impact.md"));
    const receipt = JSON.parse(readFileSync(join(dest, "receipt.json"), "utf8"));
    for (const entry of receipt.outputs) {
      if (entry.name === "budget-impact.md") {
        entry.bytes = foreign.length;
        entry.sha256 = sha(foreign);
      }
    }
    receipt.outputsDigest = digestNamedBytes(
      receipt.outputs.map((e) => ({
        name: e.name,
        kind: e.kind || "file",
        bytes: e.bytes,
        sha256: e.sha256,
      })),
    );
    writeReceipt(dest, receipt);
    const cli = verifyCli(dest);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, false);
    assert.equal(body.code, VERIFY_CODES.SPECIAL_OUTPUT_FILE);
  });

  it("valid no-change artifact from F08 counts complete and is not a transport failure", () => {
    const wrapperRoot = f08Root();
    const paths = vendorBudgetPaths(wrapperRoot);
    const outDir = tempDir("joa-nochange-");
    const launched = launchPaidWrapper({
      f08Root: wrapperRoot,
      outDir,
      extraArgs: [
        "--before",
        paths.before,
        "--after",
        paths.before,
        "--funding",
        "reserved-fixture",
        "--payment",
        paths.payment,
      ],
    });
    assert.equal(launched.status, 0, launched.stderr + launched.stdout);
    assert.equal(launched.testedSha, F08_TESTED_SHA);
    const cli = verifyCli(outDir);
    assert.equal(cli.status, 0, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, true);
    assert.equal(body.classification, "complete");
    assert.equal(body.analysisOk, true);
    assert.equal(body.analysisRefused, false);
    assert.equal(body.analysisStatus, "informational");
    assert.equal(body.testedProducer.sha, F08_TESTED_SHA);
  });

  it("missing required input is wrapper refusal, not a complete no-change artifact", () => {
    const wrapperRoot = f08Root();
    const paths = vendorBudgetPaths(wrapperRoot);
    const outDir = tempDir("joa-missing-after-");
    const launched = launchPaidWrapper({
      f08Root: wrapperRoot,
      outDir,
      extraArgs: ["--before", paths.before, "--funding", "reserved-fixture", "--payment", paths.payment],
    });
    assert.notEqual(launched.status, 0);
    const cli = verifyCli(outDir);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, false);
    assert.notEqual(body.classification, "complete");
  });

  it("does not force unlike terms hashes equal", () => {
    const src = completePackage();
    const dest = join(tempDir("joa-terms-"), "pkg");
    cpSync(src, dest, { recursive: true });
    const receipt = JSON.parse(readFileSync(join(dest, "receipt.json"), "utf8"));
    const planted = hashTermsVersion({
      schema: "samedaydesk.unrelated-disclosure.v1",
      note: "not the output identity document",
    });
    receipt.termsVersion = planted;
    writeReceipt(dest, receipt);
    const cli = verifyCli(dest);
    assert.equal(cli.status, 0, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, true);
    assert.equal(body.classification, "complete");
    assert.equal(body.receiptTermsVersion, planted);
    assert.notEqual(body.termsVersion, planted);
    assert.match(body.termsVersion, /^sha256:[0-9a-f]{64}$/);
  });

  it("wrong engine archive cannot count complete", () => {
    const src = completePackage();
    const dest = join(tempDir("joa-archive-"), "pkg");
    cpSync(src, dest, { recursive: true });
    const receipt = JSON.parse(readFileSync(join(dest, "receipt.json"), "utf8"));
    receipt.engine = { ...receipt.engine, archiveSha256: "ab".repeat(32) };
    writeReceipt(dest, receipt);
    const cli = verifyCli(dest);
    assert.equal(cli.status, 2, cli.stderr + cli.stdout);
    const body = parseCli(cli);
    assert.equal(body.ok, false);
    assert.equal(body.code, VERIFY_CODES.FOREIGN_ENGINE_ARCHIVE);
  });
});
