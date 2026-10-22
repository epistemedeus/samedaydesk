#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedPath, fixtureDir, loadPins } from "../lib/paths.mjs";
import { baselineView, evaluatePair, machineAction } from "../lib/truth.mjs";
import { compareBaseline, refuseBaselineUpdate } from "../lib/baseline.mjs";
import { extractKit, resolveReleasedArchive, runVendorBudgetImpact, kitSpec, removeExtract } from "../lib/kit.mjs";
import { writeArtifacts } from "../lib/report.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const k = a.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) out[k] = true;
    else {
      out[k] = n;
      i++;
    }
  }
  return out;
}

function readJson(path, label) {
  if (!path) return null;
  const abs = resolve(path);
  if (!existsSync(abs)) {
    const err = new Error(`${label} not found: ${abs}`);
    err.code = "missing-file";
    throw err;
  }
  return { path: abs, json: JSON.parse(readFileSync(abs, "utf8")) };
}

function fail(code, message, extra = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, refused: true, code, message, purchaseAuthority: false, updateBaseline: false, ...extra })}\n`);
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || "run";
if (cmd === "obtain") {
  const bin = join(dirname(fileURLToPath(import.meta.url)), "obtain-kit.mjs");
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [bin, ...process.argv.slice(3)], { stdio: "inherit" });
  process.exit(r.status || 0);
}

if (cmd !== "run") fail("unknown-command", `unknown command ${cmd}`);

if (args["update-baseline"] || args["auto-update-baseline"]) {
  fail("baseline-update-refused", "This runner never updates expected.json. Edit the baseline by hand after review.", refuseBaselineUpdate());
}

const pins = loadPins();
const version = String(args["kit-version"] || pins.defaultVersion);
if (version === pins.candidate.version && !args["allow-candidate"]) {
  fail("candidate-not-default", "1.4.1 is a draft PR pin. Pass --allow-candidate after a verifying obtain, or use 1.4.0.");
}

if (version !== pins.released.version) fail("candidate-run-unavailable", "This consumer runs only the pinned released archive; it must not silently substitute 1.4.0 for a selected candidate.");

let beforePath = args.before;
let afterPath = args.after;
let sourcePath = args.source || null;
let baselineFile = args.baseline || null;
if (args.fixture) {
  const dir = fixtureDir(String(args.fixture));
  beforePath = beforePath || join(dir, "before.json");
  afterPath = afterPath || join(dir, "after.json");
  sourcePath = sourcePath || join(dir, "SOURCE.json");
  baselineFile = baselineFile || join(dir, "expected.json");
}
if (!beforePath || !afterPath) {
  fail("missing-required-inputs", "require --before and --after, or --fixture <id>");
}

const before = readJson(beforePath, "before");
const after = readJson(afterPath, "after");
const source = sourcePath ? readJson(sourcePath, "source") : null;
const usage = args.usage ? readJson(args.usage, "usage") : null;
const outDir = resolve(args["out-dir"] || join(process.cwd(), "out", "vendor-change-ci"));
function canonicalPath(path) {
  let existing = resolve(path); const rest = [];
  while (!existsSync(existing)) { rest.unshift(basename(existing)); existing = dirname(existing); }
  return join(realpathSync(existing), ...rest);
}
const protectedPaths = new Set([before.path, after.path, source?.path, usage?.path, baselineFile].filter(Boolean).map(canonicalPath));
const fileIdentity = (path) => { if (!existsSync(path)) return null; const s = statSync(path); return s.dev + ":" + s.ino; };
const protectedIdentities = new Set([...protectedPaths].map(fileIdentity).filter(Boolean));
for (const name of ["vendor-change-ci.json", "vendor-change-ci.md", "machine-action.json", "kit/budget-impact.json", "kit/budget-impact.md"]) {
  const output = join(outDir, name);
  if (protectedPaths.has(canonicalPath(output)) || protectedIdentities.has(fileIdentity(output))) fail("input-output-overlap", "Output paths must not overwrite inputs or a frozen baseline.");
}

let kitHandle;
try {
  if (args["kit-dir"]) {
    kitHandle = { kitDir: resolve(args["kit-dir"]), extractRoot: null, spec: kitSpec(version, pins) };
  } else {
    const archive = resolveReleasedArchive({ archivePath: args["kit-archive"] || null, pins });
    kitHandle = extractKit(archive.path, archive.spec);
  }
} catch (err) {
  fail(err.code || "kit-error", err.message);
}

let kitRun;
try {
const kitOut = join(outDir, "kit");
kitRun = runVendorBudgetImpact({
  kitDir: kitHandle.kitDir,
  beforePath: before.path,
  afterPath: after.path,
  outDir: kitOut,
});

const evalResult = evaluatePair({
  beforeJson: before.json,
  afterJson: after.json,
  source: source?.json || null,
  usage: usage?.json || null,
  kitArtifact: kitRun.artifact,
});

const kitCounts = kitRun.artifact?.underlying?.counts || {};
const provisional = machineAction({
  wrapperStatus: evalResult.wrapperStatus,
  baselineMatched: true,
  invoiceClaim: evalResult.billing.invoiceClaim,
});
const view = baselineView(evalResult, kitCounts, provisional);
const expected = baselineFile || (args.fixture ? expectedPath(String(args.fixture)) : null);
const baseline = expected ? compareBaseline(view, expected) : { compared: false, matched: null, updated: false, path: null };
const action = machineAction({
  wrapperStatus: evalResult.wrapperStatus,
  baselineMatched: expected ? baseline.matched : true,
  invoiceClaim: evalResult.billing.invoiceClaim,
});

const result = {
  schema: "samedaydesk.hg04.vendor-change-ci.result.v1",
  ok: action.ci === "pass",
  wrapperStatus: evalResult.wrapperStatus,
  kitStatus: evalResult.kitStatus,
  summary:
    evalResult.wrapperStatus === "refused"
      ? "Pricing snapshots failed schema checks."
      : evalResult.wrapperStatus === "partial"
        ? "Capture or unit evidence is non-final. Do not treat missing fields as retirements or bills."
        : `List-price row scan with kit status ${evalResult.kitStatus}. Review field deltas; this is not a bill.`,
  kit: {
    version: args["kit-dir"] ? null : kitHandle.spec.version,
    status: args["kit-dir"] ? "unverified-directory" : kitHandle.spec.status,
    verifiedArchive: !args["kit-dir"],
    source: args["kit-dir"] ? "caller-supplied-unverified-directory" : "verified-pinned-archive",
    sha256: args["kit-dir"] ? null : kitHandle.spec.sha256,
    bytes: args["kit-dir"] ? null : kitHandle.spec.bytes,
  },
  inputs: { before: before.path, after: after.path, source: source?.path || null, usage: usage?.path || null },
  truth: {
    schema: evalResult.schema,
    unit: evalResult.unit,
    coverage: evalResult.coverage,
    membership: evalResult.membership,
    conflicts: evalResult.conflicts,
    arithmeticOverflow: evalResult.arithmeticOverflow,
  },
  independentArithmetic: evalResult.independentArithmetic,
  kitReceipt: kitRun.receipt,
  kitExecution: { exitCode: kitRun.proc.status, signal: kitRun.proc.signal, error: kitRun.proc.error?.code || null },
  kitActions: kitRun.artifact?.actions || [],
  kitCounts,
  kitDigest: kitRun.artifact?.digest || null,
  invoiceClaim: false,
  forecast: false,
  purchaseAuthority: false,
  billingNote: evalResult.billing.note,
  baseline: {
    compared: baseline.compared,
    matched: baseline.matched,
    path: baseline.path,
    updated: false,
    reason: baseline.reason || null,
  },
  baselineUpdate: refuseBaselineUpdate(),
  machineAction: action,
  generatedAt: new Date().toISOString(),
};

const written = writeArtifacts(outDir, result);
result.outDir = outDir;
result.artifacts = written;

process.stdout.write(
  `${JSON.stringify({
    ok: result.ok,
    wrapperStatus: result.wrapperStatus,
    kitStatus: result.kitStatus,
    machineAction: action.kind,
    ci: action.ci,
    updateBaseline: false,
    invoiceClaim: false,
    forecast: false,
    purchaseAuthority: false,
    outDir,
    actionPath: written.actionPath,
  })}\n`,
);
process.exitCode = action.ci === "pass" ? 0 : 2;
} finally {
  if (!args["keep-kit"]) removeExtract(kitHandle?.extractRoot);
}
