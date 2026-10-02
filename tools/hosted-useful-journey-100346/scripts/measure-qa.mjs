#!/usr/bin/env node
// Independent local QA measurement. Actual adjacent engines/stores, no public
// writes, payment, provider calls or fixtures relabeled as customer usefulness.
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runRecipe } from "../../recurring-job-recipes/lib/run.mjs";
import { fixture, example } from "../test/support.mjs";
import assert from "node:assert/strict";

const f = await fixture();
const timed = async fn => { const start = performance.now(); const value = await fn(); return { value, elapsedMs: +(performance.now() - start).toFixed(3) }; };
try {
  const release = JSON.parse(await readFile(new URL("../successors/0.1.1/release.json", import.meta.url), "utf8"));
  const archivePath = fileURLToPath(new URL(`../successors/0.1.1/${release.archive}`, import.meta.url));
  const archive = await readFile(archivePath);
  assert.equal(createHash("sha256").update(archive).digest("hex"), release.sha256);
  execFileSync("tar", ["-xzf", archivePath, "-C", f.dir], { timeout: 2000 });
  const kit = join(f.dir, `hosted-useful-journey-${release.version}`);
  const { UsefulJourneyClient } = await import(pathToFileURL(join(kit, "client.mjs")));
  const page = await example("page-watch");
  page.taskId = "receiving-sdk-release-watch";
  page.input.current.data = "<title>SDK 4.0</title><h1>Pagination contract v4</h1>";
  const issue = await example("issue-brief");
  issue.taskId = "receiving-pagination-brief";
  issue.input.issue.title = "Update pagination contract";
  issue.input.issue.body = "The caller needs cursor pagination in the SDK.\n\nUpdate src/pagination.ts to parse next_cursor from the response.\nAdd a regression for the final page with no next_cursor.";
  const negative = await example("useful-negative");
  negative.taskId = "receiving-missing-heading-check";
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
    later.input.current.data = "<title>SDK 5.0</title><h1>Pagination contract v4</h1>";
    return later;
  });
  const later = await timed(() => client().run(adaptation.value, "measured-later-operation", join(f.dir, "later-journal.json")));
  const review = await timed(async () => {
    assert.deepEqual(later.value.result.recipe.evidence.changed, [{ field: "title", before: "SDK 4.0", after: "SDK 5.0" }]);
    assert.equal(later.value.result.nextPrior.sequence, 3);
    return true;
  });
  const exported = await timed(() => client().export(retained.jobId, { taskId: retained.taskId, resultDigest: retained.resultDigest,
    optIn: true, purpose: "later-task-reuse", subject: "measured-sdk-watch", sequence: 1, clock: "2026-10-02T15:00:00.000Z" }));
  assert.equal(exported.value.observation.payload.records[0].fields.evidence.changed.length, 2);
  const record = { schema: "samedaydesk.hosted-useful-qa-measurement.v1", observedAt: new Date().toISOString(), runtime: process.version,
    source: "actual recurring recipes + VF1652533 correspondence/VF02 Postgres adapters on a disposable local cluster",
    client: { stripped: true, version: release.version, archiveSha256: release.sha256, dependencies: [] },
    tasks: [page, issue, negative].map((r, i) => ({ taskId: r.taskId, recipeId: r.recipeId, directModuleMs: direct[i].elapsedMs,
      hostedClientMs: hosted[i].elapsedMs, retainedOutputBytes: Buffer.byteLength(JSON.stringify(hosted[i].value.result)),
      outcome: hosted[i].value.result.recipe.outcome, ok: hosted[i].value.result.recipe.ok,
      callerInput: r, resultDigest: hosted[i].value.resultDigest,
      directRecipeResult: direct[i].value, retainedResult: hosted[i].value.result,
      directOutputMatched: true })),
    usefulOutputs: { changedFields: 2, issueActions: hosted[1].value.result.recipe.evidence.brief.actions.length,
      missingFieldsInUsefulNegative: hosted[2].value.result.recipe.evidence.rows[0].missing, laterChangedFields: 1,
      retainedPriorReused: true, retrievalAfterProcessRestartMs: retrieval.elapsedMs, exportFieldsRetained: true,
      laterInput: adaptation.value, laterResultDigest: later.value.resultDigest,
      laterChanged: later.value.result.recipe.evidence.changed,
      originalRetainedDigestUnchanged: (await client().result(retained.jobId, retained.taskId)).resultDigest === retained.resultDigest },
    effort: { automatedLaterInputAssemblyMs: adaptation.elapsedMs, automatedLaterReviewMs: review.elapsedMs,
      laterClientMs: later.elapsedMs, exportClientMs: exported.elapsedMs, humanRequesterReviewMs: null, manualAdaptationMs: null,
      measuredSavings: null, sharedResearchAndDevelopmentCost: null, contributorReviewMs: null, contributorEffortMs: null },
    economics: { paidCalls: 0, newInferenceCalls: 0, cashMarginalCost: null, includedQuotaOpportunityCost: null,
      nativeSessionCost: null, settledPayment: "unobserved" },
    facts: { qa: true, outsideCaller: false, publicWrite: false, rewardLedgerWrite: false,
      productionEnrollment: "conditional", publicationVerified: false, sourceAcceptedByRoot: false } };
  const arg = process.argv[2];
  if (arg) await writeFile(arg, `${JSON.stringify(record, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(record)}\n`);
} finally { await f.close(); }
