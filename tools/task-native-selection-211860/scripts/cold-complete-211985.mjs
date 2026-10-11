import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const register = join(packageRoot, "scripts/hide-express-register.mjs");
const contractModule = join(repoRoot, "tools/l08-agent-repair/lib/readiness-contract.mjs");
const readinessModule = join(repoRoot, "tools/l08-agent-repair/lib/task-readiness.mjs");
const started = performance.now();

function run(args, options = {}) {
  return spawnSync(process.execPath, args, { encoding: "utf8", timeout: 60_000, ...options });
}

const natural = run([
  "--input-type=module",
  "-e",
  `await import(${JSON.stringify(readinessModule)})`,
]);
const hidden = run([
  "--import",
  register,
  "--input-type=module",
  "-e",
  `await import(${JSON.stringify(readinessModule)})`,
]);
const pure = run([
  "--import",
  register,
  "--input-type=module",
  "-e",
  `import { semanticResult } from ${JSON.stringify(contractModule)};
process.stdout.write(JSON.stringify({
  soon: semanticResult({ data: { quote: "soon" } }),
  decimal: semanticResult({ data: { quote: "1.25" } }),
  number: semanticResult({ data: { quote: 1.25 } }),
}));`,
]);
const pack = spawnSync("npm", ["pack", "--json", "--ignore-scripts"], { cwd: packageRoot, encoding: "utf8" });
if (pack.status !== 0) {
  process.stderr.write(pack.stderr || pack.stdout || "npm pack failed\n");
  process.exit(pack.status || 1);
}
const packed = JSON.parse(pack.stdout).at(-1);
const tarball = join(packageRoot, packed.filename);
const dir = mkdtempSync(join(tmpdir(), "task-native-complete-211985-"));
const installStarted = performance.now();
const install = spawnSync("npm", ["install", "--omit=dev", "--ignore-scripts", tarball], {
  cwd: dir,
  encoding: "utf8",
});
const installMs = performance.now() - installStarted;
if (install.status !== 0) {
  process.stderr.write(install.stderr || install.stdout || "npm install failed\n");
  rmSync(tarball, { force: true });
  rmSync(dir, { recursive: true, force: true });
  process.exit(install.status || 1);
}
const bin = join(dir, "node_modules/.bin/task-native-select");
const pkg = join(dir, "node_modules/@samedaydesk/task-native-selection-211860");
const completeStarted = performance.now();
const complete = run([
  bin,
  "complete",
  "--catalog", join(pkg, "acquired/normalized.json"),
  "--task", join(pkg, "fixtures/tasks/free-readiness.json"),
  "--input", join(pkg, "fixtures/consumer/quote-decimal-complete.json"),
  "--repo", repoRoot,
]);
const completeMs = performance.now() - completeStarted;
const directScript = join(dir, "direct-contract.mjs");
writeFileSync(directScript, `import { readFileSync } from "node:fs";
import { diagnoseSuppliedContract, semanticResult } from ${JSON.stringify(contractModule)};
const contract = JSON.parse(readFileSync(${JSON.stringify(join(pkg, "fixtures/consumer/quote-decimal-complete.json"))}, "utf8")).contract;
const started = performance.now();
const cases = {
  conforming: diagnoseSuppliedContract({ method: contract.method, path: contract.path, requiredPaths: contract.requiredPaths, schema: contract.schema, body: contract.conforming }),
  wrong: diagnoseSuppliedContract({ method: contract.method, path: contract.path, requiredPaths: contract.requiredPaths, schema: contract.schema, body: contract.wrong }),
  malformed: diagnoseSuppliedContract({ method: contract.method, path: contract.path, requiredPaths: contract.requiredPaths, schema: contract.schema, body: contract.malformed }),
  absentPath: diagnoseSuppliedContract({ method: contract.method, path: contract.path, requiredPaths: contract.requiredPaths, schema: contract.absentSchema, body: contract.conforming }),
  nullable: diagnoseSuppliedContract({ method: contract.method, path: contract.path, requiredPaths: contract.requiredPaths, schema: contract.nullableSchema, body: contract.conforming }),
  enum: diagnoseSuppliedContract({ method: contract.method, path: contract.path, requiredPaths: contract.requiredPaths, schema: contract.enumSchema, body: contract.conforming }),
  unsupported: diagnoseSuppliedContract({ method: contract.method, path: contract.path, requiredPaths: contract.requiredPaths, schema: contract.unsupportedSchema, body: contract.conforming }),
};
const semantic = semanticResult(contract.wrong);
process.stdout.write(JSON.stringify({ ms: performance.now() - started, cases, semantic }));
`);
const directStarted = performance.now();
const direct = run([directScript]);
const directWallMs = performance.now() - directStarted;
const fetchScript = join(dir, "fetch-readiness.mjs");
writeFileSync(fetchScript, `
import { probePublic } from "@samedaydesk/task-native-selection-211860";
const started = performance.now();
const probed = await probePublic("https://samedaydesk.com/discovery/task-readiness.json");
process.stdout.write(JSON.stringify({
  ms: performance.now() - started,
  status: probed.status,
  hops: probed.hops,
  body: probed.body.toString("utf8"),
}));
`);
const fetched = run([fetchScript]);
const totalMs = performance.now() - started;
rmSync(tarball, { force: true });
rmSync(dir, { recursive: true, force: true });
if (complete.status !== 0) {
  process.stderr.write(complete.stderr || complete.stdout || "complete failed\n");
  process.exit(complete.status || 1);
}
if (direct.status !== 0) {
  process.stderr.write(direct.stderr || direct.stdout || "direct failed\n");
  process.exit(direct.status || 1);
}
if (fetched.status !== 0) {
  process.stderr.write(fetched.stderr || fetched.stdout || "fetch failed\n");
  process.exit(fetched.status || 1);
}
if (pure.status !== 0) {
  process.stderr.write(pure.stderr || pure.stdout || "pure import failed\n");
  process.exit(pure.status || 1);
}
const journey = JSON.parse(complete.stdout);
const directJson = JSON.parse(direct.stdout);
const pureJson = JSON.parse(pure.stdout);
const live = JSON.parse(fetched.stdout);
const liveSha = createHash("sha256").update(live.body).digest("hex");
const snapshotSha = createHash("sha256").update(readFileSync(join(packageRoot, "acquired/sources/task-readiness.json"))).digest("hex");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
const sameDiagnostic = JSON.stringify(journey.actual) === JSON.stringify(directJson.cases);
const receipt = {
  schema: "samedaydesk.task-native-readiness-complete.receipt.v1",
  feature: "codex/task-native-readiness-complete-211985",
  sourceFeature: "codex/task-native-selection-211860",
  receivedHead: "efe688cdb487ce4c8732c543510ba49f9f5124b7",
  receivedTree: "12b2cedd8828760c3794b1302cd2eb7821f7017e",
  originalReceiving: "ef1ba11e709ea80ac0c54063c2e30fc89d17cc0f",
  base: "d760714c932fd317e1435b528575fecd95594183",
  baseTree: "8bdc2f0fedd0aaa13b53b2daeff4d47dd44428d0",
  head,
  tree,
  node: process.version,
  ownerQa: true,
  independentCustomer: false,
  outsideDemand: "not_observed",
  revenue: false,
  faithfulInvocation: journey.invocation.faithfulInvocation === true,
  completedUserTask: journey.invocation.completedUserTask === true,
  coldInstall: {
    packStatus: pack.status,
    installStatus: install.status,
    completeStatus: complete.status,
    directStatus: direct.status,
    fetchStatus: fetched.status,
    pureStatus: pure.status,
    installMs,
    completeMs,
    directWallMs,
    directMs: directJson.ms,
    handoffMs: journey.directComparison.handoffMs,
    selectorDirectMs: journey.directComparison.directMs,
    totalMs,
    tarball: packed.filename,
    bytes: packed.size,
    version: "0.1.3",
    pinInstall: { state: "not_required", ms: null, reason: "readiness-contract.mjs has no package imports" },
  },
  red: {
    natural: {
      status: natural.status,
      code: /ERR_MODULE_NOT_FOUND/.test(natural.stderr) ? "ERR_MODULE_NOT_FOUND" : null,
      express: /express/.test(natural.stderr),
      stderr: natural.stderr,
    },
    hidden: {
      status: hidden.status,
      code: /ERR_MODULE_NOT_FOUND/.test(hidden.stderr) ? "ERR_MODULE_NOT_FOUND" : null,
      express: /express/.test(hidden.stderr),
    },
  },
  green: pureJson,
  acquisition: {
    url: "https://samedaydesk.com/discovery/task-readiness.json",
    status: live.status,
    hops: live.hops,
    bytes: Buffer.byteLength(live.body),
    ms: live.ms,
    liveSha256: liveSha,
    snapshotSha256: snapshotSha,
    unchangedFromSnapshot: liveSha === snapshotSha,
    httpStatusIsAcceptance: false,
  },
  stages: journey.stages,
  selection: {
    entryId: journey.selection?.entryId || null,
    economicComparison: journey.selection?.economicComparison || null,
    impliedCheapest: journey.selection?.impliedCheapest === true,
    cost: journey.selection?.cost || null,
  },
  discoveryQuote: journey.discoveryQuote,
  invocation: journey.invocation,
  outputValidation: journey.outputValidation,
  ownerAcceptance: journey.ownerAcceptance,
  outsideAcceptance: journey.outsideAcceptance,
  attention: journey.attention,
  downstreamEffects: journey.downstreamEffects,
  directComparison: {
    ...journey.directComparison,
    sameDiagnostic,
    installShared: true,
    discoveryShared: true,
    savingsClaim: false,
  },
  sourceAcquisition: journey.sourceAcquisition,
  nextAction: journey.nextAction,
  actual: {
    conforming: journey.actual.conforming,
    wrong: journey.actual.wrong,
    malformed: journey.actual.malformed,
    absentPath: journey.actual.absentPath,
  },
};
const outDir = join(packageRoot, "receiving-211985");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
const ok = hidden.status !== 0
  && hidden.stderr.includes("ERR_MODULE_NOT_FOUND")
  && hidden.stderr.includes("express")
  && pure.status === 0
  && pureJson.soon.state === "fail"
  && pureJson.soon.shape === "string"
  && pureJson.decimal.state === "pass"
  && pureJson.number.shape === "number"
  && receipt.stages.execution === "consumer_invoked"
  && receipt.stages.ownerAcceptance === "recorded"
  && receipt.stages.outsideAcceptance === "not_observed"
  && receipt.outputValidation.ok === true
  && receipt.outputValidation.decisionChanged === true
  && receipt.discoveryQuote.state === "no_fit"
  && receipt.discoveryQuote.documentReasons[0] === "path_absent:data.quote"
  && receipt.invocation.coldStartExecuted === false
  && receipt.invocation.adapterInvoked === false
  && receipt.invocation.faithfulInvocation === false
  && receipt.invocation.completedUserTask === false
  && receipt.directComparison.savingsClaim === false
  && receipt.directComparison.directPathRetained === true
  && sameDiagnostic === true
  && receipt.downstreamEffects.paymentSent === false
  && receipt.downstreamEffects.quoteGenerated === false
  && receipt.attention.amount === null
  && receipt.acquisition.status === 200
  && receipt.actual.wrong.nextAction === "value_mismatch:data.quote"
  && receipt.actual.conforming.nextAction === "decimal_match"
  && receipt.actual.absentPath.nextAction === "seller_response_required_path_missing:data.quote"
  && receipt.coldInstall.pinInstall.ms === null;
process.stdout.write(`${JSON.stringify({ ok, head, completeStatus: complete.status, natural: natural.status, hidden: hidden.status, pure: pure.status })}\n`);
process.exit(ok ? 0 : 1);
