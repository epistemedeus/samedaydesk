import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_JOURNEY,
  ENGINE_REPORT_SCHEMA,
  PIN,
  REPO_ROOT,
  TRIAL_SCHEMA,
  WRAPPER_CLI,
  WRAPPER_SHA,
} from "./pins.mjs";
import { TrialRefuse, TrialTransport, trialRefuse, trialTransport } from "./errors.mjs";
import { materializePinnedEngine, runEngineCli } from "./engine-bind.mjs";
import { sha256Bytes, stageLockPair } from "./git-stage.mjs";
import { parseLockJson, joinResolved, resolvedOnlyOmitted, assertUnlikeTermsHashes } from "./resolved-join.mjs";
import { analysisOutcome, classifySpawn } from "./classify.mjs";
import { toMarkdown } from "./format.mjs";
import { disclosureHash, trialBodyDigest } from "./terms.mjs";
import { stageFromUrls } from "./http-stage.mjs";

function tmpWork() {
  return mkdtempSync(join(tmpdir(), "w5-m16-trial-"));
}

function checkoutHead(repoRoot) {
  const r = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

function readEngineReport(outDir) {
  const jsonPath = join(outDir, "pin-delta.json");
  if (!existsSync(jsonPath)) return null;
  return JSON.parse(readFileSync(jsonPath, "utf8"));
}

function deliveryFiles(outDir, extras) {
  const names = ["trial-result.json", "trial.md", ...extras];
  return names
    .map((name) => ({ name, path: join(outDir, name), exists: existsSync(join(outDir, name)) }))
    .filter((f) => f.exists || f.name.startsWith("trial"));
}

export async function resolveInputs(args, { repoRoot = REPO_ROOT, workDir } = {}) {
  const work = workDir || tmpWork();
  const hasExplicit =
    args.journey ||
    args["before-ref"] ||
    args["after-ref"] ||
    args["before-url"] ||
    args["after-url"] ||
    args.before ||
    args.after ||
    args.example === true;
  const journeyId = args.journey
    ? String(args.journey)
    : hasExplicit
      ? null
      : DEFAULT_JOURNEY;
  if (journeyId) {
    const journey = PIN.journeys[journeyId];
    if (!journey) throw trialRefuse("unknown-journey", `unknown journey ${journeyId}`, { journeyId });
    const staged = stageLockPair({
      repoRoot,
      beforeRef: journey.beforeRef,
      afterRef: journey.afterRef,
      lockPath: journey.lockPath,
      destDir: join(work, "stage"),
    });
    return {
      ...staged,
      journey: { id: journeyId, ...journey },
      work,
      provenance: "git-revision-pair",
    };
  }

  if (args["before-ref"] || args["after-ref"]) {
    if (!args["before-ref"] || !args["after-ref"]) {
      throw trialRefuse("missing-required-inputs", "git mode requires --before-ref and --after-ref", {
        missing: ["before-ref", "after-ref"].filter((k) => !args[k]),
      });
    }
    const staged = stageLockPair({
      repoRoot,
      beforeRef: String(args["before-ref"]),
      afterRef: String(args["after-ref"]),
      lockPath: String(args["lock-path"] || "package-lock.json"),
      destDir: join(work, "stage"),
    });
    return {
      ...staged,
      journey: {
        id: "caller-git",
        beforeRef: String(args["before-ref"]),
        afterRef: String(args["after-ref"]),
        lockPath: String(args["lock-path"] || "package-lock.json"),
      },
      work,
      provenance: "git-revision-pair",
    };
  }

  if (args["before-url"] || args["after-url"]) {
    if (!args["before-url"] || !args["after-url"]) {
      throw trialRefuse("missing-required-inputs", "URL mode requires --before-url and --after-url");
    }
    const staged = await stageFromUrls({
      beforeUrl: String(args["before-url"]),
      afterUrl: String(args["after-url"]),
      destDir: join(work, "stage"),
    });
    return { ...staged, journey: { id: "caller-http" }, work, provenance: "http-staged" };
  }

  if (args.example === true) {
    throw trialRefuse(
      "example-is-not-real-project-trial",
      "Use --journey or --before/--after git refs. --example is the engine fixture, not a real-project trial",
    );
  }

  if (!args.before || !args.after) {
    throw trialRefuse(
      "missing-required-inputs",
      "Requires --journey, or --before-ref/--after-ref, or --before/--after files, or --before-url/--after-url",
    );
  }

  return {
    beforePath: resolve(String(args.before)),
    afterPath: resolve(String(args.after)),
    journey: { id: "caller-files" },
    work,
    provenance: "caller-files",
  };
}

export function buildReport({
  inputs,
  engineBind,
  spawn,
  engineReport,
  outDir,
  repoRoot = REPO_ROOT,
}) {
  const classified = classifySpawn(spawn);
  const tested = {
    engineRepo: PIN.engine.repo,
    engineSha: engineBind.sha,
    enginePath: PIN.engine.path,
    engineSource: engineBind.source,
    wrapperSha: WRAPPER_SHA,
    checkoutHead: checkoutHead(repoRoot),
    lockPath: inputs.journey?.lockPath || "package-lock.json",
  };

  const payment = {
    purchaseAuthority: false,
    sold: false,
    liveSettlement: "out-of-scope",
    fieldExecution: "not-performed",
  };

  if (classified.layer === "transport") {
    return {
      schema: TRIAL_SCHEMA,
      ok: false,
      refused: false,
      transport: { ok: false, outcome: classified.outcome, code: classified.code, status: spawn?.status ?? null },
      analysis: { outcome: "not-run", validRefusal: false, validNoChange: false, code: classified.code },
      engine: { status: null, stdout: spawn?.json || null },
      delivery: { complete: false, outputs: [] },
      payment,
      tested,
      journey: inputs.journey,
      error: spawn?.stderr || spawn?.error?.message || classified.outcome,
    };
  }

  if (classified.outcome === "refused") {
    return {
      schema: TRIAL_SCHEMA,
      ok: true,
      refused: true,
      transport: { ok: true, outcome: "ok", code: null, status: spawn.status },
      analysis: {
        outcome: "refused",
        validRefusal: true,
        validNoChange: false,
        code: classified.code,
        engineStatus: null,
      },
      engine: { status: null, stdout: spawn.json, reportSchema: ENGINE_REPORT_SCHEMA },
      delivery: { complete: true, outputs: ["trial-result.json", "trial.md"] },
      payment,
      tested,
      journey: inputs.journey,
      changed: [],
      added: [],
      removed: [],
      omittedResolved: [],
    };
  }

  const beforeDoc = parseLockJson(inputs.beforePath, "before");
  const afterDoc = parseLockJson(inputs.afterPath, "after");
  const report = engineReport || { changed: [], added: [], removed: [], counts: {}, status: spawn.json?.status };
  const joined = joinResolved(report, beforeDoc, afterDoc);
  const omittedResolved = resolvedOnlyOmitted(beforeDoc, afterDoc, report);
  const missingIntegrity = report.counts?.missingIntegrity || 0;
  const outcome = analysisOutcome({
    engineStatus: report.status,
    changed: joined.changed,
    added: joined.added,
    removed: joined.removed,
    omittedResolved,
    missingIntegrity,
  });

  const staged = {
    beforeSha256: inputs.beforeSha256 || sha256Bytes(readFileSync(inputs.beforePath)),
    afterSha256: inputs.afterSha256 || sha256Bytes(readFileSync(inputs.afterPath)),
    provenance: inputs.provenance,
  };

  const firstPinHash = joined.changed[0]?.after?.termsHash || joined.added[0]?.termsHash || null;
  const disc = disclosureHash({
    package: joined.changed[0]?.name || null,
    version: joined.changed[0]?.after?.version || null,
  });
  const bodyForDigest = {
    changed: joined.changed,
    added: joined.added,
    removed: joined.removed,
    omittedResolved,
    staged,
  };
  const digest = trialBodyDigest(bodyForDigest);
  assertUnlikeTermsHashes({ pinTermsHash: firstPinHash, disclosureHash: disc, trialDigest: digest });

  const outputs = ["trial-result.json", "trial.md"];
  if (existsSync(join(outDir, "pin-delta.json"))) outputs.push("pin-delta.json");
  if (existsSync(join(outDir, "pin-delta.md"))) outputs.push("pin-delta.md");

  return {
    schema: TRIAL_SCHEMA,
    ok: true,
    refused: false,
    transport: { ok: true, outcome: "ok", code: null, status: spawn.status },
    analysis: {
      outcome,
      validRefusal: false,
      validNoChange: outcome === "no-change",
      code: null,
      engineStatus: report.status || spawn.json?.status || null,
      engineOmittedResolved: omittedResolved.length > 0,
    },
    engine: {
      status: report.status || spawn.json?.status || null,
      counts: report.counts || spawn.json?.counts || null,
      stdout: spawn.json,
      reportSchema: ENGINE_REPORT_SCHEMA,
    },
    delivery: { complete: outputs.every((n) => existsSync(join(outDir, n)) || n.startsWith("trial")), outputs },
    payment,
    tested,
    journey: inputs.journey,
    staged,
    changed: joined.changed,
    added: joined.added,
    removed: joined.removed,
    omittedResolved,
    unlikeTerms: {
      pinTermsHash: firstPinHash,
      disclosureHash: disc,
      trialDigest: digest,
      forcedEqual: false,
    },
    purchaseAuthority: false,
  };
}

export async function runTrial(args, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const outDir = args["out-dir"] ? resolve(String(args["out-dir"])) : join(tmpWork(), "out");
  mkdirSync(outDir, { recursive: true });

  const inputs = await resolveInputs(args, { repoRoot, workDir: options.workDir });
  const engineBind = materializePinnedEngine({
    repoRoot,
    engineRoot: args["engine-root"] ? resolve(String(args["engine-root"])) : options.engineRoot,
  });
  const spawn = runEngineCli({
    cli: engineBind.cli,
    beforePath: inputs.beforePath,
    afterPath: inputs.afterPath,
    outDir,
  });
  const engineReport = readEngineReport(outDir);
  const report = buildReport({ inputs, engineBind, spawn, engineReport, outDir, repoRoot });
  writeFileSync(join(outDir, "trial-result.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, "trial.md"), toMarkdown(report));
  report.outDir = outDir;
  report.delivery = {
    complete: existsSync(join(outDir, "trial-result.json")) && existsSync(join(outDir, "trial.md")),
    outputs: deliveryFiles(outDir, ["pin-delta.json", "pin-delta.md"]).map((f) => f.name),
  };
  return report;
}

export function runCatalogBinding({ repoRoot = REPO_ROOT } = {}) {
  if (!existsSync(WRAPPER_CLI)) {
    throw trialTransport("wrapper-cli-missing", `F08 CLI not found: ${WRAPPER_CLI}`, { WRAPPER_CLI });
  }
  const list = spawnSync(process.execPath, [WRAPPER_CLI, "list"], {
    encoding: "utf8",
    cwd: repoRoot,
    timeout: 30_000,
  });
  let jobs = [];
  try {
    jobs = JSON.parse(list.stdout).jobs || [];
  } catch {
    jobs = [];
  }
  const unknown = spawnSync(
    process.execPath,
    [WRAPPER_CLI, "run", "lockfile-pin-delta", "--before", "nope.json", "--after", "nope.json"],
    { encoding: "utf8", cwd: repoRoot, timeout: 30_000 },
  );
  let unknownJson = null;
  try {
    unknownJson = JSON.parse(String(unknown.stdout || "").trim());
  } catch {
    unknownJson = null;
  }
  return {
    schema: "samedaydesk.wave5.m16.catalog-binding.v1",
    wrapperSha: WRAPPER_SHA,
    listStatus: list.status,
    jobs,
    lockfilePinDeltaInCatalog: jobs.includes("lockfile-pin-delta"),
    unknownJob: {
      status: unknown.status,
      code: unknownJson?.code || null,
      ok: unknownJson?.ok ?? null,
    },
    remainingBinding: "W5-M01/W5-D01 must admit a catalog job id before this trial can run through paid wrappers",
    purchaseAuthority: false,
  };
}
