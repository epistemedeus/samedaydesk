import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectFormat } from "./detect-format.mjs";
import { ConsumerError, refused } from "./errors.mjs";
import { ENGINE_SHA } from "./pin.mjs";
import { readLocatorText } from "./read-locator.mjs";
import { resolveEngine } from "./resolve-engine.mjs";

function inspectLocator(locator, loaded) {
  const detected = detectFormat({ text: loaded.text, locator });
  const format = detected.format;
  const supported = detected.supported === true;
  if (!supported) {
    refused(
      "unsupported_format",
      `Format ${format} is not a claimed supported route catalog`,
      { format, locator, transport: loaded.transport || null },
    );
  }
  return {
    locator,
    format,
    transport: detected.transport || loaded.transport,
    supported: true,
  };
}

function spawnEngine(engine, options) {
  const args = ["--before", options.before, "--after", options.after, "--out-dir", options.outDir];
  const result = spawnSync(process.execPath, [engine.cli, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 20000,
  });
  if (result.error) {
    refused(
      "engine_unavailable",
      `Failed to spawn pinned route-table-diff: ${result.error.message}`,
      { cli: engine.cli },
      { analysis: "engine-failure" },
    );
  }
  const stdout = String(result.stdout || "").trim();
  let body;
  try {
    body = JSON.parse(stdout.split("\n").filter(Boolean).pop() || "");
  } catch {
    refused(
      "engine_output_unparseable",
      "Pinned route-table-diff did not print JSON",
      { status: result.status, stdout: result.stdout, stderr: result.stderr },
      { analysis: "engine-failure" },
    );
  }
  return { status: result.status, body, stderr: result.stderr };
}

function readWrittenDiff(outDir) {
  const jsonPath = resolve(outDir, "route-diff.json");
  if (!existsSync(jsonPath)) return null;
  try {
    return JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch {
    return null;
  }
}

function pathList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : item?.path)).filter(Boolean);
}

function analysisOf(engineBody) {
  if (!engineBody || typeof engineBody !== "object") return "engine-failure";
  if (engineBody.ok === true) {
    const counts = engineBody.counts || {};
    const changed =
      Number(counts.added || 0) + Number(counts.removed || 0) + Number(counts.changed || 0);
    return changed === 0 ? "no-change" : "change";
  }
  if (engineBody.refused === true) return "refused";
  return "engine-failure";
}

export async function runRouteConsumer(options = {}) {
  if (!options.outDir) {
    refused("missing_out_dir", "--out-dir is required to write route-diff.json and route-diff.md");
  }
  if (!options.before || !options.after) {
    refused("missing_catalog", "Provide --before and --after locators");
  }

  let engine;
  try {
    engine = resolveEngine({ root: options.engineRoot });
  } catch (err) {
    if (err instanceof ConsumerError) throw err;
    refused(
      "engine_unavailable",
      err instanceof Error ? err.message : String(err),
      null,
      { analysis: "engine-failure" },
    );
  }

  const beforeLoaded = await readLocatorText(options.before);
  const afterLoaded = await readLocatorText(options.after);
  const before = inspectLocator(options.before, beforeLoaded);
  const after = inspectLocator(options.after, afterLoaded);

  const spawned = spawnEngine(engine, {
    before: options.before,
    after: options.after,
    outDir: options.outDir,
  });
  const diffDoc = readWrittenDiff(options.outDir) || spawned.body;
  const analysis = analysisOf(diffDoc);
  const digest = diffDoc?.tableDigest || spawned.body?.tableDigest || null;
  const digestOrderSensitive =
    analysis === "no-change" &&
    digest &&
    digest.before &&
    digest.after &&
    digest.before !== digest.after;

  if (analysis === "engine-failure") {
    return {
      ok: false,
      refused: true,
      code: spawned.body?.code || "engine_output_unparseable",
      error: spawned.body?.error || "Pinned route-table-diff returned a non-analysis failure",
      analysis,
      format: { before: before.format, after: after.format },
      enginePin: { sha: engine.sha, source: engine.source, cli: engine.cli, expectedSha: ENGINE_SHA },
      engine: spawned.body,
      paid: false,
      settled: false,
      nonsettling: true,
      purchaseAuthority: false,
    };
  }

  return {
    ok: spawned.body?.ok === true || diffDoc?.ok === true,
    refused: (spawned.body?.ok === true || diffDoc?.ok === true) ? false : true,
    code: spawned.body?.code || (diffDoc?.ok === true ? null : "engine-refused"),
    error: spawned.body?.error || null,
    analysis,
    digestOrderSensitive,
    format: { before: before.format, after: after.format },
    evidenceClass: diffDoc?.evidenceClass || spawned.body?.evidenceClass || null,
    counts: diffDoc?.counts || spawned.body?.counts || null,
    tableDigest: digest,
    added: pathList(diffDoc?.added || spawned.body?.added),
    removed: pathList(diffDoc?.removed),
    changed: diffDoc?.changed || spawned.body?.changed || [],
    publishedRouteTable: spawned.body?.publishedRouteTable === true || diffDoc?.publishedRouteTable === true,
    sample: spawned.body?.sample === true || diffDoc?.sample === true,
    outDir: spawned.body?.outDir || options.outDir,
    outputs: spawned.body?.outputs || ["route-diff.json", "route-diff.md"],
    enginePin: {
      sha: engine.sha,
      source: engine.source,
      cli: engine.cli,
      expectedSha: ENGINE_SHA,
      remainingBinding: "W5-M04 owns tools/route-table-diff. This consumer does not claim a later M04 amendment.",
    },
    engine: spawned.body,
    diff: diffDoc,
    paid: false,
    settled: false,
    nonsettling: true,
    purchaseAuthority: false,
  };
}
