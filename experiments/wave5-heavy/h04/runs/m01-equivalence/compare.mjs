#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const COMPOSITION_SHA = "a20232b0f777b0f737cdffefb64a9ca9d9c9ba0e";
const M01_ROOT = "/tmp/w5-h04/ro-m01";
const H04_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BEFORE = join(H04_ROOT, "examples/lockfile/h04-lock-01/before.json");
const AFTER = join(H04_ROOT, "examples/lockfile/h04-lock-01/after.json");
const RUNS = dirname(fileURLToPath(import.meta.url));
const CLI_OUT = join(RUNS, "cli");
const LIB_OUT = join(RUNS, "lib");
const INVOKE_OUT = join(RUNS, "lib-invoke");

function sha256Bytes(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function sha256File(path) {
  if (!existsSync(path)) return null;
  return sha256Bytes(readFileSync(path));
}

function stablePinDeltaText(text) {
  return String(text).replace(
    /"generatedAt": "\d{4}-\d{2}-\d{2}T[^"]+"/,
    '"generatedAt": "<STABLE>"',
  );
}

function pinDeltaDiffs(a, b) {
  const diffs = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    if (JSON.stringify(a?.[key]) !== JSON.stringify(b?.[key])) diffs.push(key);
  }
  return diffs;
}

function readPinDelta(outDir) {
  const path = join(outDir, "pin-delta.json");
  if (!existsSync(path)) {
    return { path, exists: false, status: null, counts: null, sha256: null, stableSha256: null, bytes: 0, json: null };
  }
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const json = JSON.parse(text);
  return {
    path,
    exists: true,
    status: json.status ?? null,
    counts: json.counts
      ? { added: json.counts.added, removed: json.counts.removed, changed: json.counts.changed }
      : null,
    sha256: sha256Bytes(bytes),
    stableSha256: sha256Bytes(Buffer.from(stablePinDeltaText(text))),
    mdSha256: sha256File(join(outDir, "pin-delta.md")),
    bytes: bytes.length,
    generatedAt: json.generatedAt ?? null,
    json,
  };
}

function derivedExit(ok, kind) {
  if (ok) return 0;
  if (kind === "refused") return 2;
  return 1;
}

function parseJsonPayload(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const observedSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: M01_ROOT, encoding: "utf8" });
const compositionSha = (observedSha.stdout || "").trim();

mkdirSync(CLI_OUT, { recursive: true });
mkdirSync(LIB_OUT, { recursive: true });
mkdirSync(INVOKE_OUT, { recursive: true });

const wall0 = Date.now();

