import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonical } from "./canonical.mjs";
import {
  COMPLETE_FEATURE,
  COMPLETE_INPUT_SCHEMA,
  COMPLETE_JOURNEY_SCHEMA,
  CONTRACT_MODULE,
  EXPECTED,
  STALE_PIN,
  SUPPLIED_CONTRACT,
} from "./complete-contract.mjs";
import { PIN, READINESS_ENTRY } from "./consumer-contract.mjs";
import { FEATURE, TASK_SCHEMA } from "./constants.mjs";
import { selectTask } from "./select.mjs";

const FORBIDDEN = ["command", "shell", "coldStart", "url", "argv"];
const CASE_INPUTS = [
  ["conforming", "schema", "conforming"],
  ["wrong", "schema", "wrong"],
  ["malformed", "schema", "malformed"],
  ["absentPath", "absentSchema", "conforming"],
  ["nullable", "nullableSchema", "conforming"],
  ["enum", "enumSchema", "conforming"],
  ["unsupported", "unsupportedSchema", "conforming"],
];

function quoteProbe(now) {
  return {
    schema: TASK_SCHEMA,
    taskRef: "quote-on-discovery",
    requiredOutput: {
      meaningId: "quote-decimal-label",
      paths: [{ path: "data.quote", type: "string" }],
    },
    applicability: {
      pricedExecution: "forbidden",
      availableInputs: [],
      asOf: now,
    },
  };
}

export function pinState(pin) {
  if (pin === STALE_PIN) return "stale_pin";
  if (pin !== PIN) return "pin_mismatch";
  return "match";
}

export function matchCompleteInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "input_required" };
  if (input.schema !== COMPLETE_INPUT_SCHEMA) return { ok: false, reason: "input_schema" };
  for (const key of FORBIDDEN) {
    if (Object.prototype.hasOwnProperty.call(input, key)) return { ok: false, reason: "command_refused" };
  }
  if (typeof input.meaningId !== "string" || input.meaningId.length === 0) return { ok: false, reason: "meaningId" };
  if (typeof input.pin !== "string" || input.pin.length === 0) return { ok: false, reason: "pin_required" };
  if (canonical(input.contract) !== canonical(SUPPLIED_CONTRACT)) return { ok: false, reason: "contract_mismatch" };
  return { ok: true, pin: pinState(input.pin) };
}

function gitHead(root) {
  const ran = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (ran.status !== 0) return null;
  return ran.stdout.trim();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function resolveContractModule(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    const error = new Error("repo_required");
    error.code = "repo_required";
    throw error;
  }
  const root = realpathSync(resolve(repoRoot));
  const modulePath = realpathSync(join(root, CONTRACT_MODULE));
  const rel = relative(root, modulePath);
  if (rel !== CONTRACT_MODULE || isAbsolute(rel) || rel.startsWith("..")) {
    const error = new Error("consumer_path_refused");
    error.code = "consumer_path_refused";
    throw error;
  }
  return { root, modulePath };
}

function documentReasons(result) {
  return (result?.stages?.render?.ineligible || [])
    .filter((row) => row.id === READINESS_ENTRY)
    .flatMap((row) => row.reasons || []);
}

function notInvoked(reason) {
  return {
    state: "not_invoked",
    reason,
    coldStartExecuted: false,
    faithfulInvocation: false,
    adapterInvoked: false,
    completedUserTask: false,
  };
}

function evaluate(mod, contract) {
  const cases = {};
  for (const [name, schemaKey, bodyKey] of CASE_INPUTS) {
    cases[name] = mod.diagnoseSuppliedContract({
      method: contract.method,
      path: contract.path,
      requiredPaths: contract.requiredPaths,
      schema: contract[schemaKey],
      body: contract[bodyKey],
    });
  }
  return cases;
}

function picked(row) {
  return {
    schema: row?.schema ?? null,
    semantic: row?.semantic ?? null,
    nextAction: row?.nextAction ?? null,
    quoteGenerated: row?.quoteGenerated === true,
    paymentSent: row?.paymentSent === true,
    routeFetched: row?.routeFetched === true,
    repairPosted: row?.repairPosted === true,
  };
}

function caseMismatches(actual) {
  const found = [];
  for (const name of Object.keys(EXPECTED)) {
    if (canonical(picked(actual?.[name])) !== canonical(EXPECTED[name])) found.push(name);
  }
  return found;
}

