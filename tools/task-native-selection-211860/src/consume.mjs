import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonical } from "./canonical.mjs";
import {
  CONSUMER_FEATURE,
  CONSUMER_MODULE,
  INPUT_SCHEMA,
  JOURNEY_SCHEMA,
  PIN,
  QUOTE_SUCCESS,
  READINESS_ENTRY,
} from "./consumer-contract.mjs";
import { FEATURE, TASK_SCHEMA } from "./constants.mjs";
import { selectTask } from "./select.mjs";

const FORBIDDEN = ["command", "shell", "coldStart", "url", "argv"];

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

export function matchCallerInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "input_required" };
  if (input.schema !== INPUT_SCHEMA) return { ok: false, reason: "input_schema" };
  for (const key of FORBIDDEN) {
    if (Object.prototype.hasOwnProperty.call(input, key)) return { ok: false, reason: "command_refused" };
  }
  if (typeof input.meaningId !== "string" || input.meaningId.length === 0) return { ok: false, reason: "meaningId" };
  if (canonical(input.success) !== canonical(QUOTE_SUCCESS)) return { ok: false, reason: "success_check_mismatch" };
  return { ok: true };
}

function gitHead(root) {
  const ran = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (ran.status !== 0) return null;
  return ran.stdout.trim();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function resolveConsumer(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    const error = new Error("repo_required");
    error.code = "repo_required";
    throw error;
  }
  const root = realpathSync(resolve(repoRoot));
  const modulePath = realpathSync(join(root, CONSUMER_MODULE));
  const rel = relative(root, modulePath);
  if (rel !== CONSUMER_MODULE || isAbsolute(rel) || rel.startsWith("..")) {
    const error = new Error("consumer_path_refused");
    error.code = "consumer_path_refused";
    throw error;
  }
  return { root, modulePath };
}

function mismatches(expected, actual) {
  if (!actual || typeof actual !== "object") return ["json_absent"];
  const found = [];
  for (const key of Object.keys(expected)) {
    if (canonical(actual[key]) !== canonical(expected[key])) found.push(key);
  }
  return found;
}

function runOne(runPublicAdapter, relativePath, expected) {
  const ran = runPublicAdapter(relativePath);
  const fields = mismatches(expected, ran.json);
  const statusExpected = expected.ok === true ? 0 : 1;
  return {
    relative: relativePath,
    status: ran.status,
    statusExpected,
    json: ran.json,
    mismatches: fields,
    matches: fields.length === 0 && ran.status === statusExpected,
    paymentSent: ran.json?.paymentSent === true,
  };
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
  };
}

