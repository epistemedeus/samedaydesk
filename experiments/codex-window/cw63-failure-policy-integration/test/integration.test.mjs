import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { packDossier } from "../../../../tools/failed-delivery-dossier/lib/pack.mjs";
import { projectFailedDossier } from "../../../../tools/refund-obligation-projector/lib/failed-dossier.mjs";
import { factsFromPr52Receipt } from "../../../../tools/refund-obligation-projector/lib/facts.mjs";
import { buildReport } from "../../../../tools/extract-unpaid-honesty/lib/report.mjs";
import { classifyHonestyOutcome } from "../../../../tools/extract-unpaid-honesty/lib/enforcement.mjs";
import { loadHonestyInputs, probeExtractFetch } from "../../../../tools/extract-unpaid-honesty/lib/honesty.mjs";
import { installSchema, insertProjection, startDisposableCluster } from "../../../../tools/refund-obligation-projector/lib/postgres.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
const policy = fixture("explicit-policy.json");
const schema = "samedaydesk.paid-useful-jobs.receipt.v1";
const temp = mkdtempSync("/tmp/cw63-integration-test-");
test.after(() => rmSync(temp, { recursive: true, force: true }));
function cli(args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, TMPDIR: temp, NODE_OPTIONS: "--max-old-space-size=768" } });
}
function runWrapper(mode) {
  const before = mode === "refusal" ? "tools/lockfile-pin-delta/fixtures/html/not-a-lock.html" : "tools/lockfile-pin-delta/fixtures/journey/before.json";
  const r = cli(["server/paid-useful-jobs/bin/cli.mjs", "run", "lockfile-pin-delta", "--before", before,
    "--after", "tools/lockfile-pin-delta/fixtures/journey/before.json"]);
  assert.equal(r.status, mode === "refusal" ? 2 : 0, r.stderr + r.stdout);
  return { body: JSON.parse(r.stdout), cli: { exitCode: r.status, argv: r.spawnargs }, originClass: "local-runtime", sourceKind: "wrapper-receipt" };
}
const refused = runWrapper("refusal");
const nochange = runWrapper("no-change");
const packed = (item = refused, extra = []) => packDossier({ items: [item, ...extra] });

