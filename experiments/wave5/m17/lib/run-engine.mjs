import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { classifyEngineResult, parseCliJson } from "./classify.mjs";
import { SDS_ROOT } from "./pins.mjs";
import { ensureEngine } from "./resolve-engine.mjs";

export function runRouteDiffCli({
  before,
  after,
  outDir,
  extraArgs = [],
  example = false,
  timeoutMs = 60_000,
} = {}) {
  let engine;
  try {
    engine = ensureEngine();
  } catch (err) {
    return {
      missingEngine: true,
      status: null,
      signal: null,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      json: null,
      engine: null,
      classification: classifyEngineResult({ missingEngine: true }),
    };
  }

  const args = [];
  if (example) argsExample(args);
  else {
    if (!before || !after) {
      throw new Error("runRouteDiffCli requires --before and --after unless example is true");
    }
    args.push("--before", before, "--after", after);
  }
  if (!outDir) throw new Error("runRouteDiffCli requires outDir");
  args.push("--out-dir", outDir, ...extraArgs);

  const spawned = spawnSync(process.execPath, [engine.cli, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const json = parseCliJson(spawned.stdout);
  const wrapped = {
    missingEngine: false,
    status: spawned.status,
    signal: spawned.signal,
    stdout: spawned.stdout || "",
    stderr: spawned.stderr || "",
    json,
    engine,
    error: spawned.error || null,
  };
  wrapped.classification = classifyEngineResult(wrapped);
  return wrapped;
}

function argsExample(args) {
  args.push("--example");
}

export function runEnginePackageTests(engine = ensureEngine()) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const tests = [
    "tools/route-table-diff/test/journey.test.mjs",
    "tools/route-table-diff/test/local-http.test.mjs",
    "tools/route-table-diff/test/seeded-failures.test.mjs",
    "tools/route-table-diff/test/snapshot.test.mjs",
  ].map((rel) => join(engine.repoRoot, rel));
  return spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...tests], {
    cwd: SDS_ROOT,
    env,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}
