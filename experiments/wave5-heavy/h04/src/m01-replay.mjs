import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { loadCatalog } from "./catalog.mjs";
import { compareRun } from "./compare.mjs";
import { H04_ROOT, M01_REPLAY_DIR, M01_WORKTREE, ORACLES_DIR } from "./paths.mjs";
import {
  COMPOSITION_SHA,
  mapExampleToM01,
  m01RunJobPath,
  observedCompositionSha,
} from "./m01.mjs";
import { runCaptured, listFiles } from "./runner.mjs";

function sha256File(path) {
  if (!path || !existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fileSize(path) {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

function resolveInput(dir, value) {
  if (value == null || typeof value !== "string") return value;
  if (isAbsolute(value)) return value;
  return resolve(dir, value);
}

function oraclePaths(example) {
  const local = {
    facts: join(example.dir, "expected-facts.json"),
    refusal: join(example.dir, "expected-refusal.json"),
    noChange: join(example.dir, "expected-no-change.json"),
  };
  const shared = join(ORACLES_DIR, "existing", example.id);
  return {
    facts: existsSync(local.facts) ? local.facts : join(shared, "expected-facts.json"),
    refusal: existsSync(local.refusal) ? local.refusal : join(shared, "expected-refusal.json"),
    noChange: existsSync(local.noChange) ? local.noChange : join(shared, "expected-no-change.json"),
  };
}

function readJsonIf(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { __parseError: true, path };
  }
}

function buildM01Argv(example, m01EngineId, outDir) {
  const args = [m01EngineId];
  const inputs = example.inputs && typeof example.inputs === "object" ? example.inputs : {};
  for (const key of ["before", "after", "used", "job"]) {
    if (inputs[key]) args.push(`--${key}`, String(resolveInput(example.dir, inputs[key])));
  }
  args.push("--out-dir", outDir);
  return args;
}

function outputSizes(outDir) {
  const files = listFiles(outDir);
  const rows = files.map((name) => {
    const path = join(outDir, name);
    return { name, bytes: fileSize(path), sha256: sha256File(path) };
  });
  return {
    files: rows,
    totalBytes: rows.reduce((n, r) => n + (r.bytes || 0), 0),
  };
}

function compareFacts(expectedFacts, stdoutJson, outDir) {
  if (!expectedFacts || expectedFacts.__parseError) {
    return { result: "unknown", reason: "expected-facts-missing" };
  }
  const artifacts = [];
  if (existsSync(join(outDir, "pin-delta.json"))) {
    artifacts.push(JSON.parse(readFileSync(join(outDir, "pin-delta.json"), "utf8")));
  }
  if (existsSync(join(outDir, "drift-brief.json"))) {
    artifacts.push(JSON.parse(readFileSync(join(outDir, "drift-brief.json"), "utf8")));
  }
  if (existsSync(join(outDir, "route-diff.json"))) {
    artifacts.push(JSON.parse(readFileSync(join(outDir, "route-diff.json"), "utf8")));
  }
  if (existsSync(join(outDir, "page-change.json"))) {
    artifacts.push(JSON.parse(readFileSync(join(outDir, "page-change.json"), "utf8")));
  }
  const haystack = JSON.stringify({ stdoutJson, artifacts });
  let facts = expectedFacts.sourceFacts || expectedFacts.facts || [];
  if (!facts.length) {
    facts = [];
    for (const row of expectedFacts.changed || []) {
      facts.push({
        id: row.id || row.name,
        op: "changed",
        package: row.name,
        name: row.name,
        highlight: [
          row.before?.integrity,
          row.after?.integrity,
          row.before?.resolved,
          row.after?.resolved,
        ].filter(Boolean),
      });
    }
    for (const row of expectedFacts.removedPins || expectedFacts.removed || []) {
      const name = typeof row === "string" ? row.split("@")[0] : row.name;
      facts.push({ id: name, op: "changed", package: name, name });
    }
    for (const row of expectedFacts.addedPins || expectedFacts.added || []) {
      const name = typeof row === "string" ? row.split("@")[0] : row.name;
      if (name) facts.push({ id: name, op: "changed", package: name, name });
    }
  }
  const checks = [];
  for (const fact of facts) {
    const idNeedles = []
      .concat(fact.package || [])
      .concat(fact.name || [])
      .concat(fact.pointer || [])
      .concat(fact.path || [])
      .concat(fact.field || [])
      .map(String)
      .filter((s) => s.length >= 2);
    const valueNeedles = []
      .concat(fact.highlight || [])
      .concat(typeof fact.before === "string" && fact.before.length >= 4 ? [fact.before] : [])
      .concat(typeof fact.after === "string" && fact.after.length >= 4 ? [fact.after] : [])
      .concat(fact.integrity?.before || [])
      .concat(fact.integrity?.after || [])
      .map(String)
      .filter((s) => s.length >= 4);
    const presentIds = idNeedles.filter((n) => haystack.includes(n));
    const presentValues = valueNeedles.filter((n) => haystack.includes(n));
    const op = fact.op || "changed";
    let result = "unknown";
    if (op === "unchanged" || op === "noise") {
      // Source-only: useful engines omit unchanged pins/pointers. Not a mismatch.
      result = "source-only";
    } else if (idNeedles.length === 0 && valueNeedles.length === 0) {
      result = "unknown";
    } else if (presentIds.length || presentValues.length) {
      result = "match";
    } else {
      result = "mismatch";
    }
    checks.push({
      fact: fact.id || fact.kind || idNeedles[0] || "fact",
      op,
      idNeedles,
      presentIds,
      presentValues,
      result,
    });
  }
  if (!checks.length) return { result: "unknown", reason: "no-source-facts", checks };
  const engineChecks = checks.filter((c) => c.result !== "source-only");
  if (engineChecks.some((c) => c.result === "mismatch")) return { result: "mismatch", checks };
  if (engineChecks.length && engineChecks.every((c) => c.result === "match")) {
    return { result: "match", checks };
  }
  if (engineChecks.length === 0) return { result: "source-only", checks };
  return { result: "unknown", checks };
}

function compareRefusal(expectedRefusal, captured, stdoutJson) {
  if (!expectedRefusal || expectedRefusal.__parseError) {
    return { result: "unknown", reason: "expected-refusal-missing" };
  }
  const want = expectedRefusal.expected === true;
  const refused =
    captured.exitCode === 2 ||
    stdoutJson?.refused === true ||
    stdoutJson?.ok === false;
  if (want === false && captured.exitCode === 0) {
    return { result: "match", expected: false, actualRefused: false };
  }
  if (want === true && refused) {
    const code = stdoutJson?.code || expectedRefusal.code;
    return { result: "match", expected: true, actualRefused: true, code };
  }
  if (want === false && refused) {
    return { result: "mismatch", expected: false, actualRefused: true, exitCode: captured.exitCode };
  }
  if (want === true && !refused) {
    return { result: "mismatch", expected: true, actualRefused: false, exitCode: captured.exitCode };
  }
  return { result: "unknown", expected: want, exitCode: captured.exitCode };
}

export async function replayOne(example, { worktree = M01_WORKTREE, runsDir = M01_REPLAY_DIR } = {}) {
  const mapping = mapExampleToM01(example);
  const runDir = join(runsDir, example.id);
  const outDir = join(runDir, "out");
  mkdirSync(outDir, { recursive: true });
  const oracles = oraclePaths(example);
  const expectedFacts = readJsonIf(oracles.facts);
  const expectedRefusal = readJsonIf(oracles.refusal);
  const expectedNoChange = readJsonIf(oracles.noChange);

  const record = {
    exampleId: example.id,
    family: example.family,
    compositionSha: COMPOSITION_SHA,
    observedSha: observedCompositionSha(worktree),
    mapping,
    oracles: {
      facts: existsSync(oracles.facts) ? oracles.facts : null,
      refusal: existsSync(oracles.refusal) ? oracles.refusal : null,
      noChange: existsSync(oracles.noChange) ? oracles.noChange : null,
    },
  };

  if (mapping.mapping !== "ok" || !mapping.m01EngineId) {
    record.skipped = true;
    record.mappingFailure = {
      mapping: mapping.mapping,
      note: mapping.note,
      sds52Job: mapping.sds52Job || null,
    };
    writeFileSync(join(runDir, "meta.json"), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  const cli = m01RunJobPath(worktree);
  const args = buildM01Argv(example, mapping.m01EngineId, outDir);
  const captured = await runCaptured({
    argv: [process.execPath, cli, ...args],
    cwd: worktree,
    timeoutMs: 120_000,
    outDir,
  });
  let stdoutJson = null;
  try {
    stdoutJson = JSON.parse(String(captured.stdout || "").trim());
  } catch {
    const start = String(captured.stdout || "").indexOf("{");
    const end = String(captured.stdout || "").lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        stdoutJson = JSON.parse(captured.stdout.slice(start, end + 1));
      } catch {
        stdoutJson = null;
      }
    }
  }

  const sizes = outputSizes(outDir);
  record.m01EngineId = mapping.m01EngineId;
  record.skipped = false;
  record.argv = captured.argv;
  record.cwd = captured.cwd;
  record.exitCode = captured.exitCode;
  record.ok = captured.ok === true && captured.exitCode === 0;
  record.durationMs = captured.durationMs;
  record.stdoutBytes = Buffer.byteLength(captured.stdout || "");
  record.stderrBytes = Buffer.byteLength(captured.stderr || "");
  record.outputs = sizes;
  record.stdoutStatus =
    stdoutJson?.outcome?.analysis ||
    stdoutJson?.stdoutJson?.status ||
    stdoutJson?.stdoutJson?.outcome ||
    stdoutJson?.stdoutJson?.report?.verdict ||
    stdoutJson?.status ||
    null;
  record.outcomeKind = stdoutJson?.outcome?.kind || null;
  record.pinSha = stdoutJson?.pinSha || null;
  record.schemaMatchOk = stdoutJson?.schemaMatch?.ok ?? null;
  record.factsCompare = compareFacts(expectedFacts, stdoutJson, outDir);
  record.refusalCompare = compareRefusal(expectedRefusal, captured, stdoutJson);
  record.noChange = expectedNoChange;
  record.reportCompare = compareRun({
    expectedPath: example.expectedReportPath,
    example,
    outDir,
    stdout: captured.stdout,
    stderr: captured.stderr,
    exitCode: captured.exitCode,
  });

  writeFileSync(join(runDir, "stdout.txt"), captured.stdout || "");
  writeFileSync(join(runDir, "stderr.txt"), captured.stderr || "");
  writeFileSync(join(runDir, "meta.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export async function replayAll(options = {}) {
  const catalog = loadCatalog({ examplesDir: options.examplesDir });
  const runsDir = options.runsDir || M01_REPLAY_DIR;
  mkdirSync(runsDir, { recursive: true });
  const observedSha = observedCompositionSha(options.worktree || M01_WORKTREE);
  const runs = [];
  const mappingFailures = [];
  for (const example of catalog.examples) {
    const row = await replayOne(example, options);
    runs.push(row);
    if (row.mappingFailure) mappingFailures.push({ id: row.exampleId, ...row.mappingFailure });
  }
  const summary = {
    at: new Date().toISOString(),
    compositionSha: COMPOSITION_SHA,
    observedSha,
    h04Root: H04_ROOT,
    exampleCount: catalog.examples.length,
    replayed: runs.filter((r) => r.skipped !== true).length,
    skipped: runs.filter((r) => r.skipped === true).length,
    mappingFailures,
    durationsMs: Object.fromEntries(runs.filter((r) => r.durationMs != null).map((r) => [r.exampleId, r.durationMs])),
    outputBytes: Object.fromEntries(runs.filter((r) => r.outputs).map((r) => [r.exampleId, r.outputs.totalBytes])),
    runs,
  };
  mkdirSync(join(H04_ROOT, "runs/measurements"), { recursive: true });
  writeFileSync(join(runsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(
    join(H04_ROOT, "runs/measurements/m01-replay.json"),
    `${JSON.stringify(
      {
        compositionSha: COMPOSITION_SHA,
        observedSha,
        at: summary.at,
        replayed: summary.replayed,
        skipped: summary.skipped,
        mappingFailures,
        durationsMs: summary.durationsMs,
        outputBytes: summary.outputBytes,
        note: "Wall-clock durationMs of clean CLI invocations. Not a hosting bill or CPU-cost claim.",
      },
      null,
      2,
    )}\n`,
  );
  return summary;
}
