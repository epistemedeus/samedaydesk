import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { CONTRACT } from "../lib/contract.mjs";
import { D03_PIN } from "../lib/d03-adapter.mjs";
import { prefixSha256, sha256Prefixed, zipSidecarPath } from "../lib/pins.mjs";
import {
  copyFixture,
  ensureD03Worktree,
  payload,
  runExport,
  runFeedAgendaA,
  sha256Hex,
  tmp,
} from "./helpers.mjs";

const CLOCK = "2026-09-11T20:00:00.000Z";
const FAKE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("contract advertises export/import and the D03 pin without copying that kernel", () => {
  assert.deepEqual(CONTRACT.commands, ["export", "import"]);
  assert.equal(CONTRACT.customerDelivery, false);
  assert.equal(CONTRACT.d03.sha, D03_PIN.sha);
  assert.equal(CONTRACT.d03.sha, "58cba6324c1d9793d344bc13154b8b2380e8166f");
});

test("local-runtime SAMPLE no-change feed-agenda export then import consumes the same zip bytes", () => {
  const inDir = tmp("w5-feed-imp-in-");
  const seeded = runFeedAgendaA(inDir);
  assert.equal(seeded.proc.status, 0, seeded.proc.stdout + seeded.proc.stderr);
  assert.equal(seeded.json.ok, true);
  assert.equal(seeded.json.appId, "feed-agenda");
  assert.equal(seeded.json.status, "informational");
  const originalJson = readFileSync(join(inDir, "agenda.json"));
  const originalIcs = readFileSync(join(inDir, "agenda.ics"));
  const exportDir = tmp("w5-feed-imp-ex-");
  const exported = runExport(["export", "--in-dir", inDir, "--out", exportDir, "--clock", CLOCK]);
  const body = payload(exported);
  assert.equal(exported.status, 0, exported.stdout + exported.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.label, "SAMPLE");
  assert.equal(body.customerDelivery, false);
  const zipBytes = readFileSync(body.zip);
  assert.equal(body.zipSha256, sha256Prefixed(zipBytes));
  assert.equal(readFileSync(zipSidecarPath(body.zip), "utf8").trim(), body.zipSha256);

  const importDir = tmp("w5-feed-imp-im-");
  const imported = runExport([
    "import",
    "--zip",
    body.zip,
    "--out",
    importDir,
    "--zip-sha256",
    body.zipSha256,
  ]);
  const imp = payload(imported);
  assert.equal(imported.status, 0, imported.stdout + imported.stderr);
  assert.equal(imp.ok, true);
  assert.equal(imp.command, "import");
  assert.equal(imp.jobId, "feed-agenda");
  assert.equal(imp.zipSha256, body.zipSha256);
  assert.equal(imp.archiveSha256, body.archiveSha256);
  assert.equal(imp.jobOutputCorrespondence, true);
  assert.equal(imp.customerDelivery, false);
  assert.equal(imp.transport, "ok");
  assert.equal(imp.analysisOutcome, "sample-or-fixture");
  assert.equal(imp.completeness.bound, false);
  assert.equal(imp.completeness.pin.sha, D03_PIN.sha);
  assert.equal(sha256Hex(readFileSync(join(importDir, "agenda.json"))), sha256Hex(originalJson));
  assert.equal(sha256Hex(readFileSync(join(importDir, "agenda.ics"))), sha256Hex(originalIcs));
});

test("import with sidecar alone binds the consumed zip bytes", () => {
  const exportDir = tmp("w5-side-ex-");
  const exported = runExport([
    "export",
    "--in-dir",
    copyFixture("sale-out-dir"),
    "--out",
    exportDir,
    "--clock",
    CLOCK,
  ]);
  const body = payload(exported);
  assert.equal(exported.status, 0, exported.stdout);
  const imported = runExport(["import", "--zip", body.zip, "--out", tmp("w5-side-im-")]);
  const imp = payload(imported);
  assert.equal(imported.status, 0, imported.stdout);
  assert.equal(imp.zipSha256, body.zipSha256);
  assert.equal(imp.jobId, "feed-agenda");
  assert.equal(imp.analysisOutcome, "sale-labelled-nonsettling");
});

test("seeded failure: import --zip-sha256 that is not the consumed zip bytes", () => {
  const exported = runExport([
    "export",
    "--in-dir",
    copyFixture("sale-out-dir"),
    "--out",
    tmp("w5-claim-ex-"),
    "--clock",
    CLOCK,
  ]);
  const body = payload(exported);
  assert.equal(exported.status, 0, exported.stdout);
  const imported = runExport([
    "import",
    "--zip",
    body.zip,
    "--out",
    tmp("w5-claim-im-"),
    "--zip-sha256",
    FAKE_SHA,
  ]);
  const imp = payload(imported);
  assert.equal(imported.status, 2);
  assert.equal(imp.ok, false);
  assert.equal(imp.code, "zip-bytes-mismatch");
  assert.equal(imp.detail.claimed, prefixSha256(FAKE_SHA));
  assert.equal(imp.detail.actual, body.zipSha256);
});