export async function consumeQualified({ catalog, task, callerInput, repoRoot, freshCatalog = null, now }) {
  const occurredAt = now || new Date().toISOString();
  const input = matchCallerInput(callerInput);
  const selection = input.ok ? selectTask({ catalog, task, freshCatalog, now: occurredAt }) : null;
  const quote = input.ok ? selectTask({ catalog, task: quoteProbe(occurredAt), freshCatalog, now: occurredAt }) : null;
  const selected = selection?.stages?.selected || null;
  const qualified = input.ok
    && selected?.state === "selected"
    && selected.entryId === READINESS_ENTRY
    && selected.cost?.state === "known_free";
  const shell = {
    schema: JOURNEY_SCHEMA,
    feature: CONSUMER_FEATURE,
    sourceFeature: FEATURE,
    occurredAt,
    meaningId: callerInput?.meaningId || null,
    meaningIdRole: "task_label",
    semanticEquivalence: false,
    stages: {
      query: selection?.stages?.query?.state || "rejected",
      render: selection?.stages?.render?.state || "not_rendered",
      selection: selected?.state || "not_selected",
      execution: "not_invoked",
      acceptance: "not_observed",
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
    invocation: notInvoked(input.ok ? (selected?.reason || "not_qualified") : input.reason),
    outputValidation: { ok: false, reason: input.ok ? "not_invoked" : input.reason },
    ownerUsefulness: {
      state: "not_observed",
      ownerQa: true,
      independentCustomer: false,
      completedUserTask: false,
      accepted: false,
      httpStatusIsAcceptance: false,
      decisionAdmissibleIsAcceptance: false,
    },
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
    },
    directComparison: {
      directPathRetained: true,
      savingsClaim: false,
      customerTime: false,
    },
  };
  if (!input.ok || !qualified) return shell;

  let resolved;
  try {
    resolved = resolveConsumer(repoRoot);
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
  const coldStart = Array.isArray(discovery?.coldStart) ? discovery.coldStart.filter((line) => typeof line === "string") : [];
  const mod = await import(pathToFileURL(resolved.modulePath).href);
  const provenance = mod.verifyPublicChecker();
  if (provenance.checker?.commit !== PIN) {
    shell.invocation = notInvoked("pin_mismatch");
    shell.sourceAcquisition = { pin: provenance.checker?.commit || null, expectedPin: PIN };
    return shell;
  }
  shell.sourceAcquisition = {
    repoRoot: resolved.root,
    head: gitHead(resolved.root),
    module: CONSUMER_MODULE,
    pin: PIN,
    pinVerified: true,
    discoverySha256: sha256File(discoveryPath),
    coldStartUntrusted: coldStart,
    coldStartUsedForInvocation: false,
    valuePatternEvaluatedBy: "not_invoked",
    valuePatternReason: "task_readiness_module_imports_server",
  };

  const directStart = performance.now();
  const directPositive = runOne(mod.runPublicAdapter, QUOTE_SUCCESS.positiveRelative, QUOTE_SUCCESS.positive);
  const directNegative = runOne(mod.runPublicAdapter, QUOTE_SUCCESS.negativeRelative, QUOTE_SUCCESS.negative);
  const directMs = performance.now() - directStart;
  const handoffStart = performance.now();
  const handoffPositive = runOne(mod.runPublicAdapter, QUOTE_SUCCESS.positiveRelative, QUOTE_SUCCESS.positive);
  const handoffNegative = runOne(mod.runPublicAdapter, QUOTE_SUCCESS.negativeRelative, QUOTE_SUCCESS.negative);
  const handoffMs = performance.now() - handoffStart;
  const validated = directPositive.matches && directNegative.matches && handoffPositive.matches && handoffNegative.matches
    && quote.stages.selected.state === "no_fit"
    && directPositive.paymentSent === false
    && directNegative.paymentSent === false;
  shell.stages.execution = "consumer_invoked";
  shell.invocation = {
    state: "invoked",
    consumer: "runPublicAdapter",
    coldStartExecuted: false,
    faithfulInvocation: false,
    completedUserTask: false,
    positive: { status: handoffPositive.status, id: handoffPositive.json?.id || null, ok: handoffPositive.json?.ok ?? null },
    negative: { status: handoffNegative.status, id: handoffNegative.json?.id || null, ok: handoffNegative.json?.ok ?? null },
  };
  shell.outputValidation = {
    ok: validated,
    reason: validated ? "predeclared_check" : "check_mismatch",
    positiveMismatches: handoffPositive.mismatches,
    negativeMismatches: handoffNegative.mismatches,
    discoveryQuote: quote.stages.selected.state,
    admissibleOnBoth: handoffPositive.json?.decision === "admissible" && handoffNegative.json?.decision === "admissible",
    decisionChanged: handoffPositive.json?.repairComplete === true && handoffNegative.json?.repairComplete === false
      && handoffNegative.json?.findings?.[0] === "seller_response_required_path_missing:data.quote",
  };
  shell.ownerUsefulness = {
    state: validated ? "actionable_finding" : "check_failed",
    ownerQa: true,
    independentCustomer: false,
    completedUserTask: false,
    accepted: false,
    httpStatusIsAcceptance: false,
    decisionAdmissibleIsAcceptance: false,
    nextAction: validated ? "seller_response_required_path_missing:data.quote remains the negative finding; payment was not sent" : "withhold",
  };
  shell.downstreamEffects.paymentSent = false;
  shell.directComparison = {
    directMs,
    handoffMs,
    sameDecision: canonical(directPositive.json) === canonical(handoffPositive.json)
      && canonical(directNegative.json) === canonical(handoffNegative.json),
    directPathRetained: true,
    savingsClaim: false,
    customerTime: false,
    note: "The adapter decision is the direct consumer result. Selection qualifies the readiness document and does not replace that call.",
  };
  shell.actual = {
    positive: handoffPositive.json,
    negative: handoffNegative.json,
  };
  return shell;
}
