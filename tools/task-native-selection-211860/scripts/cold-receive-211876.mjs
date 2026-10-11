import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const started = performance.now();
const pack = spawnSync("npm", ["pack", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8" });
if (pack.status !== 0) {
  process.stderr.write(pack.stderr || pack.stdout || "npm pack failed\n");
  process.exit(pack.status || 1);
}
const packed = JSON.parse(pack.stdout).at(-1);
const tarball = join(root, packed.filename);
const dir = mkdtempSync(join(tmpdir(), "task-native-receive-211876-"));
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
const pkg = join(dir, "node_modules/@samedaydesk/task-native-selection-211860");
const child = join(dir, "receive-child.mjs");
writeFileSync(child, `
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { compareEffort, normalizeCallerEntry, probePublic, selectTask, supportsOutput, validateInstance } from "@samedaydesk/task-native-selection-211860";

const pkg = process.argv[2];
const now = "2026-10-11T11:40:00.000Z";
const catalog = JSON.parse(readFileSync(pkg + "/acquired/normalized.json", "utf8"));
const readinessTask = JSON.parse(readFileSync(pkg + "/fixtures/tasks/free-readiness.json", "utf8"));
const noFitTask = JSON.parse(readFileSync(pkg + "/fixtures/tasks/no-fit-flight.json", "utf8"));
const discovery = catalog.entries.find((entry) => entry.id === "discovery:task-readiness");
const extract = catalog.entries.find((entry) => entry.operationId === "extractUrl");
const referral = catalog.entries.find((entry) => entry.operationId === "claimReceiptReferralRecheck");
const snapshotBody = readFileSync(pkg + "/acquired/sources/task-readiness.json");
const snapshotSha = createHash("sha256").update(snapshotBody).digest("hex");

function stagesOf(result) {
  return {
    query: result.stages.query.state,
    render: result.stages.render.state,
    selected: result.stages.selected.state,
    executed: result.stages.executed.state,
    usefulAcceptance: result.stages.usefulAcceptance.state,
    meaningId: result.stages.query.meaningId || null,
    meaningIdRole: result.stages.query.meaningIdRole || null,
    semanticEquivalence: result.stages.query.semanticEquivalence === true,
    operationId: result.stages.selected.operationId || null,
    entryId: result.stages.selected.entryId || null,
    economicComparison: result.stages.selected.economicComparison || null,
    impliedCheapest: result.stages.selected.impliedCheapest === true,
    cost: result.stages.selected.cost || null,
    commandRun: result.stages.selected.nextAction?.run || result.stages.executed.state,
  };
}

const readiness = selectTask({ catalog, task: readinessTask, now });
const noFit = selectTask({ catalog, task: noFitTask, now });
const direct = normalizeCallerEntry({
  id: "readiness-direct",
  operationId: "readiness-direct",
  sourceRef: "https://samedaydesk.com/discovery/task-readiness.json",
  origin: "https://samedaydesk.com",
  method: "GET",
  path: "/discovery/task-readiness.json",
  direct: true,
  owned: true,
  outputSchema: discovery.outputSchema,
  price: { state: "known_free", amount: "0" },
  summaryUntrusted: "Caller-supplied copy of the readiness document contract.",
});
const withDirect = selectTask({
  catalog,
  now,
  task: { ...readinessTask, taskRef: "readiness-direct-free", directAlternative: {
    id: "readiness-direct",
    operationId: "readiness-direct",
    sourceRef: "https://samedaydesk.com/discovery/task-readiness.json",
    origin: "https://samedaydesk.com",
    method: "GET",
    path: "/discovery/task-readiness.json",
    direct: true,
    owned: true,
    outputSchema: discovery.outputSchema,
    price: { state: "known_free", amount: "0" },
  } },
});

const titleSchema = structuredClone(extract.outputSchema);
const titleBefore = supportsOutput(titleSchema, { paths: [{ path: "title", type: "string" }] });
titleSchema.properties.title = { type: ["string", "null"] };
const titleAfter = supportsOutput(titleSchema, { paths: [{ path: "title", type: "string" }] });
const enumSchema = structuredClone(referral.outputSchema);
const enumBefore = supportsOutput(enumSchema, { paths: [{ path: "recheck.decision", type: "string", enum: ["machine_buyable", "contract_ready", "repair_required"] }] });
enumSchema.properties.recheck.properties.decision = {
  type: "string",
  enum: ["machine_buyable", "contract_ready", "repair_required", "injected"],
};
const enumAfter = supportsOutput(enumSchema, { paths: [{ path: "recheck.decision", type: "string", enum: ["machine_buyable", "contract_ready", "repair_required"] }] });

function pricedCopy(id, currency, amount) {
  const copy = structuredClone(extract);
  copy.id = id;
  copy.operationId = id;
  copy.direct = false;
  copy.authority = "caller";
  copy.price = { ...copy.price, state: "known", amount, currency, charged: true, conflict: null };
  return copy;
}
const currencyCatalog = {
  ...catalog,
  entries: [pricedCopy("usd-extract", "USD", "0.005"), pricedCopy("eur-extract", "EUR", "0.001")],
};
const currencyTask = {
  schema: readinessTask.schema,
  taskRef: "currency-extract",
  requiredOutput: {
    meaningId: "extract-title-label",
    paths: [{ path: "title", type: "string" }, { path: "requestedUrl", type: "string" }, { path: "finalUrl", type: "string" }, { path: "sourceOk", type: "boolean" }],
  },
  applicability: { availableInputs: ["url"], asOf: now },
};
const currencyResult = selectTask({ catalog: currencyCatalog, task: currencyTask, now });

const expiredCatalog = structuredClone(catalog);
const expiredEntry = expiredCatalog.entries.find((entry) => entry.operationId === "extractUrl");
expiredEntry.expiresAt = "2020-01-01T00:00:00.000Z";
expiredEntry.expiryState = "known";
const extractTask = JSON.parse(readFileSync(pkg + "/fixtures/tasks/structured-extract.json", "utf8"));
const expired = selectTask({ catalog: expiredCatalog, task: extractTask, now });
const fresh = structuredClone(catalog);
fresh.entries = fresh.entries.filter((entry) => entry.operationId !== "extractUrl");
const stale = selectTask({ catalog, freshCatalog: fresh, task: extractTask, now });
const changedCatalog = structuredClone(catalog);
const changedFresh = structuredClone(catalog);
const changedEntry = changedFresh.entries.find((entry) => entry.operationId === "extractUrl");
changedEntry.outputSchemaSha256 = "changed";
const changed = selectTask({ catalog: changedCatalog, freshCatalog: changedFresh, task: extractTask, now });
const unknownCatalog = structuredClone(catalog);
const unknownEntry = unknownCatalog.entries.find((entry) => entry.operationId === "extractUrl");
unknownEntry.outputSchema = null;
unknownEntry.outputSchemaState = "absent";
unknownEntry.outputSchemaSha256 = null;
const unknown = selectTask({ catalog: unknownCatalog, task: extractTask, now });

const fetchStarted = performance.now();
const probed = await probePublic("https://samedaydesk.com/discovery/task-readiness.json");
const fetchMs = performance.now() - fetchStarted;
const liveText = probed.body.toString("utf8");
const live = JSON.parse(liveText);
const liveSha = createHash("sha256").update(probed.body).digest("hex");
const documentCheck = validateInstance(discovery.outputSchema, live);
const pathCheck = supportsOutput(discovery.outputSchema, readinessTask.requiredOutput);
const effortStarted = performance.now();
const effort = compareEffort({
  catalog,
  task: readinessTask,
  now,
  document: live,
  documentSchema: discovery.outputSchema,
});
const effortMs = performance.now() - effortStarted;

const receipt = {
  schema: "samedaydesk.task-native-cold-receiving.v1",
  feature: "codex/task-native-cold-receiving-211876",
  sourceFeature: "codex/task-native-selection-211860",
  ownerQa: true,
  independentCustomer: false,
  revenue: false,
  usefulAcceptance: "not_observed",
  downstreamCommand: "not_run",
  downstreamValidated: false,
  scope: "readiness_discovery_document",
  directNormalize: direct.error,
  readiness: stagesOf(readiness),
  noFit: stagesOf(noFit),
  directFree: {
    ...stagesOf(withDirect),
    alsoEligible: (withDirect.stages.selected.alsoEligible || []).map((row) => ({ id: row.id, relation: row.relation })),
  },
  mutations: {
    titleBefore: titleBefore.reason,
    titleAfter: titleAfter.reason,
    enumBefore: enumBefore.reason,
    enumAfter: enumAfter.reason,
    currencyState: currencyResult.stages.selected.state,
    currencyComparison: currencyResult.stages.selected.economicComparison,
    currencyImpliedCheapest: currencyResult.stages.selected.impliedCheapest === true,
    currencyAlternatives: (currencyResult.stages.selected.alternatives || []).map((row) => row.operationId),
  },
  controls: {
    expired: expired.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("expired")),
    stale: stale.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("stale_source")),
    changed: changed.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("source_changed")),
    unknown: unknown.stages.render.ineligible.some((row) => row.operationId === "extractUrl" && row.reasons.includes("output_contract_absent")),
  },
  acquisition: {
    url: "https://samedaydesk.com/discovery/task-readiness.json",
    status: probed.status,
    hops: probed.hops,
    bytes: probed.body.length,
    fetchMs,
    liveSha256: liveSha,
    snapshotSha256: snapshotSha,
    unchangedFromSnapshot: liveSha === snapshotSha,
    documentValid: documentCheck.ok,
    documentReason: documentCheck.reason,
    pathReason: pathCheck.reason,
    paid: live.paid,
    invokesPricedExecution: live.invokesPricedExecution,
    packageId: live.packageId,
    coldStartExecuted: false,
  },
  effort: {
    wallMs: effortMs,
    plainCatalogMs: effort.plainCatalog.ms,
    directContractMs: effort.directContract.ms,
    directDocumentMs: effort.directDocument?.ms ?? null,
    directDocumentOk: effort.directDocument?.ok === true,
    selectorMs: effort.selector.ms,
    selectorState: effort.selector.state,
    savingsClaim: effort.savingsClaim,
    customerTime: effort.customerTime,
    stages: effort.stages,
    impliedCheapest: effort.directContract.impliedCheapest,
  },
};
process.stdout.write(JSON.stringify({ receipt, liveText }));
`);
const childRun = spawnSync(process.execPath, [child, pkg], { encoding: "utf8", timeout: 90_000 });
const totalMs = performance.now() - started;
rmSync(tarball, { force: true });
rmSync(dir, { recursive: true, force: true });
if (childRun.status !== 0) {
  process.stderr.write(childRun.stderr || childRun.stdout || "receive child failed\n");
  process.exit(childRun.status || 1);
}
const parsed = JSON.parse(childRun.stdout);
const outDir = fileURLToPath(new URL("../receiving-211876/", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "task-readiness.json"), parsed.liveText.endsWith("\n") ? parsed.liveText : `${parsed.liveText}\n`);
const receipt = {
  ...parsed.receipt,
  coldInstall: {
    packStatus: pack.status,
    installStatus: install.status,
    childStatus: childRun.status,
    installMs,
    totalMs,
    tarball: packed.filename,
    bytes: packed.size,
    version: "0.1.1",
  },
};
writeFileSync(join(outDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt)}\n`);
const ok = receipt.readiness.entryId === "discovery:task-readiness"
  && receipt.readiness.executed === "not_executed"
  && receipt.readiness.usefulAcceptance === "not_observed"
  && receipt.noFit.selected === "no_fit"
  && receipt.directFree.entryId === "caller:readiness-direct"
  && receipt.directFree.economicComparison === "known_free"
  && receipt.directFree.impliedCheapest === false
  && receipt.mutations.titleBefore === "output_supported"
  && receipt.mutations.titleAfter === "type_not_guaranteed:title"
  && receipt.mutations.enumBefore === "output_supported"
  && receipt.mutations.enumAfter === "enum_not_guaranteed:recheck.decision"
  && receipt.mutations.currencyState === "unranked"
  && receipt.mutations.currencyImpliedCheapest === false
  && receipt.controls.expired === true
  && receipt.controls.stale === true
  && receipt.controls.changed === true
  && receipt.controls.unknown === true
  && receipt.acquisition.status === 200
  && receipt.acquisition.documentValid === true
  && receipt.acquisition.pathReason === "output_supported"
  && receipt.acquisition.coldStartExecuted === false
  && receipt.effort.savingsClaim === false;
process.exit(ok ? 0 : 1);
