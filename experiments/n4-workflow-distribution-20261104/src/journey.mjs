import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bindCapabilityCall } from "../../../server/lib/observatory/maintained-capability.js";
import { assessCase, findPrivateKey, installDirectRoute } from "./fit.mjs";
import { experimentRoot, ghostDestination, ghostSync, repoRoot, tableCheck } from "./paths.mjs";
import { loadPins, verifyAssets } from "./pins.mjs";
import { kitRootFrom, readInstall } from "./state.mjs";

const RESULT_SCHEMA = "n4.workflow-distribution.result.v1";
const RECIPE_VERSION = "samedaydesk.recurring-job-recipe-result.v1";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function baseResult(extra) {
  const pins = loadPins();
  return {
    schema: RESULT_SCHEMA,
    workflowVersion: pins.workflowVersion,
    executed: false,
    difyStarted: false,
    ghostServerStarted: false,
    producerInvoked: false,
    transfer: {
      sent: false,
      target: "a later caller of tools/result-reuse/cli.mjs decide-or-reuse with the same before-work manifest and bound-observation.json",
      artifact: null,
      command: null,
    },
    cannotEstablish: [
      "a distinct later accepted task took this reuse",
      "recompute cost avoided net of upkeep",
      "that this run is an independent consumer",
      "that Dify or Ghost was started",
    ],
    assets: {
      embed: pins.embed,
      recur: pins.recur,
      native: {
        recipeCommit: pins.native.recipeCommit,
        recipePath: pins.native.recipePath,
        archiveCommit: pins.native.archiveCommit,
        archiveSha256: pins.native.archiveSha256,
      },
      dify: {
        repository: pins.dify.repository,
        commit: pins.dify.commit,
        inThisRepoHistory: false,
      },
      ghost: {
        repository: pins.ghost.repository,
        commit: pins.ghost.commit,
        inThisRepoHistory: false,
      },
    },
    ...extra,
  };
}

function spawnNode(args, cwd) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function parseLastJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.lastIndexOf("\n{");
    if (start === -1) return null;
    try {
      return JSON.parse(trimmed.slice(start + 1));
    } catch {
      return null;
    }
  }
}

function projectProducer(raw) {
  if (!raw || typeof raw !== "object") return null;
  const evidence = raw.evidence && typeof raw.evidence === "object" ? raw.evidence : {};
  const recovery = raw.recovery && typeof raw.recovery === "object" ? raw.recovery : {};
  return {
    recipeId: raw.recipeId,
    schema: raw.schema,
    outcome: raw.outcome,
    recovery: {
      action: recovery.action ?? null,
      operatorNext: recovery.operatorNext ?? null,
    },
    evidence: {
      kind: evidence.kind ?? null,
      contentHash: evidence.contentHash ?? null,
      changed: Array.isArray(evidence.changed) ? evidence.changed : [],
      unchanged: Array.isArray(evidence.unchanged) ? evidence.unchanged : [],
    },
  };
}

function runProducer(fit, clock, horizonHours) {
  const pins = loadPins();
  const cli = join(repoRoot, pins.native.recipeCli);
  const fields = fitCaseFields(fit);
  const ran = spawnNode([
    cli,
    "--recipe",
    "source-change-alert",
    "--prior",
    fit.paths.prior,
    "--current-fixture",
    fit.paths.capture,
    "--fields",
    fields.join(","),
    "--schedule",
    "once",
    "--clock",
    clock,
    "--horizon",
    String(horizonHours),
  ], repoRoot);
  const raw = parseLastJson(ran.stdout || "");
  return { status: ran.status, raw, projected: projectProducer(raw) };
}

function fitCaseFields(fit) {
  return fit.fields;
}

function decideArgs(fit, doc, extra) {
  const pins = loadPins();
  return [
    join(repoRoot, pins.recur.path),
    "decide-or-reuse",
    "--input",
    fit.paths.beforeWork,
    "--task-id",
    doc.taskId,
    "--subject",
    doc.subject,
    "--sequence",
    String(doc.sequence),
    "--clock",
    doc.clock,
    "--horizon",
    String(doc.horizonHours),
    ...extra,
  ];
}

