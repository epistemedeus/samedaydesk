import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import { UsefulJourneyClient } from "../client.mjs";
import { UsefulJourneyService } from "../lib/service.mjs";
import { Budget } from "../lib/budget.mjs";
import { hashToken } from "../../../vendor/visitor-foundry-receiver/services/correspondence/dist/crypto.js";
import { fixture, example, request, lossyProxy, cold } from "./support.mjs";

test("real PG authority, actual recipes and restarted HTTP processes deliver and retain supplied work", { timeout: 45_000 }, async t => {
  const f = await fixture(); t.after(() => f.close());
  let page, pageRequest;
  await t.test("two different supplied tasks have direct-use positive output, plus a useful negative", async () => {
    pageRequest = await example("page-watch");
    const admitted = await request(f.origin, f.a, "", { method: "POST", body: pageRequest, key: "page-watch-operation-1" });
    assert.equal(admitted.status, 201);
    const id = admitted.json.jobId;
    assert.match(id, /^wcl_[a-f0-9]{64}$/);
    const completed = await request(f.origin, f.a, `/${id}/run`, { method: "POST", body: { taskId: pageRequest.taskId } });
    assert.equal(completed.status, 200, JSON.stringify(completed.json));
    assert.equal(completed.json.state, "completed");
    page = (await request(f.origin, f.a, `/${id}/result?taskId=${pageRequest.taskId}`)).json;
    assert.deepEqual(page.result.recipe.evidence.changed.map(x => x.after), ["SDK 2.0", "New response contract"]);
    assert.equal(page.result.source.kind, "caller_supplied_snapshots");
    assert.equal(page.result.source.trusted, false);
    assert.equal(page.result.nextPrior.payload.fields.title, "SDK 2.0");

    const issue = await example("issue-brief");
    const issueInput = join(f.dir, "issue.json"); await writeFile(issueInput, JSON.stringify(issue));
    const ran = await cold(["run", "--origin", f.origin, "--project", f.a.projectId, "--operation-key", "issue-brief-operation-1", "--input", issueInput, "--journal", join(f.dir, "issue-journal.json")], { token: f.a.token });
    assert.equal(ran.code, 0, ran.stdout);
    assert.equal(ran.json.result.recipe.outcome, "changed");
    assert.match(ran.json.result.recipe.directUse.markdown, /src\/consumer.ts/);
    assert.equal(ran.json.result.recipe.evidence.brief.actions.length, 2);
    assert.equal((await stat(join(f.dir, "issue-journal.json"))).mode & 0o777, 0o600);
    assert.equal((await readFile(join(f.dir, "issue-journal.json"), "utf8")).includes(f.a.token), false);

    const negative = await example("useful-negative");
    const neg = await cold(["run", "--origin", f.origin, "--project", f.a.projectId, "--operation-key", "negative-operation-1", "--input", "-", "--journal", join(f.dir, "negative-journal.json")], { token: f.a.token, stdin: JSON.stringify(negative) });
    assert.equal(neg.code, 0, neg.stdout);
    assert.equal(neg.json.state, "completed");
    assert.equal(neg.json.result.recipe.ok, false);
    assert.equal(neg.json.result.recipe.evidence.rows[0].error.code, "empty_extract");
    assert.deepEqual(neg.json.result.recipe.evidence.rows[0].missing, ["title", "h1"]);
    assert.equal(neg.json.result.nextPrior, null);
  });
  await t.test("same operation is idempotent and changed task/input cannot reuse its key", async () => {
    const repeat = await request(f.origin, f.a, "", { method: "POST", body: pageRequest, key: "page-watch-operation-1" });
    assert.equal(repeat.json.jobId, page.jobId); assert.equal(repeat.json.replayed, true);
    const changed = structuredClone(pageRequest); changed.input.current.data = "<title>SDK 3.0</title>";
    assert.equal((await request(f.origin, f.a, "", { method: "POST", body: changed, key: "page-watch-operation-1" })).status, 409);
    changed.taskId = "different-task";
    assert.equal((await request(f.origin, f.a, "", { method: "POST", body: changed, key: "page-watch-operation-1" })).status, 409);
    const before = (await request(f.origin, f.a, `/${page.jobId}?taskId=${page.taskId}`)).json.fence;
    await request(f.origin, f.a, `/${page.jobId}/run`, { method: "POST", body: { taskId: page.taskId } });
    assert.equal((await request(f.origin, f.a, `/${page.jobId}?taskId=${page.taskId}`)).json.fence, before);
  });
  await t.test("wrong tenant/task/grant and anonymous writes do not reach results or admission", async () => {
    assert.equal((await request(f.origin, f.b, `/${page.jobId}/result?taskId=${page.taskId}`)).status, 404);
    assert.equal((await request(f.origin, f.a, `/${page.jobId}/result?taskId=wrong-task`)).status, 404);
    assert.equal((await request(f.origin, { projectId: f.a.projectId, token: f.b.token }, `/${page.jobId}?taskId=${page.taskId}`)).status, 404);
    assert.equal((await request(f.origin, f.reader, "", { method: "POST", body: pageRequest, key: "reader-operation-1" })).status, 403);
    assert.equal((await request(f.origin, f.reader, `/${page.jobId}/result?taskId=${page.taskId}`)).status, 200);
    const foreignWriter = await request(f.origin, f.writer, `/${page.jobId}/run`, { method: "POST", body: { taskId: page.taskId } });
    assert.equal(foreignWriter.status, 403);
    assert.equal(foreignWriter.json.error.code, "job_grant_mismatch");
    const anonymous = await fetch(`${f.origin}/api/hosted-useful/projects/${f.a.projectId}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pageRequest) });
    assert.equal(anonymous.status, 401);
  });
  await t.test("concurrent admission and run across two backend instances retain one result", async () => {
    const input = structuredClone(pageRequest); input.taskId = "concurrent-watch";
    const [a, b] = await Promise.all([1, 2].map(() => request(f.origin, f.a, "", { method: "POST", body: input, key: "concurrent-operation-1" })));
    assert.equal(a.json.jobId, b.json.jobId);
    const service = new UsefulJourneyService(f.cluster.url); t.after(() => service.close());
    const [first, second] = await Promise.all([
      service.run(f.a, a.json.jobId, input.taskId),
      request(f.origin, f.a, `/${a.json.jobId}/run`, { method: "POST", body: { taskId: input.taskId } }),
    ]);
    assert.ok([first.state, second.json.state].every(state => ["completed", "running"].includes(state)));
    const status = await service.status(f.a, a.json.jobId, input.taskId);
    assert.equal(status.state, "completed"); assert.equal(status.fence, 1);
    const rows = await f.sql.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE scope='sds:useful:result:v1' AND key=$1", [a.json.jobId]);
    assert.equal(rows.rows[0].n, 1);
  });
  await t.test("client requests, backend PG and child output use one cumulative byte allowance", async () => {
    const input = structuredClone(pageRequest); input.taskId = "shared-budget-watch";
    const budget = new Budget();
    const exchanges = [];
    const client = new UsefulJourneyClient({ origin: f.origin, ...f.a, budget, fetchImpl: async (url, options) => {
      const response = await fetch(url, options);
      exchanges.push({ used: Number(options.headers["x-useful-used-bytes"]),
        charged: Number(response.headers.get("x-useful-used-bytes")), deadline: options.headers["x-useful-deadline-at"] });
      return response;
    } });
    const result = await client.run(input, "shared-budget-operation", join(f.dir, "shared-budget.json"));
    assert.equal(result.state, "completed");
    assert.ok(exchanges.length >= 4);
    assert.ok(exchanges.every(x => x.charged > x.used && x.deadline === String(budget.deadlineAt)));
    assert.ok(exchanges.slice(1).every((x, i) => x.used > exchanges[i].charged));
    assert.ok(budget.counts["hosted-work"] > 0);
    assert.equal(budget.used, Object.values(budget.counts).reduce((a, b) => a + b, 0));
    assert.ok(budget.used < budget.totalBytes);
    const reduced = new Budget({ totalBytes: 16_384 });
    const service = new UsefulJourneyService(f.cluster.url); t.after(() => service.close());
    const small = structuredClone(input); small.taskId = "durable-reduced-budget";
    const admitted = await service.admit(f.a, small, "reduced-budget-operation", reduced);
    await assert.rejects(service.run(f.a, admitted.jobId, small.taskId, new Budget()), { code: "allowance_exceeded" });
    assert.equal((await f.sql.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE scope='sds:useful:result:v1' AND key=$1", [admitted.jobId])).rows[0].n, 0);
  });
  await t.test("result receipt, checkpoint and release roll back together on release failure", async () => {
    const service = new UsefulJourneyService(f.cluster.url); t.after(() => service.close());
    const input = structuredClone(pageRequest); input.taskId = "atomic-release-failure";
    const admitted = await service.admit(f.a, input, "atomic-release-operation");
    const mutate = service.cells.mutate.bind(service.cells);
    service.cells.mutate = async (...args) => {
      if (args[2].action === "release") throw Object.assign(Error("QA release interruption"), { code: "qa_release_interrupted" });
      return mutate(...args);
    };
    await assert.rejects(service.run(f.a, admitted.jobId, input.taskId), { code: "qa_release_interrupted" });
    assert.equal((await f.sql.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE scope='sds:useful:result:v1' AND key=$1", [admitted.jobId])).rows[0].n, 0);
    const cell = (await f.sql.query("SELECT state FROM correspondence_vf02_work_cells WHERE id=$1", [admitted.jobId])).rows[0].state;
    assert.equal(cell.checkpoint, null); assert.equal(cell.revision, 2); assert.equal(cell.fence, 1);
    assert.ok(cell.lease);
  });
  await t.test("post-commit admission/run reply loss recovers the same operation after process restart", async () => {
    const proxy = await lossyProxy(f.origin); t.after(() => proxy.close());
    const supplied = structuredClone(pageRequest); supplied.taskId = "lost-reply-watch";
    const journal = join(f.dir, "lost-reply.json");
    const client = () => new UsefulJourneyClient({ origin: proxy.origin, ...f.a });
    proxy.dropNext(path => path.endsWith("/jobs"));
    await assert.rejects(client().run(supplied, "lost-reply-operation-1", journal), { code: "transport_outcome_unknown" });
    assert.equal(JSON.parse(await readFile(journal, "utf8")).jobId, null);
    proxy.dropNext(path => path.endsWith("/run"));
    await assert.rejects(client().run(null, null, journal, { recover: true }), { code: "transport_outcome_unknown" });
    const id = JSON.parse(await readFile(journal, "utf8")).jobId;
    const before = await client().result(id, supplied.taskId);
    await f.restart();
    const recovered = await cold(["recover", "--origin", proxy.origin, "--project", f.a.projectId, "--journal", journal], { token: f.a.token });
    assert.equal(recovered.code, 0, recovered.stdout);
    assert.deepEqual(recovered.json.result, before.result);
    assert.equal(recovered.json.resultDigest, before.resultDigest);
    assert.equal(recovered.json.fence, 1);
  });
  await t.test("later unchanged and changed inputs consume an authorized retained prior after restart", async () => {
    const later = structuredClone(pageRequest);
    later.taskId = "sdk-next-task"; later.input.clock = "2026-10-02T15:00:00.000Z";
    delete later.input.prior;
    later.input.priorResult = { jobId: page.jobId, taskId: page.taskId, digest: page.resultDigest };
    const a = await request(f.origin, f.a, "", { method: "POST", body: later, key: "later-same-operation-1" });
    await request(f.origin, f.a, `/${a.json.jobId}/run`, { method: "POST", body: { taskId: later.taskId } });
    const unchanged = (await request(f.origin, f.a, `/${a.json.jobId}/result?taskId=${later.taskId}`)).json;
    assert.equal(unchanged.result.recipe.outcome, "unchanged");
    later.taskId = "sdk-changed-next-task";
    later.input.current.data = "<title>SDK 3.0</title><h1>New response contract</h1>";
    const changed = await cold(["run", "--origin", f.origin, "--project", f.a.projectId, "--operation-key", "later-changed-operation-1", "--input", "-", "--journal", join(f.dir, "later-changed.json")], { token: f.a.token, stdin: JSON.stringify(later) });
    assert.equal(changed.code, 0, changed.stdout);
    assert.deepEqual(changed.json.result.recipe.evidence.changed, [{ field: "title", before: "SDK 2.0", after: "SDK 3.0" }]);
    assert.equal(changed.json.result.nextPrior.sequence, 3);
    const wrong = structuredClone(later); wrong.input.priorResult.digest = `sha256:${"0".repeat(64)}`;
    assert.equal((await request(f.origin, f.a, "", { method: "POST", body: wrong, key: "wrong-prior-operation-1" })).status, 409);
    assert.equal((await request(f.origin, f.b, "", { method: "POST", body: later, key: "foreign-prior-operation-1" })).status, 404);
    assert.equal((await request(f.origin, f.a, `/${page.jobId}/result?taskId=${page.taskId}`)).json.resultDigest, page.resultDigest);
  });
  await t.test("optional current-authority export retains useful fields without accepted/public trust", async () => {
    const body = { taskId: page.taskId, optIn: true, purpose: "later-task-reuse", resultDigest: page.resultDigest,
      subject: "sdk-watch-result", sequence: 1, clock: "2026-10-02T15:00:00.000Z" };
    const exported = await request(f.origin, f.a, `/${page.jobId}/export`, { method: "POST", body });
    assert.equal(exported.status, 200, JSON.stringify(exported.json));
    assert.equal(exported.json.observation.payload.records[0].fields.evidence.changed[0].after, "SDK 2.0");
    assert.equal(exported.json.evidenceKind, "user_selected_unverified");
    assert.equal(exported.json.publicSafeCertified, false);
    assert.equal(exported.json.publicWrite, false);
    assert.equal((await request(f.origin, f.reader, `/${page.jobId}/export`, { method: "POST", body })).status, 403);
    assert.equal((await request(f.origin, f.a, `/${page.jobId}/export`, { method: "POST", body: { ...body, optIn: false } })).status, 400);
    assert.equal((await request(f.origin, f.a, `/${page.jobId}/export`, { method: "POST", body: { ...body, resultDigest: `sha256:${"0".repeat(64)}` } })).status, 409);
  });
  await t.test("writer may cancel queued work; historical cancel retry cannot resurrect it", async () => {
    const input = structuredClone(pageRequest); input.taskId = "cancel-queued";
    const admitted = await request(f.origin, f.writer, "", { method: "POST", body: input, key: "cancel-queued-operation" });
    const current = (await request(f.origin, f.writer, `/${admitted.json.jobId}?taskId=${input.taskId}`)).json;
    const body = { taskId: input.taskId, expectedRevision: current.revision, reason: "caller no longer needs the result" };
    const cancelled = await request(f.origin, f.writer, `/${admitted.json.jobId}/cancel`, { method: "POST", body, key: "cancel-command-operation" });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.json)); assert.equal(cancelled.json.state, "cancelled");
    assert.equal((await request(f.origin, f.writer, `/${admitted.json.jobId}/cancel`, { method: "POST", body, key: "cancel-command-operation" })).json.replayed, true);
    assert.equal((await request(f.origin, f.writer, `/${admitted.json.jobId}/run`, { method: "POST", body: { taskId: input.taskId } })).status, 410);
    assert.equal((await request(f.origin, f.writer, `/${admitted.json.jobId}/result?taskId=${input.taskId}`)).status, 410);
  });
  await t.test("real cancellation between committed claim and completion fences a late real recipe", async () => {
    const service = new UsefulJourneyService(f.cluster.url); t.after(() => service.close());
    const input = structuredClone(pageRequest); input.taskId = "cancel-in-flight";
    const admitted = await service.admit(f.a, input, "cancel-in-flight-operation");
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const reached = new Promise(resolve => { entered = resolve; });
    const original = service.db.tx.bind(service.db);
    service.db.tx = async fn => { const value = await original(fn); if (value?.request && value?.cell) { entered(); await gate; } return value; };
    const running = service.run(f.a, admitted.jobId, input.taskId);
    await reached;
    const current = (await request(f.origin, f.a, `/${admitted.jobId}?taskId=${input.taskId}`)).json;
    assert.equal(current.state, "running");
    assert.equal((await request(f.origin, f.a, `/${admitted.jobId}/cancel`, { method: "POST", body: { taskId: input.taskId, expectedRevision: current.revision, reason: "stop before result commit" }, key: "cancel-in-flight-command" })).json.state, "cancelled");
    release();
    await assert.rejects(running, error => ["revision_conflict", "terminal_cell", "stale_fence"].includes(error.code));
    assert.equal((await f.sql.query("SELECT count(*)::int AS n FROM correspondence_idempotency WHERE scope='sds:useful:result:v1' AND key=$1", [admitted.jobId])).rows[0].n, 0);
  });
  await t.test("revocation fences an in-flight result and cannot replenish its reserved execution allowance", async () => {
    const writer = { projectId: f.a.projectId, token: "qa-reserved-writer-only-for-disposable-store" };
    const { grant } = await f.base.createGrant({ projectId: writer.projectId, role: "writer", tokenHash: hashToken(writer.token), expiresAt: null });
    const service = new UsefulJourneyService(f.cluster.url); t.after(() => service.close());
    const input = structuredClone(pageRequest); input.taskId = "reserved-revocation-watch";
    const admitted = await service.admit(writer, input, "reserved-revocation-operation");
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const reached = new Promise(resolve => { entered = resolve; });
    const original = service.db.tx.bind(service.db);
    service.db.tx = async fn => { const value = await original(fn); if (value?.request && value?.cell) { entered(); await gate; } return value; };
    const running = service.run(writer, admitted.jobId, input.taskId);
    await reached;
    await f.base.revokeGrant(writer.projectId, grant.id);
    const owner = new UsefulJourneyService(f.cluster.url); t.after(() => owner.close());
    assert.equal((await owner.status(f.a, admitted.jobId, input.taskId)).state, "outcome_unknown");
    await assert.rejects(owner.run(f.a, admitted.jobId, input.taskId), { code: "execution_outcome_unknown" });
    release();
    await assert.rejects(running, { code: "unauthorized" });
    const rows = await f.sql.query("SELECT scope FROM correspondence_idempotency WHERE key=$1 AND scope IN ('sds:useful:execution:v1','sds:useful:result:v1')", [admitted.jobId]);
    assert.deepEqual(rows.rows.map(row => row.scope), ["sds:useful:execution:v1"]);
  });
  await t.test("actual expired lease takeover rejects the predecessor fence", async () => {
    const service = new UsefulJourneyService(f.cluster.url); t.after(() => service.close());
    const input = structuredClone(pageRequest); input.taskId = "expired-lease-watch";
    const admitted = await service.admit(f.a, input, "expired-lease-operation");
    const first = await f.cells.mutate(f.a, admitted.jobId, { schema: "neomorphic.foundry.work-cell-command.v1", action: "claim", expectedRevision: 1, voluntaryOptIn: true, ttlSeconds: 1 }, "expired-first-claim");
    await new Promise(resolve => setTimeout(resolve, 1100));
    const completed = await service.run(f.a, admitted.jobId, input.taskId);
    assert.equal(completed.state, "completed"); assert.equal(completed.fence, 2);
    await assert.rejects(f.cells.mutate(f.a, admitted.jobId, { schema: "neomorphic.foundry.work-cell-command.v1", action: "checkpoint", expectedRevision: completed.revision,
      fence: first.receipt.cell.fence, checkpoint: { schema: "neomorphic.foundry.checkpoint.v1", artifact: { uri: "https://samedaydesk.invalid/qa", digest: completed.resultDigest }, summary: "stale worker", nextStep: "must be refused" } }, "stale-checkpoint-command"), { code: "stale_fence" });
  });
  await t.test("revoked writer loses result access and export while owner-held retention survives", async () => {
    const input = structuredClone(pageRequest); input.taskId = "revoked-writer-watch";
    const a = await request(f.origin, f.writer, "", { method: "POST", body: input, key: "revoked-writer-operation" });
    await request(f.origin, f.writer, `/${a.json.jobId}/run`, { method: "POST", body: { taskId: input.taskId } });
    const retained = (await request(f.origin, f.writer, `/${a.json.jobId}/result?taskId=${input.taskId}`)).json;
    await f.base.revokeGrant(f.a.projectId, f.writer.grant.id);
    assert.equal((await request(f.origin, f.writer, `/${a.json.jobId}/result?taskId=${input.taskId}`)).status, 401);
    assert.equal((await request(f.origin, f.a, `/${a.json.jobId}/result?taskId=${input.taskId}`)).json.resultDigest, retained.resultDigest);
  });
  await t.test("no reward, acceptance, public event or payment ledger write is substituted for delivery", async () => {
    assert.equal((await f.sql.query("SELECT count(*)::int AS n FROM correspondence_events")).rows[0].n, 0);
    assert.equal((await f.sql.query("SELECT count(*)::int AS n FROM correspondence_vf02_work_cells WHERE state->>'status' IN ('submitted','accepted')")).rows[0].n, 0);
    assert.equal((await f.sql.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='pilot_correspondence' AND tablename LIKE '%earned%'")).rows[0].n, 0);
    assert.equal(page.result.facts.paymentAttempted, false);
  });
  await t.test("a counterfeit journal job cannot select another result even for the same caller task", async () => {
    const input = structuredClone(pageRequest); input.input.current.data = "<title>SDK 9.0</title><h1>Changed again</h1>";
    const journal = join(f.dir, "counterfeit-journal.json");
    const client = new UsefulJourneyClient({ origin: f.origin, ...f.a });
    const actual = await client.run(input, "counterfeit-control-operation", journal);
    assert.notEqual(actual.jobId, page.jobId);
    const corrupted = JSON.parse(await readFile(journal, "utf8")); corrupted.jobId = page.jobId;
    await writeFile(journal, JSON.stringify(corrupted));
    await assert.rejects(new UsefulJourneyClient({ origin: f.origin, ...f.a }).run(null, null, journal, { recover: true }), { code: "journal_job_mismatch" });
  });
  await t.test("real PG statement timeout consumes setup time under the whole request deadline", async () => {
    const service = new UsefulJourneyService(f.cluster.url); t.after(() => service.close());
    const budget = new Budget({ deadlineMs: 4200 });
    const started = performance.now();
    await assert.rejects(service.tx(budget, async c => {
      await c.query("SELECT pg_sleep(1.2)");
      await c.query("SELECT pg_sleep(5)");
    }), error => ["57014", "deadline_exceeded"].includes(error.code) || /timeout/i.test(error.message));
    assert.ok(performance.now() - started < 4800);
    await service.checkReady();
  });
  await t.test("grant expiry after a real cell row wait cannot return retained output", async () => {
    const ephemeral = { projectId: f.a.projectId, token: "qa-expiring-reader-only-for-disposable-store" };
    await f.base.createGrant({ projectId: f.a.projectId, role: "reader", tokenHash: hashToken(ephemeral.token), expiresAt: new Date(Date.now() + 180).toISOString() });
    await f.sql.query("BEGIN");
    await f.sql.query("SELECT id FROM correspondence_vf02_work_cells WHERE id=$1 FOR UPDATE", [page.jobId]);
    const waiting = request(f.origin, ephemeral, `/${page.jobId}/result?taskId=${page.taskId}`);
    await new Promise(resolve => setTimeout(resolve, 300));
    await f.sql.query("COMMIT");
    const response = await waiting;
    assert.equal(response.status, 401);
    assert.equal(response.json.result, undefined);
  });
  await t.test("closing correspondence preserves result retrieval and exact recovery while new work remains closed", async () => {
    const journal = join(f.dir, "closed-project-journal.json");
    await new UsefulJourneyClient({ origin: f.origin, ...f.a }).run(pageRequest, "page-watch-operation-1", journal);
    const project = await f.base.getProject(f.a.projectId);
    await f.base.createEvent({ projectId: f.a.projectId, kind: "resolved", text: "QA project complete", expectedVersion: project.version,
      idempotencyKey: "qa-close-project", requestHash: "qa-close-project-hash" });
    const recovered = await new UsefulJourneyClient({ origin: f.origin, ...f.a }).run(null, null, journal, { recover: true });
    assert.equal(recovered.resultDigest, page.resultDigest);
    assert.equal((await request(f.origin, f.a, "", { method: "POST", body: pageRequest, key: "new-closed-project-operation" })).status, 409);
  });
});
