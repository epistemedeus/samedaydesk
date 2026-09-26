import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ADMISSION_STATUS,
  ISSUE_KIND,
  SCHEMA,
  admitArtifactSubmission,
  analyzePath,
  effectiveAdmissionContract,
} from "../src/index.mjs";

const exchange01Mod = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "../../01/src/index.mjs")).href
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));

test("positive: complete safe file set admitted", () => {
  const result = admitArtifactSubmission(load("contract.json"), load("submission.positive.json"), {
    clock: () => Date.parse("2026-09-10T15:00:00.000Z"),
  });
  assert.equal(result.schema, SCHEMA);
  assert.equal(result.status, ADMISSION_STATUS.ADMITTED);
  assert.equal(result.summary.missingFileCount, 0);
  assert.equal(result.summary.unsafePathCount, 0);
  assert.equal(result.summary.unsupportedFormatCount, 0);
  assert.equal(result.acceptedFiles.length, 2);
});

test("negative: missing required file", () => {
  const result = admitArtifactSubmission(load("contract.json"), load("submission.missing.json"));
  assert.equal(result.status, ADMISSION_STATUS.PARTIAL);
  assert.ok(result.issues.some((i) => i.kind === ISSUE_KIND.MISSING_FILE && i.path === "note/README.md"));
});

test("negative: unsafe paths rejected", () => {
  const result = admitArtifactSubmission(load("contract.json"), load("submission.unsafe.json"));
  assert.equal(result.status, ADMISSION_STATUS.REJECTED);
  assert.ok(result.summary.unsafePathCount >= 2);
  assert.ok(result.issues.some((i) => i.kind === ISSUE_KIND.UNSAFE_PATH));
});

test("negative: unsupported format rejected", () => {
  const result = admitArtifactSubmission(load("contract.json"), load("submission.unsupported.json"));
  assert.equal(result.status, ADMISSION_STATUS.REJECTED);
  assert.ok(result.issues.some((i) => i.kind === ISSUE_KIND.UNSUPPORTED_FORMAT && i.format === "exe"));
});

test("partial: one required present one missing", () => {
  const result = admitArtifactSubmission(load("contract.json"), load("submission.partial.json"));
  assert.equal(result.status, ADMISSION_STATUS.PARTIAL);
  assert.equal(result.summary.missingFileCount, 1);
  assert.equal(result.acceptedFiles.length, 1);
});

test("path analyzer catches traversal and absolute", () => {
  assert.equal(analyzePath("../x").ok, false);
  assert.equal(analyzePath("/etc/passwd").ok, false);
  assert.equal(analyzePath("note/artifact.json").ok, true);
});

test("reuses brief deliverableContract to derive single artifact.json contract", () => {
  const brief = exchange01Mod.buildAcceptanceBrief(
    JSON.parse(readFileSync(join(root, "../01/fixtures/requirements.positive.json"), "utf8")),
  );
  const result = admitArtifactSubmission(brief, {
    files: [{ path: "artifact.json", byteLength: 100, format: "json" }],
  });
  assert.equal(result.status, ADMISSION_STATUS.ADMITTED);
  assert.equal(result.acceptedFiles[0].path, "artifact.json");
});

test("same-task fileSetContract cannot relax brief maxBytes", () => {
  const brief = exchange01Mod.buildAcceptanceBrief({
    taskId: "size-task",
    title: "Size",
    summary: "Tiny artifact only",
    artifact: { format: "json", maxBytes: 64, requiredFields: ["name"] },
    objectiveCriteria: [{ id: "name_present", description: "name", check: { kind: "json_path_exists", path: "name" } }],
  });
  const relaxing = {
    taskId: "size-task",
    requiredFiles: [{ path: "artifact.json", format: "json" }],
    allowedFormats: ["json"],
    maxBytesPerFile: 10000,
    maxTotalBytes: 10000,
  };
  const effective = effectiveAdmissionContract(brief, relaxing);
  assert.equal(effective.ok, true);
  assert.equal(effective.contract.maxBytesPerFile, 64);
  assert.equal(effective.contract.maxTotalBytes, 64);

  const foreign = effectiveAdmissionContract(brief, { ...relaxing, taskId: "other-task" });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.gate.reason, "foreign_file_set_contract");
});

test("F5: unexpected_file blocks when allowExtraFiles=false", async () => {
  const { admitArtifactSubmission, ADMISSION_STATUS, ISSUE_KIND } = await import("../src/index.mjs");
  const out = admitArtifactSubmission(
    {
      taskId: "t",
      requiredFiles: [{ path: "artifact.json", format: "json" }],
      allowedFormats: ["json"],
      maxBytesPerFile: 10000,
      maxTotalBytes: 10000,
      allowExtraFiles: false,
    },
    {
      files: [
        { path: "artifact.json", byteLength: 10, format: "json" },
        { path: "extra.json", byteLength: 5, format: "json" },
      ],
    },
  );
  assert.equal(out.status, ADMISSION_STATUS.REJECTED);
  assert.ok(out.issues.some((i) => i.kind === ISSUE_KIND.UNEXPECTED_FILE));
  assert.equal(out.summary.unexpectedFileCount, 1);
});
