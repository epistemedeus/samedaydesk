/**
 * FlowAssert bridge. FlowAssert (Apache-2.0, Sun-sh902/FlowAssert v1.0.0 at
 * 3960c04dc3ee39138ed918c2226194638e13422a) is an external checker this kit consumes
 * unchanged. Its record-level disposition is kept separate from job acceptance: nothing
 * here reads or changes period.*.
 *
 * Two routes, both unchanged upstream logic:
 * - runFlowAssertCli: the upstream `flowassert-verify` command, if installed.
 * - runPackagedCheck: the upstream packaged JavaScript checker, taken byte-for-byte from
 *   vendor/flowassert/flowassert-check.workflow.json (the "FlowAssert check" Code node
 *   section between the upstream markers), verified by sha256 before use.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const FLOWASSERT_PIN = Object.freeze({
  repo: "Sun-sh902/FlowAssert",
  commit: "3960c04dc3ee39138ed918c2226194638e13422a",
  version: "1.0.0",
  license: "Apache-2.0",
  workflowPath: "examples/n8n/flowassert-check.workflow.json",
});

export const CHECKER_START = "// ===== FlowAssert packaged checker";
export const CHECKER_END = "// ===== Run the check. =====";
export const CONFIG_START = "// ===== FlowAssert check: configuration. Edit this block only. =====";

/** Exit statuses as documented upstream (README "What the four results mean"). */
export const EXIT_STATES = Object.freeze({ 0: "Verified", 1: "Mismatch", 2: "refused", 3: "Unverified", 4: "failed" });

export function mapExit(code) {
  return Object.prototype.hasOwnProperty.call(EXIT_STATES, code) ? EXIT_STATES[code] : "failed";
}

export function upstreamCodeNodeSource() {
  const workflow = JSON.parse(readFileSync(join(here, "..", "vendor", "flowassert", "examples", "n8n", "flowassert-check.workflow.json"), "utf8"));
  const node = workflow.nodes.find((candidate) => candidate.name === "FlowAssert check");
  if (!node) throw new Error("vendored FlowAssert workflow has no FlowAssert check node");
  return node.parameters.jsCode;
}

export function sectionBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  if (from === -1 || to === -1 || to <= from) throw new Error("FlowAssert markers not found");
  return source.slice(from, to);
}

export function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

let cachedChecker = null;

/** Load the upstream packaged checker without editing it. */
export function loadPackagedChecker() {
  if (cachedChecker) return cachedChecker;
  const section = sectionBetween(upstreamCodeNodeSource(), CHECKER_START, CHECKER_END);
  const pins = JSON.parse(readFileSync(join(here, "..", "vendor", "PINS.json"), "utf8"));
  const expected = pins.flowassert?.packagedCheckerSha256;
  if (expected && sha256Text(section) !== expected) {
    throw new Error("vendored FlowAssert packaged checker does not match its pinned sha256");
  }
  // The section declares `var FlowAssert=(function(e){...})({});` and makes no request.
  cachedChecker = new Function(`${section}\nreturn FlowAssert;`)();
  return cachedChecker;
}

function disposition(fields) {
  return { disposition: "flowassert", affectsAcceptance: false, flowassert: FLOWASSERT_PIN, ...fields };
}

export async function runPackagedCheck({
  sourceCsv,
  destinationCsv,
  config,
  sourceComplete = false,
  destinationComplete = false,
  sourceCount = null,
  destinationCount = null,
  allowIdenticalContent = false,
  origin = "JavaScript call",
}) {
  const FlowAssert = loadPackagedChecker();
  const result = await FlowAssert.checkCsv({
    source: { name: "source.csv", content: sourceCsv, encoding: "utf-8" },
    destination: { name: "destination.csv", content: destinationCsv, encoding: "utf-8" },
    config,
    sourceComplete,
    destinationComplete,
    sourceCount,
    destinationCount,
    allowIdenticalContent,
    origin,
  });
  return disposition({
    route: "packaged-checker",
    state: result.state,
    exit: result.exit,
    mappedState: mapExit(result.exit),
    summary: result.summary,
    message: result.message,
    version: FlowAssert.VERSION,
    reportJson: result.json,
  });
}

/**
 * Run the upstream CLI unchanged. Returns { available:false } when it is not installed;
 * nothing is substituted for it in that case.
 */
export function runFlowAssertCli({
  sourcePath,
  destinationPath,
  key,
  fields = [],
  sourceComplete = false,
  destinationComplete = false,
  command = "flowassert-verify",
  spawn = spawnSync,
}) {
  const args = ["--source", sourcePath, "--destination", destinationPath, "--key", key];
  for (const field of fields) args.push("--field", field);
  if (sourceComplete) args.push("--source-complete");
  if (destinationComplete) args.push("--destination-complete");
  const run = spawn(command, args, { encoding: "utf8" });
  if (run.error && run.error.code === "ENOENT") {
    return disposition({ route: "cli", available: false, state: "not_run", exit: null });
  }
  if (run.error) {
    return disposition({ route: "cli", available: true, state: "failed", exit: 4, message: String(run.error.message) });
  }
  return disposition({
    route: "cli",
    available: true,
    exit: run.status,
    state: mapExit(run.status),
    summary: run.stdout,
    message: run.stderr,
  });
}

/** Attach a FlowAssert disposition next to a period result. period.* is copied, not changed. */
export function withFlowAssert(periodResult, flowassert) {
  return { period: periodResult.period, decision: periodResult.period?.decision ?? null, flowassert };
}
