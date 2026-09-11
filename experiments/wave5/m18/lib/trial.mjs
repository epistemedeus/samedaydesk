import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_SHA, PINS, SDS_ROOT, TRIAL_SCHEMA } from "./pins.mjs";
import { afterObservedAtFromReport, evaluateCaptureFreshness } from "./freshness.mjs";
import { loadCaseById, resolveCaseInputs } from "./cases.mjs";
import { resolveEngine } from "./resolve-engine.mjs";
import { spawnPageChange } from "./spawn-engine.mjs";
import { loadExtractBatch, provenanceMatches, verifyFacts } from "./verify-fact.mjs";

function integerLimit(value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    const error = new Error("limit must be a finite non-negative integer");
    error.code = "usage";
    throw error;
  }
  return number;
}

function limitArgs(limits = {}) {
  const args = [];
  if (limits.maxStaleMs != null) args.push("--max-stale-ms", String(limits.maxStaleMs));
  if (limits.maxSources != null) args.push("--max-sources", String(limits.maxSources));
  if (limits.maxBytes != null) args.push("--max-bytes", String(limits.maxBytes));
  if (limits.maxFields != null) args.push("--max-fields", String(limits.maxFields));
  if (limits.maxChanges != null) args.push("--max-changes", String(limits.maxChanges));
  return args;
}

function remainingBindings() {
  return [
    "M05: engine still leaves claims.fresh/current false and does not apply maxStaleMs; snapshot.truncated stays false when source_limit fires",
    "M09: independent snapshot corpus not bound; owner-labelled captures and SDS52 published customer-job are the tested sources",
    "D24: clean-environment package install of this kit plus engine pin is not claimed from this SDS52 checkout",
    "M01: useful-jobs catalog has no page-change job; sdd.page_change_offline artifact still names the merchant skill",
    "Field: live extract/pay/customer watch is not run here. Caller supplies already-held extract-batch JSON and a query clock.",
  ];
}

export function runCase(spec, {
  outDir,
  engine,
  sdsRoot = SDS_ROOT,
} = {}) {
  if (!outDir) {
    const error = new Error("trial requires --out-dir");
    error.code = "usage";
    throw error;
  }
  mkdirSync(outDir, { recursive: true });
  const resolvedEngine = engine || resolveEngine({ sdsRoot });
  const inputs = resolveCaseInputs(spec, { sdsRoot });
  const fields = Array.isArray(spec.fields) ? spec.fields.join(",") : spec.fields;
  const limits = spec.limits || {};
  const args = [
    "compare",
    "--before", inputs.before.path,
    "--after", inputs.after.path,
    "--fields", fields,
    "--clock", spec.clock,
    "--out-dir", outDir,
    ...limitArgs(limits),
  ];
  const spawned = spawnPageChange({
    cli: resolvedEngine.cli,
    args,
    cwd: resolvedEngine.engineRoot,
  });

  const result = {
    schema: TRIAL_SCHEMA,
    id: spec.id,
    label: spec.label || "owner-qa",
    kind: spawned.kind,
    code: spawned.code,
    ok: spawned.kind === "valid_analysis",
    testedEngine: {
      sha: resolvedEngine.sha || ENGINE_SHA,
      source: resolvedEngine.source,
      cli: resolvedEngine.cli,
      id: PINS.engine.id,
    },
    captures: {
      beforePath: inputs.before.path,
      afterPath: inputs.after.path,
      beforeSha256: inputs.before.sha256,
      afterSha256: inputs.after.sha256,
    },
    remainingBindings: remainingBindings(),
  };

  if (spawned.kind !== "valid_analysis") {
    result.engine = {
      exitCode: spawned.exitCode,
      stderr: spawned.stderr || "",
    };
    writeFileSync(join(outDir, "trial.json"), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  const report = JSON.parse(readFileSync(spawned.jsonPath, "utf8")).report;
  const beforeBatch = loadExtractBatch(inputs.before.path).parsed;
  const afterBatch = loadExtractBatch(inputs.after.path).parsed;
  const facts = verifyFacts({
    beforeBatch,
    afterBatch,
    report,
    facts: spec.facts,
  });
  const freshness = evaluateCaptureFreshness({
    clock: spec.clock,
    maxStaleMs: integerLimit(limits.maxStaleMs),
    afterObservedAt: afterObservedAtFromReport(report),
  });

  result.ok = spawned.kind === "valid_analysis";
  result.factsVerified = facts.length ? facts.every((fact) => fact.verified) : null;
  result.engine = {
    exitCode: spawned.exitCode,
    verdict: report.verdict,
    schema: report.schema,
    complete: report.claims.complete,
    usefulOutputProven: report.claims.usefulOutputProven,
    paymentImpliesUsefulOutput: report.claims.paymentImpliesUsefulOutput,
    freshness: report.freshness,
    claimsFresh: report.claims.fresh,
    claimsCurrent: report.claims.current,
    snapshotTruncated: {
      before: report.snapshot?.before?.truncated === true,
      after: report.snapshot?.after?.truncated === true,
    },
    coverageUnknown: report.coverageUnknown,
    summary: report.summary,
    termsVersion: report.provenance.termsVersion,
    comparedWithClock: report.provenance.comparedWithClock,
    digestSha256: report.provenance.digestSha256,
    written: { jsonPath: spawned.jsonPath, mdPath: spawned.mdPath },
  };
  result.captures.matchEngineProvenance = provenanceMatches(
    report,
    inputs.before.sha256,
    inputs.after.sha256,
  );
  result.facts = facts;
  result.freshness = freshness;
  if (!result.captures.matchEngineProvenance) {
    result.ok = false;
    result.code = "capture_digest_mismatch";
  }
  writeFileSync(join(outDir, "trial.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function runNamedCase(id, options) {
  return runCase(loadCaseById(id, options?.packageRoot), options);
}