const cliT0 = Date.now();
const cliSpawn = spawnSync(
  process.execPath,
  [
    "experiments/wave5/m01/bin/run-job.mjs",
    "lockfile-pin-delta",
    "--before",
    BEFORE,
    "--after",
    AFTER,
    "--out-dir",
    CLI_OUT,
  ],
  { cwd: M01_ROOT, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
);
const cliDurationMs = Date.now() - cliT0;
writeFileSync(join(CLI_OUT, "stdout.txt"), cliSpawn.stdout || "");
writeFileSync(join(CLI_OUT, "stderr.txt"), cliSpawn.stderr || "");
writeFileSync(join(CLI_OUT, "exit.txt"), `${cliSpawn.status ?? "null"}\n`);

const cliReceipt = parseJsonPayload(cliSpawn.stdout);
const cliPin = readPinDelta(CLI_OUT);
const cli = {
  cwd: M01_ROOT,
  argv: [
    "experiments/wave5/m01/bin/run-job.mjs",
    "lockfile-pin-delta",
    "--before",
    BEFORE,
    "--after",
    AFTER,
    "--out-dir",
    CLI_OUT,
  ],
  exitCode: cliSpawn.status,
  outcomeKind: cliReceipt?.outcome?.kind ?? null,
  ok: cliReceipt?.ok ?? null,
  status: cliPin.status ?? cliReceipt?.stdoutJson?.status ?? null,
  counts: cliPin.counts ?? null,
  pinDeltaSha256: cliPin.sha256,
  pinDeltaStableSha256: cliPin.stableSha256,
  pinDeltaMdSha256: cliPin.mdSha256,
  pinDeltaBytes: cliPin.bytes,
  generatedAt: cliPin.generatedAt,
  durationMs: cliDurationMs,
  pinSha: cliReceipt?.pinSha ?? null,
  engineSource: cliReceipt?.engineSource ?? null,
  digest: cliReceipt?.stdoutJson?.digest ?? null,
};

const m01 = await import("file:///tmp/w5-h04/ro-m01/experiments/wave5/m01/index.mjs");
const request = {
  engineId: "lockfile-pin-delta",
  inputs: { before: BEFORE, after: AFTER },
};

const libT0 = Date.now();
const catalogJob = m01.runCatalogJob({ ...request, outDir: LIB_OUT });
const libDurationMs = Date.now() - libT0;
writeFileSync(join(LIB_OUT, "receipt.json"), `${JSON.stringify({
  ok: catalogJob?.ok,
  engineId: catalogJob?.engineId,
  pinSha: catalogJob?.pinSha,
  engineSource: catalogJob?.engineSource,
  outcome: catalogJob?.outcome,
  schemaMatch: catalogJob?.schemaMatch,
  stdoutJson: catalogJob?.stdoutJson,
}, null, 2)}\n`);

const invokeT0 = Date.now();
const invoked = m01.invokeEngine({ ...request, outDir: INVOKE_OUT });
const invokeDurationMs = Date.now() - invokeT0;
writeFileSync(join(INVOKE_OUT, "receipt.json"), `${JSON.stringify({
  ok: invoked?.ok,
  engineId: invoked?.engineId,
  pinSha: invoked?.pinSha,
  engineSource: invoked?.engineSource,
  outcome: invoked?.outcome,
  schemaMatch: invoked?.schemaMatch,
  stdoutJson: invoked?.stdoutJson,
}, null, 2)}\n`);

const libPin = readPinDelta(LIB_OUT);
const invokePin = readPinDelta(INVOKE_OUT);

const library = {
  api: "runCatalogJob+invokeEngine",
  import: "file:///tmp/w5-h04/ro-m01/experiments/wave5/m01/index.mjs",
  runCatalogJob: {
    ok: catalogJob?.ok ?? null,
    outcomeKind: catalogJob?.outcome?.kind ?? null,
    derivedExit: derivedExit(catalogJob?.ok, catalogJob?.outcome?.kind),
    status: libPin.status ?? catalogJob?.stdoutJson?.status ?? null,
    counts: libPin.counts,
    pinDeltaSha256: libPin.sha256,
    pinDeltaStableSha256: libPin.stableSha256,
    pinDeltaMdSha256: libPin.mdSha256,
    pinDeltaBytes: libPin.bytes,
    generatedAt: libPin.generatedAt,
    pinSha: catalogJob?.pinSha ?? null,
    engineSource: catalogJob?.engineSource ?? null,
    digest: catalogJob?.stdoutJson?.digest ?? null,
    durationMs: libDurationMs,
  },
  invokeEngine: {
    ok: invoked?.ok ?? null,
    outcomeKind: invoked?.outcome?.kind ?? null,
    derivedExit: derivedExit(invoked?.ok, invoked?.outcome?.kind),
    status: invokePin.status ?? invoked?.stdoutJson?.status ?? null,
    counts: invokePin.counts,
    pinDeltaSha256: invokePin.sha256,
    pinDeltaStableSha256: invokePin.stableSha256,
    pinDeltaMdSha256: invokePin.mdSha256,
    pinDeltaBytes: invokePin.bytes,
    generatedAt: invokePin.generatedAt,
    pinSha: invoked?.pinSha ?? null,
    engineSource: invoked?.engineSource ?? null,
    digest: invoked?.stdoutJson?.digest ?? null,
    durationMs: invokeDurationMs,
  },
  ok: catalogJob?.ok ?? null,
  outcomeKind: catalogJob?.outcome?.kind ?? null,
  status: libPin.status,
  counts: libPin.counts,
  pinDeltaSha256: libPin.sha256,
  pinDeltaStableSha256: libPin.stableSha256,
  durationMs: libDurationMs,
};

const jsonFieldDiffs = {
  cliVsRunCatalogJob: pinDeltaDiffs(cliPin.json, libPin.json),
  runCatalogJobVsInvokeEngine: pinDeltaDiffs(libPin.json, invokePin.json),
};

const outcomeKindMatch =
  cli.outcomeKind === library.outcomeKind && library.outcomeKind === library.invokeEngine.outcomeKind;
const statusMatch = cli.status === library.status && library.status === library.invokeEngine.status;
const countsMatch =
  JSON.stringify(cli.counts) === JSON.stringify(library.counts) &&
  JSON.stringify(library.counts) === JSON.stringify(library.invokeEngine.counts);
const pinDeltaSha256Match =
  Boolean(cli.pinDeltaSha256) &&
  cli.pinDeltaSha256 === library.pinDeltaSha256 &&
  library.pinDeltaSha256 === library.invokeEngine.pinDeltaSha256;
const pinDeltaStableSha256Match =
  Boolean(cli.pinDeltaStableSha256) &&
  cli.pinDeltaStableSha256 === library.pinDeltaStableSha256 &&
  library.pinDeltaStableSha256 === library.invokeEngine.pinDeltaStableSha256;
const pinDeltaMdSha256Match =
  Boolean(cli.pinDeltaMdSha256) &&
  cli.pinDeltaMdSha256 === library.runCatalogJob.pinDeltaMdSha256 &&
  library.runCatalogJob.pinDeltaMdSha256 === library.invokeEngine.pinDeltaMdSha256;
const exitMatch = cli.exitCode === derivedExit(library.ok, library.outcomeKind);
const compositionShaMatch = compositionSha === COMPOSITION_SHA;
const onlyGeneratedAtDiff =
  jsonFieldDiffs.cliVsRunCatalogJob.every((key) => key === "generatedAt") &&
  jsonFieldDiffs.runCatalogJobVsInvokeEngine.every((key) => key === "generatedAt");

const pass = Boolean(
  compositionShaMatch &&
    outcomeKindMatch &&
    statusMatch &&
    countsMatch &&
    exitMatch &&
    pinDeltaStableSha256Match &&
    pinDeltaMdSha256Match &&
    onlyGeneratedAtDiff &&
    cliPin.exists &&
    libPin.exists &&
    invokePin.exists,
);

const mismatches = [];
if (!compositionShaMatch) mismatches.push(`compositionSha observed=${compositionSha} expected=${COMPOSITION_SHA}`);
if (!outcomeKindMatch) {
  mismatches.push(
    `outcomeKind cli=${cli.outcomeKind} runCatalogJob=${library.outcomeKind} invokeEngine=${library.invokeEngine.outcomeKind}`,
  );
}
if (!statusMatch) {
  mismatches.push(`status cli=${cli.status} runCatalogJob=${library.status} invokeEngine=${library.invokeEngine.status}`);
}
if (!countsMatch) {
  mismatches.push(
    `counts cli=${JSON.stringify(cli.counts)} runCatalogJob=${JSON.stringify(library.counts)} invokeEngine=${JSON.stringify(library.invokeEngine.counts)}`,
  );
}
if (!exitMatch) mismatches.push(`exit cli=${cli.exitCode} libraryDerived=${derivedExit(library.ok, library.outcomeKind)}`);
if (!pinDeltaSha256Match) {
  mismatches.push(
    `raw pin-delta.json sha256 cli=${cli.pinDeltaSha256} runCatalogJob=${library.pinDeltaSha256} invokeEngine=${library.invokeEngine.pinDeltaSha256} (generatedAt only=${onlyGeneratedAtDiff})`,
  );
}
if (!pinDeltaStableSha256Match) {
  mismatches.push(
    `stable pin-delta.json sha256 cli=${cli.pinDeltaStableSha256} runCatalogJob=${library.pinDeltaStableSha256} invokeEngine=${library.invokeEngine.pinDeltaStableSha256}`,
  );
}
if (!pinDeltaMdSha256Match) mismatches.push("pin-delta.md sha256 mismatch");
if (!cliPin.exists) mismatches.push("cli pin-delta.json missing");
if (!libPin.exists) mismatches.push("runCatalogJob pin-delta.json missing");
if (!invokePin.exists) mismatches.push("invokeEngine pin-delta.json missing");

const durationMs = Date.now() - wall0;
const detail = pass
  ? `CLI/library match analysis/actionable added=${cli.counts?.added} removed=${cli.counts?.removed} changed=${cli.counts?.changed}; raw pin-delta sha256 differs only at generatedAt (cli=${cli.pinDeltaSha256} lib=${library.pinDeltaSha256} invoke=${library.invokeEngine.pinDeltaSha256})`
  : mismatches.join("; ");

const result = {
  pass,
  compositionSha,
  expectedCompositionSha: COMPOSITION_SHA,
  fixture: {
    family: "lockfile",
    id: "h04-lock-01",
    before: BEFORE,
    after: AFTER,
  },
  cli,
  library,
  pinDeltaSha256Match,
  pinDeltaStableSha256Match,
  pinDeltaMdSha256Match,
  countsMatch,
  outcomeKindMatch,
  statusMatch,
  exitMatch,
  onlyGeneratedAtDiff,
  jsonFieldDiffs,
  durationMs,
  detail,
};

writeFileSync(join(RUNS, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify(
    {
      pass,
      detail,
      durationMs,
      pinDeltaSha256Match,
      pinDeltaStableSha256Match,
      countsMatch,
      cliSha: cli.pinDeltaSha256,
      libSha: library.pinDeltaSha256,
      invokeSha: library.invokeEngine.pinDeltaSha256,
      cliDurationMs,
      libDurationMs,
      invokeDurationMs,
    },
    null,
    2,
  )}\n`,
);
process.exit(0);