test("seeded failure: mutated zip bytes are not the advertised archive", () => {
  const exported = runExport([
    "export",
    "--in-dir",
    copyFixture("sale-out-dir"),
    "--out",
    tmp("w5-mut-ex-"),
    "--clock",
    CLOCK,
  ]);
  const body = payload(exported);
  assert.equal(exported.status, 0, exported.stdout);
  const mutated = Buffer.from(readFileSync(body.zip));
  mutated[mutated.length - 1] = mutated[mutated.length - 1] ^ 0xff;
  writeFileSync(body.zip, mutated);
  const imported = runExport([
    "import",
    "--zip",
    body.zip,
    "--out",
    tmp("w5-mut-im-"),
    "--zip-sha256",
    body.zipSha256,
  ]);
  const imp = payload(imported);
  assert.equal(imported.status, 2);
  assert.equal(imp.code, "zip-bytes-mismatch");
  assert.notEqual(imp.detail.actual, body.zipSha256);
});

test("seeded failure: swapped zip with the other export's digest claim", () => {
  const a = payload(
    runExport([
      "export",
      "--in-dir",
      copyFixture("sale-out-dir"),
      "--out",
      tmp("w5-swap-a-"),
      "--clock",
      CLOCK,
    ]),
  );
  const sampleDir = copyFixture("sample-out-dir");
  const b = payload(
    runExport(["export", "--in-dir", sampleDir, "--out", tmp("w5-swap-b-"), "--clock", CLOCK]),
  );
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.zipSha256, b.zipSha256);
  const imported = runExport(["import", "--zip", a.zip, "--out", tmp("w5-swap-im-"), "--zip-sha256", b.zipSha256]);
  const imp = payload(imported);
  assert.equal(imported.status, 2);
  assert.equal(imp.code, "zip-bytes-mismatch");
});

test("CLI help names import and the zip-byte identity rule", () => {
  const proc = runExport(["--help"]);
  assert.equal(proc.status, 0);
  assert.match(proc.stdout, /import --zip/);
  assert.match(proc.stdout, /hashes the zip bytes it consumes/);
});

test("D03 verify-complete on an imported useful-jobs out-dir is missing-receipt, not paid complete", () => {
  const d03 = ensureD03Worktree();
  assert.equal(d03.sha, D03_PIN.sha);
  assert.equal(existsSync(d03.cli), true);
  const inDir = tmp("w5-d03-in-");
  const seeded = runFeedAgendaA(inDir);
  assert.equal(seeded.json.ok, true);
  const exported = payload(
    runExport(["export", "--in-dir", inDir, "--out", tmp("w5-d03-ex-"), "--clock", CLOCK]),
  );
  assert.equal(exported.ok, true);
  const importDir = tmp("w5-d03-im-");
  const imported = payload(
    runExport(["import", "--zip", exported.zip, "--out", importDir, "--zip-sha256", exported.zipSha256]),
  );
  assert.equal(imported.ok, true);
  assert.equal(imported.jobOutputCorrespondence, true);
  assert.equal(imported.customerDelivery, false);
  assert.equal(imported.completeness.bound, false);

  const proc = spawnSync(process.execPath, [d03.cli, "--root", importDir], { encoding: "utf8" });
  const body = JSON.parse(proc.stdout);
  assert.equal(proc.status, 2, proc.stdout + proc.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.classification, "partial");
  assert.equal(body.code, "missing-receipt");
  assert.equal(body.sold, false);
});

test("injected D03 verifyComplete on import is recorded without becoming a paid delivery", async () => {
  const d03 = ensureD03Worktree();
  const { verifyComplete } = await import(join(d03.root, "tools/job-output-atomicity/index.mjs"));
  const { importJobArtifacts } = await import("../lib/import.mjs");
  const exported = payload(
    runExport([
      "export",
      "--in-dir",
      copyFixture("sale-out-dir"),
      "--out",
      tmp("w5-d03inj-ex-"),
      "--clock",
      CLOCK,
    ]),
  );
  const importDir = tmp("w5-d03inj-im-");
  const result = importJobArtifacts({
    zip: exported.zip,
    out: importDir,
    zipSha256: exported.zipSha256,
    verifyComplete,
  });
  assert.equal(result.ok, true);
  assert.equal(result.customerDelivery, false);
  assert.equal(result.completeness.bound, true);
  assert.equal(result.completeness.ok, false);
  assert.equal(result.completeness.classification, "partial");
  assert.equal(result.completeness.code, "missing-receipt");
});
