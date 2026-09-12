import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CatalogRefuse, getEngine, loadCatalog } from "./catalog.mjs";
import { classifyInvocation, parseJsonPayload, streamText } from "./classify.mjs";
import { engineBin, ensureEngineRoot } from "./engine-root.mjs";
import { matchCatalogPromise } from "./schema-match.mjs";
import { optionalFlagArgv, usefulStatus } from "./contract.mjs";

function substitute(token, values) {
  const match = String(token).match(/^\{([a-zA-Z]+)\}$/);
  if (!match) return token;
  const value = values[match[1]];
  if (value == null || value === "") {
    throw new CatalogRefuse("missing-input", `missing catalog input ${match[1]}`, { key: match[1] });
  }
  return String(value);
}

function argvFor(engine, request) {
  const values = {
    before: request.inputs?.before,
    after: request.inputs?.after,
    used: request.inputs?.used,
    job: request.inputs?.job,
    fields: request.inputs?.fields,
    clock: request.inputs?.clock,
    outDir: request.outDir,
  };
  if (request.example) {
    return (engine.cli.exampleArgv || ["--example"]).map((token) => substitute(token, values));
  }
  const template = request.mode === "compare" && engine.cli.compareArgv ? engine.cli.compareArgv : engine.cli.argv;
  const argv = template.map((token) => substitute(token, values));
  argv.push(...optionalFlagArgv(request.inputs || {}));
  if (Array.isArray(request.extraArgv)) argv.push(...request.extraArgv);
  return argv;
}

export function invokeEngine(request = {}) {
  const catalog = request.catalog || loadCatalog();
  const engine = getEngine(request.engineId, catalog);
  if (!request.outDir) {
    throw new CatalogRefuse("missing-out-dir", "invoke requires outDir so promised output files can be checked");
  }
  mkdirSync(request.outDir, { recursive: true });

  const located = request.engineRoot
    ? { root: request.engineRoot, source: "request", sha: engine.pin.sha }
    : ensureEngineRoot(engine);
  const bin = engineBin(engine, located.root);
  if (!existsSync(bin)) {
    return {
      ok: false,
      outcome: { kind: "transport-failure", transportOk: false, code: "missing-engine-bin", analysis: null },
      engineId: engine.id,
      pinSha: located.sha,
      engineSource: located.source,
      schemaMatch: { ok: false, mismatches: [{ where: "bin", path: bin }], outputs: [] },
      stdoutJson: null,
      refuseJson: null,
      spawn: { status: null, stdout: "", stderr: "" },
    };
  }

  let argv;
  try {
    argv = argvFor(engine, request);
  } catch (err) {
    if (err instanceof CatalogRefuse) throw err;
    throw err;
  }

  const spawnResult = spawnSync(process.execPath, [bin, ...argv], {
    cwd: located.root,
    encoding: "utf8",
    timeout: request.timeoutMs || 120_000,
    maxBuffer: 8 * 1024 * 1024,
    killSignal: "SIGTERM",
  });
  const timedOut = Boolean(spawnResult.error && spawnResult.error.code === "ETIMEDOUT");

  const stdoutDoc = parseJsonPayload(spawnResult.stdout);
  const refuseText = streamText(spawnResult, engine.refuse.stream);
  const refuseDoc = parseJsonPayload(refuseText);
  const missingOutputs = engine.outputs
    .map((spec) => spec.name)
    .filter((name) => !existsSync(join(request.outDir, name)));
  const outcome = classifyInvocation({
    engine,
    spawnResult,
    stdoutDoc,
    refuseDoc: engine.refuse.stream === "stdout" ? stdoutDoc : refuseDoc,
    missingOutputs,
  });
  const schemaMatch = matchCatalogPromise({
    engine,
    stdoutDoc,
    refuseDoc: engine.refuse.stream === "stderr" ? refuseDoc : stdoutDoc,
    outcome,
    outDir: request.outDir,
  });

  return {
    ok: outcome.kind === "analysis" && schemaMatch.ok,
    catalogId: catalog.id,
    engineId: engine.id,
    pinSha: located.sha,
    engineSource: located.source,
    outcome: {
      ...outcome,
      analysis: outcome.analysis ?? usefulStatus(engine, stdoutDoc),
    },
    schemaMatch,
    stdoutJson: stdoutDoc,
    refuseJson: engine.refuse.stream === "stderr" ? refuseDoc : stdoutDoc,
    spawn: {
      status: spawnResult.status,
      stdout: spawnResult.stdout || "",
      stderr: spawnResult.stderr || "",
      argv,
      bin,
      signal: spawnResult.signal || null,
      timedOut,
      errorCode: spawnResult.error?.code || null,
    },
  };
}

export function runCatalogJob(request = {}) {
  return invokeEngine(request);
}