function runKit(fit, doc, outDir) {
  const kit = kitRootFrom(fit.stateDir);
  const nativeOut = join(outDir, "native");
  mkdirSync(nativeOut, { recursive: true });
  const argv = bindCapabilityCall(fit.owned.callRecipe, {
    "--job": fit.paths.pageJob,
    "--out-dir": nativeOut,
  });
  if (!argv) return { ok: false, message: "owned call recipe did not bind" };
  const ran = spawnNode(argv.slice(1), kit);
  let report = null;
  try {
    report = readReport(readJson(join(nativeOut, "page-change.json")));
  } catch {
    report = null;
  }
  return {
    ok: ran.status === 0 && report !== null,
    status: ran.status,
    jobId: doc.jobId,
    version: fit.owned.version,
    review: fit.owned.review,
    report: summarizeReport(report),
  };
}

function readReport(value) {
  if (!value || typeof value !== "object") return null;
  if (value.summary && value.claims) return value;
  if (value.report?.summary && value.report?.claims) return value.report;
  if (value.ok?.report?.summary && value.ok?.report?.claims) return value.ok.report;
  return null;
}

function summarizeReport(report) {
  if (!report || typeof report !== "object") return null;
  const summary = report.summary && typeof report.summary === "object" ? report.summary : {};
  const claims = report.claims && typeof report.claims === "object" ? report.claims : {};
  return {
    schema: report.schema ?? null,
    verdict: report.verdict ?? null,
    matched: summary.matched ?? null,
    semantic: summary.semantic ?? null,
    usefulOutputProven: claims.usefulOutputProven ?? null,
    paymentImpliesUsefulOutput: claims.paymentImpliesUsefulOutput ?? null,
    fresh: claims.fresh ?? null,
  };
}

