import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const started = performance.now();
const installPinStarted = performance.now();
const pinInstall = spawnSync("npm", ["ci", "--ignore-scripts", "--prefix", "vendor/agent-payment-integrity"], {
  cwd: repoRoot,
  encoding: "utf8",
});
const pinInstallMs = performance.now() - installPinStarted;
if (pinInstall.status !== 0) {
  process.stderr.write(pinInstall.stderr || pinInstall.stdout || "pin install failed\n");
  process.exit(pinInstall.status || 1);
}
const pack = spawnSync("npm", ["pack", "--json", "--ignore-scripts"], { cwd: packageRoot, encoding: "utf8" });
if (pack.status !== 0) {
  process.stderr.write(pack.stderr || pack.stdout || "npm pack failed\n");
  process.exit(pack.status || 1);
}
const packed = JSON.parse(pack.stdout).at(-1);
const tarball = join(packageRoot, packed.filename);
const dir = mkdtempSync(join(tmpdir(), "task-native-consume-211879-"));
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
const consume = spawnSync(process.execPath, [
  bin,
  "consume",
  "--catalog", join(pkg, "acquired/normalized.json"),
  "--task", join(pkg, "fixtures/tasks/free-readiness.json"),
  "--input", join(pkg, "fixtures/consumer/quote-decimal.json"),
  "--repo", repoRoot,
], { encoding: "utf8", timeout: 60_000 });
const fetchScript = join(dir, "fetch-readiness.mjs");
writeFileSync(fetchScript, `
import { probePublic } from "@samedaydesk/task-native-selection-211860";
const probed = await probePublic("https://samedaydesk.com/discovery/task-readiness.json");
process.stdout.write(JSON.stringify({
  status: probed.status,
  hops: probed.hops,
  body: probed.body.toString("utf8"),
}));
`);
const fetched = spawnSync(process.execPath, [fetchScript], { encoding: "utf8", timeout: 30_000 });
const totalMs = performance.now() - started;
rmSync(tarball, { force: true });
rmSync(dir, { recursive: true, force: true });
if (consume.status !== 0) {
  process.stderr.write(consume.stderr || consume.stdout || "consume failed\n");
  process.exit(consume.status || 1);
}
if (fetched.status !== 0) {
  process.stderr.write(fetched.stderr || fetched.stdout || "fetch failed\n");
  process.exit(fetched.status || 1);
}
const journey = JSON.parse(consume.stdout);
const live = JSON.parse(fetched.stdout);
const liveSha = createHash("sha256").update(live.body).digest("hex");
const snapshotSha = createHash("sha256").update(readFileSync(join(packageRoot, "acquired/sources/task-readiness.json"))).digest("hex");
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
const receipt = {
  schema: "samedaydesk.task-native-useful-consumer.receipt.v1",
  feature: "codex/task-native-useful-consumer-211879",
  sourceFeature: "codex/task-native-selection-211860",
  receivedHead: "e79bbe71bb964902ac812335cd722bafd8c0080d",
  receivedTree: "5851b2e66d63d13f5447ab9a508648354ca0b490",
  base: "d760714c932fd317e1435b528575fecd95594183",
  head,
  tree,
  node: process.version,
  ownerQa: true,
  independentCustomer: false,
  revenue: false,
  usefulAcceptance: journey.stages.acceptance,
  completedUserTask: false,
  coldInstall: {
    packStatus: pack.status,
    installStatus: install.status,
    consumeStatus: consume.status,
    fetchStatus: fetched.status,
    installMs,
    totalMs,
    tarball: packed.filename,
    bytes: packed.size,
    version: "0.1.2",
  },
  upkeep: {
    command: "npm ci --ignore-scripts --prefix vendor/agent-payment-integrity",
    source: "tools/l08-agent-repair/MAINT.md",
    catalogColdStartExecuted: false,
    status: pinInstall.status,
    ms: pinInstallMs,
  },
  acquisition: {
    url: "https://samedaydesk.com/discovery/task-readiness.json",
    status: live.status,
    hops: live.hops,
    bytes: Buffer.byteLength(live.body),
    liveSha256: liveSha,
    snapshotSha256: snapshotSha,
    unchangedFromSnapshot: liveSha === snapshotSha,
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
  ownerUsefulness: journey.ownerUsefulness,
  downstreamEffects: journey.downstreamEffects,
  directComparison: journey.directComparison,
  sourceAcquisition: {
    pin: journey.sourceAcquisition?.pin || null,
    head: journey.sourceAcquisition?.head || null,
    coldStartUsedForInvocation: journey.sourceAcquisition?.coldStartUsedForInvocation === true,
    valuePatternEvaluatedBy: journey.sourceAcquisition?.valuePatternEvaluatedBy || null,
    valuePatternReason: journey.sourceAcquisition?.valuePatternReason || null,
  },
  actual: journey.actual,
};
const outDir = join(packageRoot, "receiving-211879");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
writeFileSync(join(outDir, "task-readiness.json"), live.body.endsWith("\n") ? live.body : `${live.body}\n`);
const ok = receipt.stages.execution === "consumer_invoked"
  && receipt.stages.acceptance === "not_observed"
  && receipt.outputValidation.ok === true
  && receipt.outputValidation.decisionChanged === true
  && receipt.discoveryQuote.state === "no_fit"
  && receipt.discoveryQuote.documentReasons?.[0] === "path_absent:data.quote"
  && receipt.invocation.coldStartExecuted === false
  && receipt.directComparison.savingsClaim === false
  && receipt.directComparison.directPathRetained === true
  && receipt.downstreamEffects.paymentSent === false
  && receipt.acquisition.status === 200
  && receipt.upkeep.catalogColdStartExecuted === false;
process.stdout.write(`${JSON.stringify(receipt)}\n`);
process.exit(ok ? 0 : 1);
