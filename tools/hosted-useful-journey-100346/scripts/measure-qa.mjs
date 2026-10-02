#!/usr/bin/env node
// Independent local QA measurement. Actual adjacent engines/stores, no public
// writes, payment, provider calls or fixtures relabeled as customer usefulness.
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runRecipe } from "../../recurring-job-recipes/lib/run.mjs";
import { UsefulJourneyClient } from "../client.mjs";
import { fixture, example } from "../test/support.mjs";
import assert from "node:assert/strict";

const f = await fixture();
const timed = async fn => { const start = performance.now(); const value = await fn(); return { value, elapsedMs: +(performance.now() - start).toFixed(3) }; };
try {
  const page = await example("page-watch");
  const issue = await example("issue-brief");
  const negative = await example("useful-negative");
  const direct = [];
  for (const [name, request] of [["page", page], ["issue", issue], ["negative", negative]]) {
    const priorPath = join(f.dir, `${name}-prior.json`); await writeFile(priorPath, JSON.stringify(request.input.prior));
    const args = { ...request.input, priorPath, liveSafe: false, retries: 0 };
    if (request.input.current) { args.currentFixturePath = join(f.dir, "page.html"); await writeFile(args.currentFixturePath, request.input.current.data); }
    if (request.input.issue) { args.issueFixturePath = join(f.dir, "issue.json"); await writeFile(args.issueFixturePath, JSON.stringify(request.input.issue)); }
    if (request.input.sources) {
      args.sources = [];
      for (const [i, s] of request.input.sources.entries()) { const path = join(f.dir, `source-${i}.html`); await writeFile(path, s.data); args.sources.push({ kind: "fixture", sourceKey: s.id, path }); }
    }
    direct.push(await timed(() => runRecipe(request.recipeId, args)));
  }
  const client = () => new UsefulJourneyClient({ origin: f.origin, ...f.a });
  const hosted = [];
  for (const [i, request] of [page, issue, negative].entries()) hosted.push(await timed(() => client().run(request, `measured-operation-${i}`, join(f.dir, `journal-${i}.json`))));
  assert.deepEqual(hosted[0].value.result.recipe.evidence.changed, direct[0].value.evidence.changed);
  assert.deepEqual(hosted[1].value.result.recipe.evidence.brief.actions, direct[1].value.evidence.brief.actions);
  assert.deepEqual(hosted[2].value.result.recipe.evidence.rows[0].missing, direct[2].value.evidence.rows[0].missing);
  const retained = hosted[0].value;
  await f.restart();
  const retrieval = await timed(() => client().result(retained.jobId, retained.taskId));
  assert.equal(retrieval.value.resultDigest, retained.resultDigest);
  const adaptation = await timed(async () => {
    const later = structuredClone(page); later.taskId = "measured-later-input";
    later.input.clock = "2026-10-02T15:00:00.000Z";
    delete later.input.prior;
    later.input.priorResult = { jobId: retained.jobId, taskId: retained.taskId, digest: retained.resultDigest };
    later.input.current.data = "<title>SDK 3.0</title><h1>New response contract</h1>";
    return later;
  });
  const later = await timed(() => client().run(adaptation.value, "measured-later-operation", join(f.dir, "later-journal.json")));
  const review = await timed(async () => {
    assert.deepEqual(later.value.result.recipe.evidence.changed, [{ field: "title", before: "SDK 2.0", after: "SDK 3.0" }]);
    assert.equal(later.value.result.nextPrior.sequence, 3);
    return true;
  });
  const exported = await timed(() => client().export(retained.jobId, { taskId: retained.taskId, resultDigest: retained.resultDigest,
    optIn: true, purpose: "later-task-reuse", subject: "measured-sdk-watch", sequence: 1, clock: "2026-10-02T15:00:00.000Z" }));
  assert.equal(exported.value.observation.payload.records[0].fields.evidence.changed.length, 2);
  const record = { schema: "samedaydesk.hosted-useful-qa-measurement.v1", observedAt: new Date().toISOString(), runtime: process.version,
    source: "actual recurring recipes + VF1652533 correspondence/VF02 Postgres adapters on a disposable local cluster",
    tasks: [page, issue, negative].map((r, i) => ({ taskId: r.taskId, recipeId: r.recipeId, directModuleMs: direct[i].elapsedMs,
      hostedClientMs: hosted[i].elapsedMs, retainedOutputBytes: Buffer.byteLength(JSON.stringify(hosted[i].value.result)),
      outcome: hosted[i].value.result.recipe.outcome, ok: hosted[i].value.result.recipe.ok })),
    usefulOutputs: { changedFields: 2, issueActions: hosted[1].value.result.recipe.evidence.brief.actions.length,
      missingFieldsInUsefulNegative: hosted[2].value.result.recipe.evidence.rows[0].missing, laterChangedFields: 1,
      retainedPriorReused: true, retrievalAfterProcessRestartMs: retrieval.elapsedMs, exportFieldsRetained: true },
    effort: { automatedLaterInputAssemblyMs: adaptation.elapsedMs, automatedLaterReviewMs: review.elapsedMs,
      laterClientMs: later.elapsedMs, exportClientMs: exported.elapsedMs, humanRequesterReviewMs: null, manualAdaptationMs: null,
      measuredSavings: null, sharedResearchAndDevelopmentCost: null },
    economics: { paidCalls: 0, newInferenceCalls: 0, cashMarginalCost: null, includedQuotaOpportunityCost: null,
      nativeSessionCost: null, settledPayment: "unobserved" },
    facts: { qa: true, outsideCaller: false, publicWrite: false, rewardLedgerWrite: false,
      productionEnrollment: "conditional", publicationVerified: false, sourceAcceptedByRoot: false } };
  const arg = process.argv[2];
  if (arg) await writeFile(arg, `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(record)}\n`);
} finally { await f.close(); }