function runTable(fit, doc, outDir) {
  const fieldsPath = join(outDir, "reader-fields.json");
  const tablePath = join(outDir, "table.json");
  writeJson(fieldsPath, doc.readerFields);
  const ran = spawnSync("python3", [
    tableCheck,
    fit.paths.readerRecord,
    fieldsPath,
    String(doc.readerPage),
    tablePath,
  ], {
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (ran.status !== 0) {
    return { ok: false, status: "checker_failed", csv: "", fitting: false };
  }
  const result = readJson(tablePath);
  return {
    ok: true,
    status: result.status,
    csv: typeof result.csv === "string" ? result.csv : "",
    rowCount: result.provenance?.row_count ?? null,
    checker: result.provenance?.checker ?? null,
    retryable: result.retryable === true,
    fitting: result.status === "ok",
    handoff: typeof result.handoff === "string" ? result.handoff : null,
  };
}

async function runGhost(fit, stateDir) {
  const posts = readJson(fit.paths.ghostPosts);
  const { createDestination } = await import(pathToFileURL(ghostDestination).href);
  const { createJournal, syncPublishedPosts } = await import(pathToFileURL(ghostSync).href);
  const destination = createDestination();
  const catalogPath = join(stateDir, "catalog.json");
  let seeded = 0;
  try {
    const existing = readJson(catalogPath);
    if (Array.isArray(existing)) {
      for (const row of existing) {
        destination.put(row, row.effect_id);
        seeded += 1;
      }
    }
  } catch {
    seeded = 0;
  }
  const before = destination.stats().writeCount;
  const journal = createJournal();
  const decisions = await syncPublishedPosts(posts, destination, journal);
  const rows = destination.list();
  writeJson(catalogPath, rows);
  return {
    decisions: decisions.map((item) => ({
      decision: item.decision,
      ghost_id: item.ghost_id,
    })),
    writes: destination.stats().writeCount - before,
    seeded,
    rows: rows.map((row) => ({
      ghost_id: row.ghost_id,
      status: row.status,
      title: row.title,
      slug: row.slug,
      url: row.url,
      updated_at: row.updated_at,
      published_at: row.published_at,
      content_sha256: row.content_sha256,
    })),
    fullRows: rows,
  };
}

function transferCommand(doc) {
  return [
    "node",
    "tools/result-reuse/cli.mjs",
    "decide-or-reuse",
    "--input",
    "<the same before-work manifest>",
    "--decision",
    "bound-observation.json",
    "--task-id",
    doc.taskId,
    "--subject",
    doc.subject,
    "--sequence",
    String(doc.sequence),
    "--clock",
    doc.clock,
    "--horizon",
    String(doc.horizonHours),
    "--opt-in",
  ];
}

function attachReuse(result, verdict, artifactReady) {
  result.reuse = {
    verdict: verdict?.verdict ?? null,
    reason: verdict?.reason ?? null,
    producerInvoked: false,
    outcome: verdict?.decision?.useful?.outcome ?? null,
    recovery: verdict?.decision?.useful?.recovery?.action ?? null,
    statement: verdict?.decision?.statement ?? null,
    inputDigest: verdict?.inputDigest ?? verdict?.decision?.inputDigest ?? null,
    liveMetric: verdict?.liveMetric ?? {
      distinctLaterAcceptedTasksTakingReuse: null,
      recomputeCostAvoidedNetOfUpkeep: "costs_unknown",
    },
    cannotEstablish: verdict?.cannotEstablish ?? result.cannotEstablish,
  };
  if (artifactReady) {
    result.transfer.artifact = "bound-observation.json";
    result.transfer.command = transferCommand(result.identity);
    result.transfer.sent = false;
  }
}

export async function runJourney({ stateDir, inputPath, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const resultPath = join(outDir, "result.json");
  let doc;
  try {
    doc = readJson(inputPath);
  } catch {
    const result = baseResult({
      outcome: "no-fit",
      reason: "unreadable_input",
      directRoute: {
        executed: false,
        selected: false,
        argv: null,
        note: "The input file could not be read as JSON. Nothing was run.",
      },
    });
    writeJson(resultPath, result);
    return { exitCode: 0, result };
  }

  const installed = readInstall(stateDir);
  if (!installed) {
    const result = baseResult({
      outcome: "no-fit",
      reason: "not_installed",
      directRoute: installDirectRoute(),
    });
    writeJson(resultPath, result);
    return { exitCode: 0, result };
  }

  const assets = verifyAssets(experimentRoot);
  if (!assets.ok) {
    const result = baseResult({
      outcome: "no-fit",
      reason: "pin_mismatch",
      directRoute: {
        executed: false,
        selected: false,
        argv: null,
        note: "Admitted asset bytes do not match PINS.json. Nothing was run.",
      },
    });
    writeJson(resultPath, result);
    return { exitCode: 0, result };
  }

  const fit = assessCase(doc, dirname(inputPath));
  if (!fit.ok) {
    const result = baseResult({
      outcome: fit.reason === "private_field" ? "rejected" : "no-fit",
      reason: fit.reason,
      directRoute: fit.directRoute,
      privateKey: fit.privateKey ?? null,
      liveKey: fit.liveKey ?? null,
      jobId: fit.jobId ?? null,
    });
    writeJson(resultPath, result);
    return { exitCode: 0, result };
  }

  const manifest = readJson(fit.paths.beforeWork);
  if (manifest?.recipeId !== "source-change-alert" || manifest?.recipeVersion !== RECIPE_VERSION) {
    const result = baseResult({
      outcome: "no-fit",
      reason: "input_not_before_work",
      directRoute: {
        executed: false,
        selected: true,
        argv: [
          "node",
          "tools/result-reuse/cli.mjs",
          "decide-or-reuse",
          "--input",
          "<before-work.json>",
          "--decision",
          "<observation.json>",
          "--task-id",
          "<task>",
          "--subject",
          "<subject>",
          "--sequence",
          "<n>",
          "--clock",
          "<ISO-UTC>",
          "--horizon",
          "<hours>",
          "--opt-in",
        ],
        note: "The before-work file is not a source-change-alert manifest. The direct decide-or-reuse command was not run.",
      },
    });
    writeJson(resultPath, result);
    return { exitCode: 0, result };
  }

  const sideFiles = [fit.paths.beforeWork, fit.paths.prior, fit.paths.capture, fit.paths.readerRecord, fit.paths.ghostPosts, fit.paths.pageJob];
  try {
    const pageJob = readJson(fit.paths.pageJob);
    const jobDir = dirname(fit.paths.pageJob);
    for (const name of ["before", "after"]) {
      if (typeof pageJob[name] === "string" && pageJob[name].length > 0) {
        sideFiles.push(isAbsolute(pageJob[name]) ? pageJob[name] : resolve(jobDir, pageJob[name]));
      }
    }
  } catch {
    sideFiles.push(fit.paths.pageJob);
  }
  for (const file of sideFiles) {
    let body;
    try {
      body = readJson(file);
    } catch {
      continue;
    }
    const found = findPrivateKey(body);
    if (found) {
      const result = baseResult({
        outcome: "rejected",
        reason: "private_field",
        privateKey: found.key,
        directRoute: {
          executed: false,
          selected: false,
          argv: null,
          note: "A private field is present in a held input. It was not copied and nothing was run.",
        },
      });
      writeJson(resultPath, result);
      return { exitCode: 0, result };
    }
  }

  fit.stateDir = stateDir;
  fit.fields = doc.sourceChange.fields;
  const result = baseResult({
    outcome: "delivered",
    executed: true,
    identity: {
      taskId: doc.taskId,
      subject: doc.subject,
      sequence: doc.sequence,
      clock: doc.clock,
    },
  });

  const native = runKit(fit, doc, outDir);
  result.native = native;

  let producerInvoked = false;
  let verdict = null;
  if (fit.paths.savedDecision) {
    const flags = doc.optInWithdrawn === true ? ["--withdraw-opt-in"] : ["--opt-in"];
    const asked = spawnNode(decideArgs(fit, doc, ["--decision", fit.paths.savedDecision, ...flags]), repoRoot);
    verdict = parseLastJson(asked.stdout || "") || parseLastJson(asked.stderr || "");
    if (verdict?.verdict === "reuse") {
      writeFileSync(join(outDir, "bound-observation.json"), readFileSync(fit.paths.savedDecision));
      attachReuse(result, verdict, true);
    } else if (verdict?.verdict === "rejected") {
      result.outcome = "rejected";
      attachReuse(result, verdict, false);
    }
  }

  const needsProducer = !verdict || verdict.verdict === "recompute";
  if (needsProducer && result.outcome !== "rejected") {
    const produced = runProducer(fit, doc.clock, doc.horizonHours);
    producerInvoked = true;
    if (produced.projected) writeJson(join(outDir, "producer-result.json"), produced.projected);
    const useful = produced.projected
      && ["unchanged", "changed", "partial"].includes(produced.projected.outcome)
      && produced.projected.evidence.contentHash === manifest.capture?.contentHash;
    if (!useful) {
      result.outcome = native.ok ? "withheld" : "partial";
      result.reuse = {
        verdict: "recompute",
        reason: produced.projected?.outcome || "producer_failed",
        producerInvoked: true,
        outcome: produced.projected?.outcome ?? null,
        recovery: produced.projected?.recovery?.action ?? null,
        statement: null,
        inputDigest: null,
        liveMetric: {
          distinctLaterAcceptedTasksTakingReuse: null,
          recomputeCostAvoidedNetOfUpkeep: "costs_unknown",
        },
      };
    } else {
      const producedPath = join(outDir, "produced-for-bind.json");
      writeJson(producedPath, produced.projected);
      const boundPath = join(outDir, "bound-observation.json");
      const bound = spawnNode(decideArgs(fit, doc, ["--produced", producedPath, "--out", boundPath, "--opt-in"]), repoRoot);
      const receipt = parseLastJson(bound.stdout || "") || parseLastJson(bound.stderr || "");
      if (bound.status !== 0 || !receipt?.ok) {
        result.outcome = "partial";
        result.reuse = {
          verdict: null,
          reason: "bind_failed",
          producerInvoked: true,
          message: receipt?.message ?? null,
          liveMetric: {
            distinctLaterAcceptedTasksTakingReuse: null,
            recomputeCostAvoidedNetOfUpkeep: "costs_unknown",
          },
        };
      } else {
        attachReuse(result, { ...receipt, verdict: "bound", decision: receipt.decision }, true);
        result.reuse.producerInvoked = true;
        result.reuse.verdict = "bound";
      }
    }
  }

  result.producerInvoked = producerInvoked;
  if (result.reuse) result.reuse.producerInvoked = producerInvoked && result.reuse.verdict !== "reuse";

  const table = runTable(fit, doc, outDir);
  result.table = {
    status: table.status,
    fitting: table.fitting,
    csv: table.csv,
    rowCount: table.rowCount,
    checker: table.checker,
    retryable: table.retryable,
    handoff: table.handoff,
    difyStarted: false,
  };

  const ghost = await runGhost(fit, stateDir);
  writeJson(join(outDir, "catalog-rows.json"), ghost.fullRows);
  result.catalog = {
    decisions: ghost.decisions,
    writes: ghost.writes,
    rows: ghost.rows,
    ghostServerStarted: false,
  };

  if (!native.ok && result.outcome === "delivered") result.outcome = "partial";
  if (result.outcome === "delivered" && result.reuse?.verdict === "bound") result.outcome = "delivered";
  writeJson(resultPath, result);
  return { exitCode: 0, result };
}