test("actual wrapper refusal remains executed analysis, with no settlement amount or policy", () => {
  const result = projectFailedDossier(packed());
  const row = result.projection.records[0];
  assert.equal(row.outcomeKind, "refusal");
  assert.equal(row.executionStatus, "executed");
  assert.equal(row.transport, "ok");
  assert.equal(row.refundClaim, "unknown");
  assert.equal(row.refundClaimSource, "no_policy");
  assert.equal(row.amountUsdc, null);
  assert.equal(row.buyerClass, "unknown");
  assert.equal(row.operationId, null);
  assert.equal(row.executionId, refused.body.executionId);
  assert.equal(row.paymentClassification.settlementStatus, "not-attempted");
});
test("fresh projector CLI consumes the dossier and refuses refund, payout and revenue controls", () => {
  const path = join(temp, "dossier.json");
  writeFileSync(path, JSON.stringify(packed()));
  const bin = "tools/refund-obligation-projector/bin/project.mjs";
  const without = cli([bin, "--dossier", path]);
  const withPolicy = cli([bin, "--dossier", path, "--policy", "experiments/codex-window/cw63-failure-policy-integration/fixtures/explicit-policy.json"]);
  assert.equal(without.status, 0, without.stderr + without.stdout);
  assert.equal(withPolicy.status, 0, withPolicy.stderr + withPolicy.stdout);
  const unknown = JSON.parse(without.stdout);
  const explicit = JSON.parse(withPolicy.stdout);
  assert.equal(unknown.projection.records[0].refundClaim, "unknown");
  assert.equal(explicit.projection.records[0].refundClaim, "not-offered");
  const controls = [];
  for (const [flag, code] of [["--execute-refund", "execute_refund_refused"], ["--post-paid", "post_paid_refused"], ["--sum-as-revenue", "sum_across_buyer_class_as_revenue"]]) {
    const r = cli([bin, "--dossier", path, flag]);
    assert.equal(r.status, 1, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.code, code);
    controls.push({ flag, expectedExit: 1, actualExit: r.status, code, expectedRefusal: true });
  }
  if (process.env.CW63_EVIDENCE_DIR) {
    for (const [name, data] of Object.entries({ "fresh-dossier": packed(), "fresh-projection-no-policy": unknown,
      "fresh-projection-explicit-policy": explicit, "fresh-cli-controls": controls })) {
      writeFileSync(join(process.env.CW63_EVIDENCE_DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
    }
  }
});
test("actual no-change is derived from engine counts and hash-verified complete files", () => {
  assert.equal(packed(nochange).evidence[0].outcomeKind, "no-change");
  for (const output of nochange.body.outputs) {
    const bytes = readFileSync(output.path);
    assert.equal(bytes.length, output.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), output.sha256);
  }
  const output = JSON.parse(readFileSync(nochange.body.outputs.find((o) => o.name === "pin-delta.json").path));
  assert.equal(output.counts.changed + output.counts.added + output.counts.removed, 0);
  assert.equal(projectFailedDossier(packed(nochange), { policy }).projection.records[0].refundClaim, "unknown");
});
test("explicit exact policy affects claim only and a policy requiring unbound terms remains unknown", () => {
  const row = projectFailedDossier(packed(), { policy }).projection.records[0];
  assert.equal(row.refundClaim, "not-offered");
  assert.equal(row.refundClaimSource, "explicit_policy");
  assert.equal(row.paidOut, false);
  assert.equal(row.outcomeKind, "refusal");
  const terms = projectFailedDossier(packed(), { policy: { ...policy, termsVersion: `sha256:${"a".repeat(64)}` } }).projection.records[0];
  assert.equal(terms.refundClaim, "unknown");
  assert.equal(terms.refundClaimSource, "terms_unverified");
  assert.throws(() => projectFailedDossier(packed(), { policy: { ...policy, termsVersion: 1 } }), /integer/);
});
test("jobId never becomes a settlement operationId and missing legacy execution stays unknown", () => {
  const legacy = { schema, jobId: "some-settlement-id", sold: false, fundingState: "unfunded" };
  const facts = factsFromPr52Receipt(legacy);
  assert.equal(facts.operationId, null);
  assert.equal(facts.outcomeKind, "unknown");
  const row = projectFailedDossier(packed({ sourceKind: "wrapper-receipt", body: legacy })).projection.records[0];
  assert.equal(row.paymentClassification.settlementStatus, "unknown");
  assert.equal(row.refundClaim, "unknown");
});
test("catalog expectation, unpaid 402 and checkout missing intake remain non-execution context", () => {
  const extras = [
    { sourceKind: "extract-unpaid", body: { expectedStatus: 402 } },
    { sourceKind: "extract-unpaid", body: { httpStatus: 402 }, originClass: "local-runtime", http: { method: "GET", path: "/extract", status: 402 } },
    { sourceKind: "checkout-intake", body: { fulfillmentPending: true } },
  ];
  const context = projectFailedDossier(packed(refused, extras)).projection.contextEvidence;
  assert.deepEqual(context.map((e) => e.outcomeKind), ["expected-paywall", "observed-paywall", "incomplete-delivery"]);
  assert.deepEqual(context.map((e) => e.observedHttpStatus), [null, 402, null]);
  assert.ok(context.every((e) => e.executionStatus === "not-executed" && e.settlementStatus === "unknown"));
  assert.throws(() => projectFailedDossier(packDossier({ items: extras })), /exactly one/);
});
test("external 500 is never rewritten to 402 and checkout is not live extract evidence", () => {
  const extract = packed(refused, [{ sourceKind: "extract-unpaid", body: { expectedStatus: 402 }, originClass: "external", http: { status: 500 } }]);
  assert.equal(extract.honesty.liveExtractUnpaid.observedHttpStatus, 500);
  assert.equal(extract.honesty.liveExtractUnpaid.localRuntime402, false);
  const checkout = packed(refused, [{ sourceKind: "checkout-intake", body: { fulfillmentPending: true }, originClass: "external", http: { status: 200 } }]);
  assert.equal(checkout.honesty.liveExtractUnpaid.observationStatus, "unrun");
});
test("projection recomputes wrapper and context summaries from retained source", () => {
  const dossier = packed(refused, [{ sourceKind: "extract-unpaid", body: { expectedStatus: 402 } }]);
  dossier.evidence[0].outcomeKind = "no-change";
  dossier.evidence[0].paymentClassification.settlementStatus = "settled";
  dossier.evidence[1].observationStatus = "observed";
  dossier.evidence[1].observedHttpStatus = 402;
  const projection = projectFailedDossier(dossier).projection;
  assert.equal(projection.records[0].outcomeKind, "refusal");
  assert.equal(projection.records[0].paymentClassification.settlementStatus, "not-attempted");
  assert.equal(projection.contextEvidence[0].observationStatus, "expected");
});
test("contradictory wrapper and receipt fields are refused", () => {
  const item = structuredClone(refused);
  item.body.receipt.transport = "engine-crash";
  assert.equal(packed(item).ok, false);
});
for (const mode of ["transport-failure", "missing-body"]) test(`seeded ${mode} stays distinct through actual wrapper and projector`, () => {
  const result = cli(["experiments/codex-window/cw63-failure-policy-integration/fixtures/control-wrapper.mjs", mode]);
  assert.equal(result.status, 2, result.stderr);
  const row = projectFailedDossier(packed({ sourceKind: "wrapper-receipt", body: JSON.parse(result.stdout) })).projection.records[0];
  assert.equal(row.outcomeKind, mode);
  assert.equal(row.refundClaim, "unknown");
});
test("quoted payment text is observation and never a detected request", () => {
  const report = buildReport({ loaded: loadHonestyInputs(), spawnResult: { status: 0, json: { ok: true }, stdout: "Catalog says https://agents.samedaydesk.com/extract?url=x; PAYMENT-SIGNATURE is forbidden", stderr: "" }, log: [], intercept: { kind: "test", port: 0 }, kit: {} });
  assert.equal(report.paymentTextObserved, true);
  assert.equal(report.paymentAttemptDetected, false);
  assert.equal(report.outcomeClass, "valid-unpaid");
  assert.equal(report.osIsolation, false);
});
test("a script echoing the guard error cannot manufacture an intercepted request", async () => {
  const path = join(temp, "echo-guard.mjs");
  writeFileSync(path, "console.error('honesty_forbidden_request'); process.exitCode = 2;\n");
  const report = await probeExtractFetch({ script: path });
  assert.equal(report.paymentAttemptDetected, false);
  assert.equal(report.guardErrorTextObserved, true);
  assert.equal(report.escaped, null);
  assert.equal(report.outcomeClass, "request-unobserved");
});
test("D23 spawn failure, missing body and valid refusal have separate classifications", () => {
  assert.equal(classifyHonestyOutcome({ spawnError: true }).outcomeClass, "transport-failure");
  assert.equal(classifyHonestyOutcome({ exitCode: 0, engineResult: null }).outcomeClass, "missing-body");
  assert.equal(classifyHonestyOutcome({ exitCode: 2, engineResult: { ok: false, refused: true } }).outcomeClass, "valid-refusal");
});
test("real Postgres preserves actual classifications and rejects payout and missing facts", () => {
  const cluster = startDisposableCluster();
  try {
    installSchema(cluster);
    insertProjection(cluster, projectFailedDossier(packed()).projection);
    insertProjection(cluster, projectFailedDossier(packed(), { policy }).projection);
    const result = cluster.psql("SELECT record->>'outcomeKind', record->>'refundClaim', record->>'paidOut' FROM failed_job_policy_projections ORDER BY policy_key;");
    assert.match(result, /refusal/);
    assert.match(result, /not-offered/);
    assert.match(result, /unknown/);
    assert.throws(() => cluster.psql("UPDATE failed_job_policy_projections SET record = jsonb_set(record, '{paidOut}', 'true');"), /failed_job_never_paid/);
    assert.throws(() => cluster.psql("UPDATE failed_job_policy_projections SET record = record - 'paidOut';"), /failed_job_never_paid/);
    assert.throws(() => cluster.psql("UPDATE failed_job_policy_projections SET record = jsonb_set(record, '{refundClaim}', '\"payable\"') WHERE policy_key <> 'no-policy';"), /failed_job_nonpayable/);
  } finally { cluster.stop(); }
});