function decisionChanged(cases) {
  return cases?.conforming?.nextAction === "decimal_match"
    && cases?.wrong?.nextAction === "value_mismatch:data.quote"
    && cases?.conforming?.semantic?.state === "pass"
    && cases?.wrong?.semantic?.state === "fail"
    && cases?.wrong?.semantic?.shape === "string"
    && cases?.wrong?.schema?.state === "pass"
    && cases?.malformed?.semantic?.shape === "number"
    && cases?.absentPath?.nextAction === "seller_response_required_path_missing:data.quote"
    && cases?.absentPath?.semantic?.state === "pass"
    && cases?.nullable?.nextAction === "type_not_guaranteed:data.quote"
    && cases?.enum?.nextAction === "enum_not_guaranteed:data.quote"
    && cases?.unsupported?.nextAction === "schema_unsupported"
    && cases?.conforming?.nextAction !== cases?.wrong?.nextAction
    && cases?.absentPath?.nextAction !== cases?.conforming?.nextAction;
}

export async function completeReadiness({ catalog, task, callerInput, repoRoot, freshCatalog = null, now }) {
  const occurredAt = now || new Date().toISOString();
  const input = matchCompleteInput(callerInput);
  const pin = input.ok ? input.pin : null;
  const selection = input.ok ? selectTask({ catalog, task, freshCatalog, now: occurredAt }) : null;
  const quote = input.ok ? selectTask({ catalog, task: quoteProbe(occurredAt), freshCatalog, now: occurredAt }) : null;
  const selected = selection?.stages?.selected || null;
  const qualified = input.ok
    && pin === "match"
    && selected?.state === "selected"
    && selected.entryId === READINESS_ENTRY
    && selected.cost?.state === "known_free";
  const shell = {
    schema: COMPLETE_JOURNEY_SCHEMA,
    feature: COMPLETE_FEATURE,
    sourceFeature: FEATURE,
    occurredAt,
    runtime: process.version,
    meaningId: callerInput?.meaningId || null,
    meaningIdRole: "task_label",
    semanticEquivalence: false,
    stages: {
      query: selection?.stages?.query?.state || "rejected",
      render: selection?.stages?.render?.state || "not_rendered",
      selection: selected?.state || "not_selected",
      execution: "not_invoked",
      ownerAcceptance: "not_observed",
      outsideAcceptance: "not_observed",
    },
    selection: selected,
    blocked: (selection?.stages?.render?.ineligible || [])
      .filter((row) => row.id === READINESS_ENTRY)
      .map((row) => ({ id: row.id, reasons: row.reasons })),
    discoveryQuote: quote ? {
      state: quote.stages.selected.state,
      reason: quote.stages.selected.reason,
      entryId: quote.stages.selected.entryId,
      documentReasons: documentReasons(quote),
      meaningId: quote.stages.query.meaningId,
      meaningIdRole: quote.stages.query.meaningIdRole || "task_label",
      semanticEquivalence: false,
    } : null,
    pin: {
      state: pin || (input.ok ? "match" : input.reason),
      expected: PIN,
      supplied: callerInput?.pin || null,
      adapterInvoked: false,
    },
    invocation: notInvoked(input.ok ? (pin !== "match" ? pin : (selected?.reason || "not_qualified")) : input.reason),
    outputValidation: { ok: false, reason: input.ok ? "not_invoked" : input.reason },
    ownerAcceptance: {
      state: "not_observed",
      accepted: false,
      ownerQa: true,
      independentCustomer: false,
      completedUserTask: false,
    },
    outsideAcceptance: {
      state: "not_observed",
      accepted: false,
      independentCustomer: false,
    },
    attention: { state: "unknown", amount: null, currency: null },
    downstreamEffects: {
      publicDeploymentActivated: false,
      paymentSent: false,
      paymentSigned: false,
      credentialsUsed: false,
      publication: false,
      coldStartExecuted: false,
      productionMutation: false,
      wallet: false,
      claimSubmitted: false,
      repairPosted: false,
      quoteGenerated: false,
    },
    directComparison: {
      directPathRetained: true,
      savingsClaim: false,
      customerTime: false,
      sharedUpkeep: "the pure module read is shared; an unmeasured install is not recorded as zero",
    },
  };
  if (!input.ok || !qualified) return shell;

  let resolved;
  try {
    resolved = resolveContractModule(repoRoot);
  } catch (error) {
    shell.invocation = notInvoked(error.code || "consumer_path_refused");
    shell.outputValidation = { ok: false, reason: shell.invocation.reason };
    return shell;
  }
  const discoveryPath = join(resolved.root, "client/public/discovery/task-readiness.json");
  let discovery = null;
  try {
    discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
  } catch {
    discovery = null;
  }
  const documentPin = discovery?.pins?.s14?.commit || null;
  if (documentPin !== PIN) {
    shell.pin = { state: "document_pin_mismatch", expected: PIN, supplied: documentPin, adapterInvoked: false };
    shell.invocation = notInvoked("document_pin_mismatch");
    shell.outputValidation = { ok: false, reason: "document_pin_mismatch" };
    return shell;
  }
  const coldStart = Array.isArray(discovery?.coldStart) ? discovery.coldStart.filter((line) => typeof line === "string") : [];
  const mod = await import(pathToFileURL(resolved.modulePath).href);
  if (mod.PRICE_PATTERN?.source !== callerInput.contract.valuePattern) {
    shell.invocation = notInvoked("pattern_mismatch");
    shell.outputValidation = { ok: false, reason: "pattern_mismatch" };
    return shell;
  }
  shell.sourceAcquisition = {
    repoRoot: resolved.root,
    head: gitHead(resolved.root),
    module: CONTRACT_MODULE,
    pin: PIN,
    documentPin,
    pinVerified: true,
    adapterInvoked: false,
    discoverySha256: sha256File(discoveryPath),
    coldStartUntrusted: coldStart,
    coldStartUsedForInvocation: false,
    valuePatternEvaluatedBy: "semanticResult",
    valuePattern: mod.PRICE_PATTERN.source,
  };
  const contract = callerInput.contract;
  const directStart = performance.now();
  const directCases = evaluate(mod, contract);
  const directSemantic = mod.semanticResult(contract.wrong);
  const directMs = performance.now() - directStart;
  const handoffStart = performance.now();
  const handoffCases = evaluate(mod, contract);
  const handoffSemantic = mod.semanticResult(contract.wrong);
  const handoffMs = performance.now() - handoffStart;
  const mismatches = caseMismatches(handoffCases);
  const changed = decisionChanged(handoffCases);
  const sameSemantic = canonical(handoffCases.wrong.semantic) === canonical(handoffSemantic)
    && canonical(directSemantic) === canonical(handoffSemantic);
  const validated = mismatches.length === 0 && changed && sameSemantic
    && quote.stages.selected.state === "no_fit"
    && quote.stages.selected.reason === "no_eligible_output"
    && documentReasons(quote).includes("path_absent:data.quote")
    && handoffCases.conforming.quoteGenerated === false
    && handoffCases.conforming.paymentSent === false
    && handoffCases.conforming.repairPosted === false;
  shell.stages.execution = "consumer_invoked";
  shell.stages.ownerAcceptance = validated ? "recorded" : "check_failed";
  shell.stages.outsideAcceptance = "not_observed";
  shell.invocation = {
    state: "invoked",
    consumer: "diagnoseSuppliedContract",
    semanticFunction: "semanticResult",
    coldStartExecuted: false,
    faithfulInvocation: false,
    adapterInvoked: false,
    completedUserTask: false,
    quoteGenerated: false,
  };
  shell.outputValidation = {
    ok: validated,
    reason: validated ? "predeclared_check" : "check_mismatch",
    mismatches,
    decisionChanged: changed,
    discoveryQuote: quote.stages.selected.state,
    semanticShape: handoffCases.wrong.semantic.shape,
    semanticState: handoffCases.wrong.semantic.state,
    conformingNextAction: handoffCases.conforming.nextAction,
    wrongNextAction: handoffCases.wrong.nextAction,
    absentNextAction: handoffCases.absentPath.nextAction,
  };
  shell.ownerAcceptance = {
    state: validated ? "recorded" : "check_failed",
    accepted: validated,
    ownerQa: true,
    independentCustomer: false,
    completedUserTask: false,
  };
  shell.outsideAcceptance = {
    state: "not_observed",
    accepted: false,
    independentCustomer: false,
  };
  shell.directComparison = {
    directMs,
    handoffMs,
    sameDecision: canonical(directCases) === canonical(handoffCases),
    directPathRetained: true,
    savingsClaim: false,
    customerTime: false,
    sharedUpkeep: "both paths call diagnoseSuppliedContract from the same module after the same qualification",
    note: "The pure contract check is the direct consumer. Selection qualifies the readiness document and does not replace that call.",
  };
  shell.actual = handoffCases;
  shell.nextAction = validated
    ? handoffCases.wrong.nextAction
    : "withhold";
  return shell;
}
