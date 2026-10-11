import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUPPORT, INSTALLED_SCHEMA, OBSERVATION_SCHEMA, RESULT_SCHEMA } from "./support.mjs";
import { EvidenceError, readJson, requireEvidence, seal, sha256Hex, stableStringify, validTime, verifySeal, writeImmutable } from "./evidence.mjs";
import { checkRef, checkRuntime, git, observationFields, snapshot } from "./source.mjs";
import { runSourceChangeAlert } from "../recurring-job-recipes/recipes/source-change-alert.mjs";
import { runVerificationReconcile } from "../recurring-job-recipes/recipes/verification-reconcile.mjs";
import { classifyStaleBaseline } from "../recurring-job-recipes/lib/recovery.mjs";
import { fetchPublicSafe } from "../recurring-job-recipes/lib/fetch.mjs";

const OUTCOMES = new Set(["unchanged", "relevant_change"]);
const actions = {
  unchanged: "Keep the installed repair and immutable prior. Capture another finite observation only when Root has a new source/ref or runtime decision; a next need is not established by this run.",
  relevant_change: "In an isolated checkout of the exact observed toRef, run the owning public-acquisition suite and inspect the changed source/runtime conditions. Receive an actual installation before sequencing a replacement baseline.",
  stale_baseline: "Recheck the installed CLI and runtime, capture a fresh installation receipt as a separate artifact, then compare the intended exact source refs.",
  insufficient_coverage: "Supply the missing installed-state, exact source objects or supported dependency coverage. Keep the prior and unrelated retained knowledge.",
  partial: "Keep the partial observation and prior. Capture only the missing source/runtime evidence in a new explicit invocation; partial evidence does not establish unchanged behavior.",
  timed_out: "Keep the timeout observation and prior. Root may request another bounded read after checking the source/transport; no mutation or payment is replayed.",
  error: "Inspect the recorded failure, then supply a corrected observation in a new explicit invocation. Keep prior source knowledge.",
  uncertain_state: "Inspect the existing pending or damaged artifact and its input digests. Do not overwrite it or automatically repeat the operation; use a new explicit invocation after receiving the uncertainty.",
};
function result(outcome, reason, context = {}) {
  return { schema: RESULT_SCHEMA, repairId: SUPPORT.repairId, repository: SUPPORT.repository,
    ok: OUTCOMES.has(outcome), outcome, reason, ...context,
    nextCheck: { owner: "Root", action: actions[outcome], command: outcome === "relevant_change" ? SUPPORT.normalCommand : null, taskPredicate: SUPPORT.predicate },
    knowledge: { applicabilityAuthority: "211400", correctionValidityChanged: false, unrelatedKnowledgeDiscarded: false },
    effects: { finiteInvocation: true, installedStateChanged: false, paymentAttempted: false, messagesSent: false, subscriptionCreated: false },
    costs: { purchasesInitiated: 0, hostCashCost: "unknown", includedModelUsage: "not measured by the consumer", operatorResources: "unknown", requesterEffort: "unknown", receivingEffort: "unknown", supportEffort: "unknown" },
    claims: { sourceImpactOnly: true, behaviorRegressionProven: false, candidateInstalled: false,
      customerOwnership: "unknown", outsideAcceptance: "unknown", savings: "unmeasured", revenue: "not established", paymentReconciled: false },
  };
}
export async function readObservation({ observationPath, observationUrl, mountedOrigin = false, timeoutMs = 5000 }) {
  requireEvidence(Boolean(observationPath) !== Boolean(observationUrl), "one_observation_required");
  if (observationPath) return { ...readJson(observationPath), transport: { kind: "local_file", attempts: 0 } };
  let url;
  try { url = new URL(observationUrl); } catch { throw new EvidenceError("observation_url_invalid"); }
  requireEvidence(!url.username && !url.password && !url.search && !url.hash, "observation_url_invalid");
  const mounted = mountedOrigin && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  const primary = url.protocol === "https:" && url.hostname === "raw.githubusercontent.com" && url.pathname.startsWith("/epistemedeus/samedaydesk/");
  requireEvidence(mounted || primary, "observation_origin_not_supported");
  // Own the request's lifetime even when the reused transport rejects headers
  // before consuming a body (redirect or declared oversize). Do not leave it
  // running after this finite invocation has recorded a refusal.
  const requestController = new AbortController();
  const transport = { kind: mounted ? "mounted_http" : "public_primary_source", attempts: 1,
    urlSha256: sha256Hex(observationUrl), attemptWindow: { start: new Date().toISOString(), end: null }, status: null, bytes: null, bodySha256: null };
  try {
    const response = await fetchPublicSafe(observationUrl, { timeoutMs, headers: { accept: "application/json" },
      fetchImpl: (target, options) => globalThis.fetch(target, { ...options, signal: AbortSignal.any([options.signal, requestController.signal]) }) });
    Object.assign(transport, { status: response.status, bytes: response.bytes, bodySha256: sha256Hex(response.text) });
    requireEvidence(response.status === 200, `observation_http_${response.status}`, "error");
    let document;
    try { document = JSON.parse(response.text); } catch { throw new EvidenceError("observation_invalid_json", "error"); }
    return { document, sha256: sha256Hex(response.text), transport };
  } catch (error) {
    const timedOut = error.name === "AbortError" || error.name === "TimeoutError";
    const code = timedOut ? "observation_timed_out" : error.message === "live-safe redirects are not followed" ? "observation_redirect_refused"
      : /exceeds 1048576 byte limit/.test(error.message) ? "observation_body_limit" : "observation_transport_error";
    const failure = error instanceof EvidenceError ? error : new EvidenceError(code, timedOut ? "timed_out" : "error");
    failure.transport = transport; throw failure;
  } finally { transport.attemptWindow.end = new Date().toISOString(); requestController.abort(); }
}
function same(a, b) { return stableStringify(a) === stableStringify(b); }
// The caller retains its complete input. Only the supported source slice travels.
function sourceSlice(value) {
  if (!value) return null;
  const digest = text => typeof text === "string" && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(text) ? text : null;
  const witness = (row, path) => row ? { path, status: ["present", "absent"].includes(row.status) ? row.status : "unknown",
    mode: ["100644", "100755"].includes(row.mode) ? row.mode : null, blob: digest(row.blob), sha256: digest(row.sha256) } : null;
  return { ref: digest(value.ref), tree: digest(value.tree), source: witness(value.source, SUPPORT.sourcePath), manifest: witness(value.manifest, SUPPORT.manifestPath),
    nodeRequirement: typeof value.nodeRequirement === "string" && (/^[0-9.vxX*<>=~^|+\- ()]{1,128}$/.test(value.nodeRequirement) || ["<manifest-absent>", "<requirement-absent>"].includes(value.nodeRequirement)) ? value.nodeRequirement : null,
    packageVersion: typeof value.packageVersion === "string" && /^\d+\.\d+\.\d+$/.test(value.packageVersion) ? value.packageVersion : null };
}
function runtimeSlice(value) { return value ? { node: value.node, tar: value.tar, evidenceKind: value.evidenceKind } : null; }
function coverageSlice(value) {
  return value ? { sourcePaths: Array.isArray(value.sourcePaths) ? value.sourcePaths.filter(p => [SUPPORT.sourcePath, SUPPORT.manifestPath].includes(p)) : [],
    dependencyNames: Array.isArray(value.dependencyNames) ? value.dependencyNames.filter(p => SUPPORT.dependencies.includes(p)) : [],
    installedStateComplete: value.installedStateComplete === true, history: value.history === "two_exact_snapshots_only" ? value.history : null } : null;
}
function covers(coverage) {
  return coverage && same(coverage.sourcePaths, [SUPPORT.sourcePath, SUPPORT.manifestPath]) && same(coverage.dependencyNames, SUPPORT.dependencies);
}
function validateInstalled(document) {
  verifySeal(document, "installed_integrity_mismatch");
  requireEvidence(document.schema === INSTALLED_SCHEMA && document.repairId === SUPPORT.repairId && document.repository === SUPPORT.repository, "unsupported_installed_repair");
  const installed = document.installation;
  requireEvidence(installed?.status === "verified_owner_qa" && installed.kind === "local_source_cli" && installed.owner === "Root" && installed.relationship === "owner_qa", "installed_acceptance_missing");
  checkRef(installed.ref);
  requireEvidence(covers(document.coverage) && document.coverage.installedStateComplete === true, "installed_state_coverage_missing");
  requireEvidence(installed.predicate === SUPPORT.predicate && installed.source?.ref === installed.ref && installed.source.source?.blob === SUPPORT.acceptedBlob && installed.source.source.sha256 === SUPPORT.acceptedSha256, "installed_repair_witness_missing");
  checkRuntime(installed.runtime);
  requireEvidence(/^v22\./.test(installed.runtime.node), "installed_runtime_not_supported");
  requireEvidence(same(installed.probes?.map(p => [p.name, p.exitCode]), [["valid_local_archive", 0], ["wrong_digest_local_archive", 1], ["shell_stops_on_refusal", 7]]), "installed_predicate_coverage_missing");
  const prior = document.prior;
  requireEvidence(prior?.schema === "samedaydesk.recurring-job-prior.v1" && prior.recipeId === "source-change-alert" && prior.immutable === true && prior.sequence === 1 && validTime(prior.createdAt) && prior.createdAt === installed.capturedAt, "missing_or_invalid_baseline");
  requireEvidence(prior.sha256 === sha256Hex(prior.payload) && same(prior.payload?.fields, observationFields(installed.source, installed.runtime)), "baseline_integrity_mismatch");
  return installed;
}
async function compareRecipes(prior, fields, clock, horizonHours) {
  const dir = await mkdtemp(join(tmpdir(), "release-impact-recipes-"));
  try {
    const priorPath = join(dir, "prior.json"), currentFixturePath = join(dir, "current.json");
    await writeFile(priorPath, stableStringify(prior), { flag: "wx" });
    await writeFile(currentFixturePath, stableStringify({ fields }), { flag: "wx" });
    const input = { priorPath, currentFixturePath, candidatePath: currentFixturePath, clock, horizonHours, fields: SUPPORT.fields, scheduleHint: "once", retries: 0 };
    const change = await runSourceChangeAlert(input);
    const verification = await runVerificationReconcile(input);
    requireEvidence(change.ok && verification.ok && change.outcome === verification.outcome, "recipe_comparison_disagrees", "error");
    const clean = value => typeof value === "string" ? value.replaceAll(priorPath, "installed-state:immutable-prior").replaceAll(currentFixturePath, "exact-source-observation:fields")
      : Array.isArray(value) ? value.map(clean) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)])) : value;
    return { change: clean(change), verification: clean(verification) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function assessImpact({ installed, observation, repo, clock, horizonHours, timeoutMs = 5000 }) {
  let context = { clock, horizonHours };
  try {
    requireEvidence(validTime(clock) && Number.isFinite(horizonHours) && horizonHours > 0 && horizonHours <= 8760, "explicit_clock_and_horizon_required");
    const baseline = validateInstalled(installed);
    const source = sourceSlice(baseline.source);
    context = { ...context, installation: { ref: baseline.ref, kind: baseline.kind, relationship: baseline.relationship,
      package: { name: "samedaydesk", version: source.packageVersion, repairVersion: `source@${SUPPORT.repairRef}` },
      capturedAt: baseline.capturedAt, source, runtime: runtimeSlice(baseline.runtime), receiptDigest: installed.integritySha256 },
      coverage: { installed: coverageSlice(installed.coverage), observation: coverageSlice(observation?.coverage) } };
    verifySeal(observation, "observation_integrity_mismatch");
    requireEvidence(observation.schema === OBSERVATION_SCHEMA && observation.repairId === SUPPORT.repairId && observation.repository === SUPPORT.repository && observation.kind === "source_comparison", "unsupported_source_observation");
    checkRef(observation.fromRef); checkRef(observation.toRef);
    context.comparedRefs = { from: observation.fromRef, to: observation.toRef, fromTree: sourceSlice(observation.before)?.tree || null, toTree: sourceSlice(observation.after)?.tree || null };
    context.observationWindow = { start: validTime(observation.window?.start) ? observation.window.start : null, end: validTime(observation.window?.end) ? observation.window.end : null };
    requireEvidence(observation.fromRef === baseline.ref, "baseline_ref_mismatch");
    requireEvidence(validTime(observation.observedAt) && validTime(observation.window?.start) && validTime(observation.window?.end)
      && observation.window.end === observation.observedAt && Date.parse(observation.window.start) <= Date.parse(observation.window.end)
      && Date.parse(observation.observedAt) <= Date.parse(clock) && Date.parse(baseline.capturedAt) <= Date.parse(observation.window.start), "source_or_installation_clock_invalid");
    const stale = classifyStaleBaseline(installed.prior.createdAt, clock, horizonHours);
    if (stale.stale) return result("stale_baseline", "installed_baseline_older_than_operator_horizon", { ...context, stale });
    if (observation.status !== "complete") {
      requireEvidence(["partial", "timed_out", "error"].includes(observation.status), "observation_status_missing");
      const knownFailures = ["source_check_timed_out", "runtime_check_timed_out", "source_ref_or_tree_unavailable", "source_manifest_invalid", "source_runtime_requirement_unrecognized", "source_runtime_requirement_missing", "source_repository_identity_mismatch", "unsupported_source_entry", "commit_object_required", "changed_paths_limit", "runtime_coverage_missing", "runtime_evidence_kind_missing", "tar_runtime_unavailable"];
      return result(observation.status, "incomplete_source_observation", { ...context,
        observedFailure: knownFailures.includes(observation.failureCode) ? observation.failureCode : "unclassified_observation_failure",
        failureCodeDigest: sha256Hex(observation.failureCode || null), successfulSourceWitnesses: { before: sourceSlice(observation.before), after: sourceSlice(observation.after) } });
    }
    requireEvidence(covers(observation.coverage) && observation.coverage.history === "two_exact_snapshots_only", "source_coverage_missing");
    checkRuntime(observation.runtime);
    const deadlineAt = Date.now() + timeoutMs;
    const before = await snapshot(repo, observation.fromRef, deadlineAt);
    const after = await snapshot(repo, observation.toRef, deadlineAt);
    requireEvidence(same(sourceSlice(before), sourceSlice(baseline.source)) && same(sourceSlice(before), sourceSlice(observation.before)) && same(sourceSlice(after), sourceSlice(observation.after)), "exact_source_witness_mismatch");
    const paths = (await git(repo, ["diff", "--no-ext-diff", "--name-only", "-z", observation.fromRef, observation.toRef, "--"], deadlineAt)).split("\0").filter(Boolean);
    requireEvidence(paths.length <= 2000 && same(paths, observation.changedPaths), "source_diff_coverage_mismatch");
    const fields = observationFields(after, observation.runtime);
    requireEvidence(SUPPORT.fields.every(k => typeof fields[k] === "string" && fields[k].length > 0), "selected_field_coverage_missing");
    const recipes = await compareRecipes(installed.prior, fields, clock, horizonHours);
    const outcome = recipes.change.outcome === "changed" ? "relevant_change" : "unchanged";
    const unrelatedPaths = paths.filter(path => path !== SUPPORT.sourcePath && !(path === SUPPORT.manifestPath && before.nodeRequirement !== after.nodeRequirement));
    return result(outcome, outcome === "relevant_change" ? "supported_source_or_dependency_changed" : unrelatedPaths.length ? "unrelated_source_change_supported_closure_unchanged" : "supported_source_and_dependencies_unchanged",
      { ...context, candidate: { source: sourceSlice(after), runtime: runtimeSlice(observation.runtime) }, sourceDiff: { changedPaths: paths, unrelatedPaths },
        supportedFieldChanges: recipes.change.evidence.changed, recipes, currentSourceCheckedLocally: true });
  } catch (error) { return result(error.outcome || "error", error.code || "assessment_error", context); }
}
export function invocationId({ installedDigest, observationDigest, clock, horizonHours }) {
  return sha256Hex({ installedDigest, observationDigest, clock, horizonHours });
}
export async function runOneShot(options) {
  let installedRead, observedRead, preparationError;
  try { installedRead = readJson(options.installedPath); validateInstalled(installedRead.document); } catch (error) { preparationError = error; }
  if (!preparationError) try { observedRead = await readObservation(options); } catch (error) { preparationError = error; }
  const inputs = { installedDigest: installedRead?.sha256 || "missing_or_unreadable", observationDigest: observedRead?.sha256 || preparationError?.transport?.bodySha256 || sha256Hex({ source: options.observationUrl || options.observationPath || null, failure: preparationError?.code }), clock: options.clock, horizonHours: options.horizonHours };
  const id = invocationId(inputs);
  const artifactPath = join(options.outDir, `${id}.result.json`), pendingPath = join(options.outDir, `${id}.pending.json`);
  const context = { clock: options.clock, horizonHours: options.horizonHours, invocationId: id, inputDigests: inputs,
    inputEvidence: { installed: installedRead ? "received_bytes" : "unreadable", observation: observedRead ? "received_bytes" : preparationError?.transport?.bodySha256 ? "refused_response_bytes" : "not_read_or_incomplete_request" },
    transport: observedRead?.transport || preparationError?.transport || { kind: "observation_input", attempts: 0, sourceCoverage: "not_observed" } };
  if (existsSync(artifactPath)) {
    try {
      const existing = verifySeal(readJson(artifactPath).document);
      requireEvidence(existing.invocationId === id && same(existing.inputDigests, inputs), "retained_artifact_identity_mismatch");
      return { ...existing, persisted: { status: "duplicate", artifactPath, priorPreserved: true } };
    } catch { return { ...result("uncertain_state", "retained_artifact_unverifiable", context), persisted: { status: "preserved_uncertain", artifactPath } }; }
  }
  // Keep this marker even after completion: a result, not marker deletion, proves completion.
  try { writeImmutable(pendingPath, seal({ schema: "samedaydesk.release-impact-211710.pending.v1", invocationId: id, inputDigests: inputs })); }
  catch (error) {
    if (error.code === "artifact_exists") return { ...result("uncertain_state", "unfinished_invocation_preserved", context), persisted: { status: "preserved_uncertain", pendingPath } };
    return { ...result("error", "cannot_reserve_artifact", context), persisted: { status: "failed" } };
  }
  const assessed = preparationError ? result(preparationError.outcome || "error", preparationError.code, { clock: options.clock, horizonHours: options.horizonHours })
    : await assessImpact({ ...options, installed: installedRead.document, observation: observedRead.document });
  const body = seal({ ...assessed, ...context });
  try {
    const persisted = writeImmutable(artifactPath, body);
    return { ...body, persisted: { ...persisted, status: "written", priorPreserved: true } };
  } catch { return { ...result("uncertain_state", "result_commit_unconfirmed", context), persisted: { status: "preserved_uncertain", pendingPath, artifactPath } }; }
}
