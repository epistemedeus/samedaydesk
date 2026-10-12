import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import pg from "pg";
import express from "express";
import { createServer } from "node:http";
import { createApp } from "../src/app.js";
import { quoteIdent } from "../src/config.js";
import { OWNER_TOKEN, openStore, listen, closeServer, dropSchema, json, key, issueContributor, databaseUrl, testConfig } from "./helpers.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/opportunity/agent-opportunity-221400-v1.round.json", import.meta.url), "utf8"));
const selfReport = { listingRef: null, encounterAt: null, encounterEstimated: false, route: "unknown", query: null,
  endpointOrFilter: null, upstreamPublicLink: null, snippetRef: null, pagesFollowed: [], decisionPoint: null,
  role: null, activeMinutes: null, confidence: "unknown", unknowns: ["route"] };
const observed = { eventIds: ["forged-event"], placementId: "volunteered-placement", campaignId: "volunteered-campaign",
  sourceId: "volunteered-source", providerId: "volunteered-provider", query: "volunteered-query", endpoint: "/forged", reconstructed: false };
function packed(evidence: any = { kind: "discovery_trace", selfReport }) {
  const bytes = JSON.stringify(evidence);
  return { provenance: "test", evidence, artifact: { ref: "fixture:synthetic-not-fetched", mediaType: "application/json",
    bytes: Buffer.byteLength(bytes), digestSha256: createHash("sha256").update(bytes).digest("hex") } };
}
async function withRound(fn: (ctx: any) => Promise<void>, overrides: any = {}, clock?: () => Date) {
  const { store, schema } = await openStore({ clock });
  const { server, baseUrl } = await listen(store);
  const round = { ...fixture, roundKey: key("receiving"), provenance: "test", claimTtlSeconds: 60, offers: fixture.offers.map((o: any) => { const { ownerReservedSlots, ...terms } = o; return terms; }), ...overrides };
  const root = `/v1/opportunity-rounds/${round.roundKey}`;
  const post = (path: string, body: any, token = OWNER_TOKEN, idem = key("write")) => json(baseUrl, path, {
    method: "POST", token, idempotencyKey: idem, body: JSON.stringify(body),
  });
  const sql = async (query: string, values: any[] = []) => {
    const client = new pg.Client({ connectionString: databaseUrl() });
    await client.connect();
    try { await client.query(`SET search_path TO ${quoteIdent(schema)}`); return (await client.query(query, values)).rows; }
    finally { await client.end(); }
  };
  try {
    const created = await post("/v1/opportunity-rounds", round);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const termsVersion = (created.body as any).termsVersion;
    const claim = async (caller: any, extra: any = {}, idem = key("claim")) => post(`${root}/claims`, {
      provenance: "test", offerKey: "discovery-trace", publicLabel: "Synthetic", termsVersion, ...extra,
    }, caller.token, idem);
    const imported = (extra: any = {}, idem = key("import")) => post(`${root}/imports`, {
      provenance: "test", offerKey: "discovery-trace", publicLabel: "Synthetic", credentialRef: "test:synthetic-01",
      importKey: "synthetic-import-01", deferStart: false, ...extra,
    }, OWNER_TOKEN, idem);
    await fn({ baseUrl, schema, store, root, round, termsVersion, post, claim, imported, sql });
  } finally { await closeServer(server); await store.close(); await dropSchema(schema); }
}

test("receiving: server evidence contains only authenticated observations", async () => withRound(async ({ baseUrl, claim, root, post, sql }: any) => {
  const caller = await issueContributor(baseUrl);
  const { eventIds, endpoint, reconstructed, ...volunteeredObservation } = observed;
  const first = await claim(caller, { volunteeredObservation });
  assert.equal(first.status, 201);
  const id = (first.body as any).claim.id;
  const records = await sql("SELECT observed FROM opportunity_source_records WHERE claim_id=$1", [id]);
  assert.equal(records[0].observed.server.providerId, null);
  assert.equal(records[0].observed.server.query, null);
  assert.equal(records[0].observed.server.endpoint, `${root}/claims`);
  assert.deepEqual(records[0].observed.volunteered, volunteeredObservation);
  const source = await post(`${root}/claims/${id}/source`, { provenance: "test", selfReport, observed }, caller.token);
  assert.equal(source.status, 201);
  assert.equal((source.body as any).observed.server.endpoint, `${root}/claims`);
  assert.equal((source.body as any).observed.server.eventIds.includes("forged-event"), false);
  assert.equal((source.body as any).observed.server.providerId, null);
  assert.deepEqual((source.body as any).observed.volunteered, observed);
}));

for (const [name, changes] of Object.entries({ identity: { credentialRef: "test:synthetic-02" }, label: { publicLabel: "Changed" },
  offer: { offerKey: "workflow-witness" }, deferred: { deferStart: true } })) {
  test(`receiving: changed import ${name} cannot replay another reservation`, async () => withRound(async ({ imported }: any) => {
    assert.equal((await imported()).status, 201);
    const changed = await imported(changes);
    assert.equal(changed.status, 409, JSON.stringify(changed.body));
    assert.equal((changed.body as any).error.code, "import_conflict");
  }));
}

test("receiving: changed assigned scope cannot replay fixed work", async () => withRound(async ({ root, post }: any) => {
  const body = { provenance: "test", offerKey: "workflow-witness", publicLabel: "Synthetic", credentialRef: "test:synthetic-01",
    importKey: "synthetic-assignment-01", scope: { title: "Synthetic scope", instructions: "Synthetic instructions" } };
  assert.equal((await post(`${root}/assignments`, body)).status, 201);
  const changed = await post(`${root}/assignments`, { ...body, scope: { ...body.scope, instructions: "Changed instructions" } });
  assert.equal(changed.status, 409, JSON.stringify(changed.body));
}));

test("receiving: changed offer summary is part of immutable terms", async () => withRound(async ({ round, post }: any) => {
  const changed = await post("/v1/opportunity-rounds", { ...round, offers: round.offers.map((o: any) => ({ ...o, summary: "Changed work" })) });
  assert.equal(changed.status, 409, JSON.stringify(changed.body));
  assert.equal((changed.body as any).error.code, "round_unchanged");
}));

for (const action of ["submissions", "source"]) {
  test(`receiving: ${action} idempotency binds the addressed claim`, async () => withRound(async ({ baseUrl, claim, post, root }: any) => {
    const caller = await issueContributor(baseUrl);
    const a = await claim(caller);
    const b = await claim(caller, { offerKey: "workflow-witness" });
    assert.equal(b.status, 409); // owner-only offer stays unavailable
    const other = await issueContributor(baseUrl);
    const otherClaim = await claim(other);
    const body = action === "submissions" ? packed() : { provenance: "test", selfReport, observed };
    const idem = key("same-resource-key");
    assert.equal((await post(`${root}/claims/${(a.body as any).claim.id}/${action}`, body, caller.token, idem)).status, 201);
    const replay = await post(`${root}/claims/${(otherClaim.body as any).claim.id}/${action}`, body, caller.token, idem);
    assert.equal(replay.status, 409, JSON.stringify(replay.body));
    assert.equal((replay.body as any).error.code, "idempotency_conflict");
  }));
}

test("receiving: expired imports, readback, start and reclaim never restore a paid promise", async () => {
  let now = new Date("2026-10-12T00:00:00Z");
  await withRound(async ({ imported, baseUrl, root, post, claim, sql }: any) => {
    const first = await imported({ deferStart: true });
    const holder = (first.body as any).token;
    const id = (first.body as any).claim.id;
    now = new Date("2026-10-12T00:01:01Z");
    const read = await json(baseUrl, `${root}/claims/${id}?provenance=test`, { token: holder });
    assert.equal((read.body as any).claim.status, "expired");
    assert.equal((read.body as any).paidSlot, false);
    assert.equal((read.body as any).doNotStartWork, true);
    assert.equal((read.body as any).claimAuthority, "none");
    const start = await post(`${root}/claims/${id}/start`, { provenance: "test" }, holder);
    assert.equal(start.status, 409);
    const replay = await imported({ deferStart: true });
    assert.equal(replay.status, 200);
    assert.equal((replay.body as any).paidSlot, false);
    const reclaim = await claim({ token: holder });
    assert.equal(reclaim.status, 409);
    assert.equal((reclaim.body as any).rewardPromised, false);
    const late = await post(`${root}/claims/${id}/submissions`, packed(), holder);
    assert.equal(late.status, 409);
    assert.equal((late.body as any).error.code, "late_submission");
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_claims"))[0].n, 1);
    const fresh = await issueContributor(baseUrl);
    assert.equal((await claim(fresh)).status, 201);
  }, {}, () => now);
});

test("receiving: identical digest cannot bypass evidence metadata validation", async () => withRound(async ({ baseUrl, claim, post, root }: any) => {
  const caller = await issueContributor(baseUrl);
  const first = await claim(caller);
  const path = `${root}/claims/${(first.body as any).claim.id}/submissions`;
  assert.equal((await post(path, packed(), caller.token)).status, 201);
  const body = packed(); body.artifact.bytes += 1;
  const bad = await post(path, body, caller.token);
  assert.equal(bad.status, 400, JSON.stringify(bad.body));
}));

test("receiving: verified source and settlement fields are not admissible evidence", async () => withRound(async ({ baseUrl, claim, root, post }: any) => {
  const caller = await issueContributor(baseUrl);
  const first = await claim(caller);
  for (const extra of [{ verified: true }, { observed: { server: { providerId: "forged" } } }, { settled: true }, { paid: true }]) {
    const result = await post(`${root}/claims/${(first.body as any).claim.id}/submissions`, packed({ kind: "discovery_trace", selfReport, ...extra }), caller.token);
    assert.equal(result.status, 400);
  }
}));

test("receiving: an empty workflow attempt cannot earn an obligation", async () => withRound(async ({ root, post, sql }: any) => {
  const imported = await post(`${root}/assignments`, { provenance: "test", offerKey: "workflow-witness", publicLabel: "Synthetic",
    credentialRef: "test:empty-attempt", importKey: "empty-attempt", scope: { title: "Synthetic", instructions: "Synthetic attempt" } });
  assert.equal(imported.status, 201);
  const result = imported.body as any;
  const evidence = { kind: "workflow_witness", attempt: "", limitationOrResult: "", syntheticFailure: false };
  const submitted = await post(`${root}/claims/${result.claim.id}/submissions`, packed(evidence), result.token);
  assert.equal(submitted.status, 400);
  const accepted = await post(`${root}/claims/${result.claim.id}/accept`, { provenance: "test" });
  assert.equal(accepted.status, 409);
  assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations"))[0].n, 0);
}));

test("receiving: owed and submitted evidence survive expiry and closure without reopening work", async () => {
  let now = new Date("2026-10-12T00:00:00Z");
  await withRound(async ({ imported, root, post, baseUrl, sql }: any) => {
    const first = (await imported()).body as any;
    const second = (await imported({ publicLabel: "Synthetic02", credentialRef: "test:synthetic-02", importKey: "synthetic-import-02" })).body as any;
    for (const item of [first, second]) assert.equal((await post(`${root}/claims/${item.claim.id}/submissions`, packed(), item.token)).status, 201);
    const accepted = await post(`${root}/claims/${first.claim.id}/accept`, { provenance: "test" });
    assert.equal(accepted.status, 201);
    now = new Date("2026-10-20T00:00:00Z");
    assert.equal((await post(`${root}/close`, { provenance: "test" })).status, 200);
    for (const [item, status] of [[first, "owed"], [second, "submitted"]]) {
      const read = await json(baseUrl, `${root}/claims/${item.claim.id}?provenance=test`, { token: item.token });
      assert.equal((read.body as any).claim.status, status);
      assert.equal((read.body as any).doNotStartWork, true);
      assert.equal((read.body as any).paid, false);
    }
    assert.equal((await post(`${root}/claims/${second.claim.id}/accept`, { provenance: "test" })).status, 201);
    assert.equal((await sql("SELECT SUM(reward_atomic)::text AS n FROM opportunity_obligations WHERE paid=false AND transfer IS NULL"))[0].n, "20000");
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM earned_work_obligations"))[0].n, 0);
  }, {}, () => now);
});

test("receiving: submitted evidence remains unpaid until authenticated owner acceptance", async () => withRound(async ({ root, post, baseUrl, sql }: any) => {
  const production = { ...fixture, roundKey: key("production-shape"), provenance: "production", productionAdmission: true,
    offers: fixture.offers.map((o: any) => ({ ...o, ownerReservedSlots: 0 })) };
  assert.equal((await post("/v1/opportunity-rounds", production)).status, 201);
  const caller = await issueContributor(baseUrl, { provenance: "production" });
  const path = `/v1/opportunity-rounds/${production.roundKey}`;
  const read = await json(baseUrl, `${path}?provenance=production`);
  assert.equal((read.body as any).deliveryState, "unconfigured");
  assert.equal((read.body as any).offers.every((o: any) => o.publicClaimable === false), true);
  const claimed = await post(`${path}/claims`, { provenance: "production", offerKey: "discovery-trace", publicLabel: "Synthetic",
    termsVersion: (read.body as any).termsVersion }, caller.token);
  assert.equal(claimed.status, 201);
  const id = (claimed.body as any).claim.id;
  const evidence = { ...packed(), provenance: "production" };
  assert.equal((await post(`${path}/claims/${id}/submissions`, evidence, caller.token)).status, 201);
  assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations"))[0].n, 0);
  assert.equal((await post(`${path}/claims/${id}/accept`, { provenance: "production" }, caller.token)).status, 401);
  const accepted = await post(`${path}/claims/${id}/accept`, { provenance: "production" });
  assert.equal(accepted.status, 201);
  assert.equal((accepted.body as any).paid, false);
  assert.equal((accepted.body as any).obligation.payoutState, "owed");
  assert.equal((await json(baseUrl, `${root}?provenance=unknown`)).status, 400);
}));

test("receiving: retained public notices strip private fields from older rows", async () => withRound(async ({ baseUrl, sql }: any) => {
  await sql(`INSERT INTO opportunity_notices (id,campaign_key,status,preserved_promise,created_at,updated_at)
    VALUES ('synthetic-notice','synthetic-legacy','closed',$1::jsonb,NOW(),NOW())`, [JSON.stringify({ reward: "0.10", asset: "USDC",
      credentialRef: "private-synthetic-marker", nested: { messageBody: "private-synthetic-marker", wallet_destination: "private-synthetic-marker" } })]);
  const read = await json(baseUrl, "/v1/opportunity-notices/synthetic-legacy");
  assert.equal(read.status, 200);
  assert.equal(read.text.includes("private-synthetic-marker"), false);
  assert.equal((read.body as any).preservedPromise.reward, "0.10");
}));

test("receiving: changed bodies cannot borrow another principal's idempotency record", async () => withRound(async ({ baseUrl, claim }: any) => {
  const a = await issueContributor(baseUrl); const b = await issueContributor(baseUrl);
  const idem = key("principal");
  assert.equal((await claim(a, {}, idem)).status, 201);
  assert.equal((await claim(b, {}, idem)).status, 403);
  assert.equal((await claim(a, { publicLabel: "Changed" }, idem)).status, 409);
}));

test("receiving: existing-process mount serves the exact prefixed route and preserves owner boundaries", async () => withRound(async ({ store, schema, root, termsVersion, sql }: any) => {
  const host = express();
  host.get("/existing-runtime", (_req, res) => res.json({ retained: true }));
  host.use("/api/neomorphic-opportunity", createApp(store, testConfig({ pgSchema: schema })));
  const server = createServer(host);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const baseUrl = `${origin}/api/neomorphic-opportunity`;
  try {
    assert.equal((await json(origin, "/existing-runtime")).status, 200);
    assert.equal((await json(baseUrl, "/healthz")).status, 200);
    assert.equal((await json(baseUrl, `${root}?provenance=test`)).status, 200);
    const caller = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `${root}/claims`, { method: "POST", token: caller.token, idempotencyKey: key("mounted-claim"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "Synthetic" }) });
    assert.equal(claimed.status, 201);
    const record = await sql("SELECT observed FROM opportunity_source_records WHERE claim_id=$1", [(claimed.body as any).claim.id]);
    assert.equal(record[0].observed.server.endpoint, `/api/neomorphic-opportunity${root}/claims`);
    const denied = await json(baseUrl, `${root}/close`, { method: "POST", token: caller.token, idempotencyKey: key("mounted-deny"), body: JSON.stringify({ provenance: "test" }) });
    assert.equal(denied.status, 401);
  } finally { await closeServer(server); }
}));

test("receiving: scoped credentials cannot join another round waitlist", async () => withRound(async ({ imported, post }: any) => {
  const holder = (await imported()).body as any;
  const otherRound = { ...fixture, roundKey: key("another"), provenance: "test" };
  assert.equal((await post("/v1/opportunity-rounds", otherRound)).status, 201);
  const result = await post(`/v1/opportunity-rounds/${otherRound.roundKey}/waitlist`, { provenance: "test", publicLabel: "Synthetic" }, holder.token);
  assert.equal(result.status, 403, JSON.stringify(result.body));
}));

test("receiving: private notice fields never become public metadata", async () => withRound(async ({ post }: any) => {
  for (const privateField of ["credentialRef", "assignedScope", "messageBody", "walletDestination"]) {
    const notice = await post("/v1/opportunity-notices", { campaignKey: key("notice"),
      preservedPromise: { reward: "0.10", asset: "USDC", [privateField]: "private-synthetic-marker" } });
    assert.equal(notice.status, 400, `${privateField}: ${JSON.stringify(notice.body)}`);
  }
}));

test("receiving: sent personal capacity is protected before identities are imported", async () => withRound(async ({ baseUrl, claim, root }: any) => {
  const caller = await issueContributor(baseUrl);
  const first = await claim(caller);
  assert.equal(first.status, 409, JSON.stringify(first.body));
  assert.equal((first.body as any).paidSlot, false);
  const read = await json(baseUrl, `${root}?provenance=test`);
  const body = read.body as any;
  assert.equal(body.protectedPersonalAtomic, "250000");
  assert.equal(body.availableAtomic, "50000");
  assert.equal(body.offers[0].publicRemainingSlots, 0);
}, { offers: fixture.offers.map((o: any) => ({ ...o, ownerReservedSlots: o.offerKey === "discovery-trace" ? 10 : 3 })) }));

test("receiving: fixture cohort contains synthetic identities and three workflow reservations", () => {
  const cohort = JSON.parse(readFileSync(new URL("../fixtures/opportunity/agent-opportunity-221400-v1.cohort.json", import.meta.url), "utf8"));
  assert.equal(cohort.imports.length, 10);
  assert.equal(cohort.assignments.length, 3);
  assert.equal(cohort.imports.every((row: any) => /^Synthetic[0-9]{2}$/.test(row.publicLabel) && /^fixture:synthetic-[0-9]{2}$/.test(row.credentialRef)), true);
});

test("receiving: claimant cannot create, import, assign, accept, close, or report settlement", async () => withRound(async ({ baseUrl, claim, root, post, sql, termsVersion }: any) => {
  const caller = await issueContributor(baseUrl);
  const first = await claim(caller);
  const id = (first.body as any).claim.id;
  for (const path of ["/v1/opportunity-rounds", `${root}/imports`, `${root}/assignments`, `${root}/claims/${id}/accept`,
    `${root}/close`, `${root}/cohort-events?provenance=test`, "/v1/opportunity-notices", "/v1/contributor-tokens"]) {
    assert.equal((await post(path, { provenance: "production", paid: true }, caller.token)).status, 401, path);
  }
  const forged = await claim(caller, { paid: true, productionAdmission: true, owner: true });
  assert.equal(forged.status, 400);
  const prod = await claim(caller, { provenance: "production", termsVersion });
  assert.equal(prod.status, 404);
  assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations"))[0].n, 0);
}));

async function processServer(schema: string, crash = false) {
  const child = spawn(process.execPath, ["--import", "tsx", new URL("./opportunity-process-fixture.mjs", import.meta.url).pathname], {
    env: { ...process.env, EARNED_WORK_PG_SCHEMA: schema, RECEIVING_CRASH_AFTER_COMMIT: crash ? "1" : "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let errors = ""; child.stderr!.on("data", b => errors += b);
  const ready: any = await Promise.race([once(child, "message").then(([m]) => m), once(child, "exit").then(([code]) => { throw new Error(`server exited ${code}: ${errors}`); })]);
  return { child, baseUrl: ready.baseUrl, stop: async () => {
    if (child.exitCode !== null) return;
    const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
  } };
}

test("receiving: separate HTTP server processes serialize claim and import capacity", async () => withRound(async ({ schema, round, termsVersion, baseUrl, sql }: any) => {
  const a = await processServer(schema); const b = await processServer(schema);
  try {
    // Consume nine of the ten discovery slots before racing the final slot.
    for (let i = 0; i < 9; i++) {
      const response = await json(a.baseUrl, `/v1/opportunity-rounds/${round.roundKey}/imports`, {
        method: "POST", token: OWNER_TOKEN, idempotencyKey: key("preimport"), body: JSON.stringify({ provenance: "test",
          offerKey: "discovery-trace", publicLabel: `Synthetic${i}`, credentialRef: `test:race-${i}`, importKey: `race-${i}` }),
      }); assert.equal(response.status, 201);
    }
    const caller = await issueContributor(baseUrl);
    const [imported, claimed] = await Promise.all([
      json(a.baseUrl, `/v1/opportunity-rounds/${round.roundKey}/imports`, { method: "POST", token: OWNER_TOKEN,
        idempotencyKey: key("race-import"), body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace",
          publicLabel: "SyntheticLast", credentialRef: "test:race-last", importKey: "race-last" }) }),
      json(b.baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims`, { method: "POST", token: caller.token,
        idempotencyKey: key("race-claim"), body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", publicLabel: "SyntheticClaim", termsVersion }) }),
    ]);
    assert.deepEqual([imported.status, claimed.status].sort(), [201, 409]);
    const rows = await sql("SELECT COUNT(*)::int AS n, SUM(reward_atomic)::text AS total FROM opportunity_claims WHERE status IN ('reserved','submitted','accepted','owed')");
    assert.deepEqual(rows[0], { n: 10, total: "100000" });
    const notice = { campaignKey: key("concurrent-notice"), preservedPromise: { reward: "0.10", asset: "USDC", allocation: "0.50" } };
    const notices = await Promise.all([a, b].map(server => json(server.baseUrl, "/v1/opportunity-notices", {
      method: "POST", token: OWNER_TOKEN, idempotencyKey: key("notice-race"), body: JSON.stringify(notice),
    })));
    assert.deepEqual(notices.map(n => n.status).sort(), [200, 201]);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_notices WHERE campaign_key=$1", [notice.campaignKey]))[0].n, 1);
  } finally { await a.stop(); await b.stop(); }
}));

test("receiving: killed process after durable import reconciles original token and settlement", async () => withRound(async ({ schema, root, sql }: any) => {
  const a = await processServer(schema, true);
  const body = { provenance: "test", offerKey: "discovery-trace", publicLabel: "Synthetic", credentialRef: "test:crash", importKey: "synthetic-crash" };
  const idem = key("unknown-import");
  const exited = once(a.child, "exit");
  await assert.rejects(json(a.baseUrl, `${root}/imports`, { method: "POST", token: OWNER_TOKEN, idempotencyKey: idem, body: JSON.stringify(body) }));
  await exited;
  const b = await processServer(schema);
  try {
    const retry = await json(b.baseUrl, `${root}/imports`, { method: "POST", token: OWNER_TOKEN, idempotencyKey: idem, body: JSON.stringify(body) });
    assert.equal(retry.status, 200);
    const result = retry.body as any;
    assert.equal(typeof result.token, "string");
    const rows = await sql("SELECT response_json FROM earned_work_idempotency WHERE scope='opportunity_import' AND key=$1", [idem]);
    assert.equal(rows[0].response_json.token, result.token);
    assert.equal(rows[0].response_json.claim.settlementKey, result.claim.settlementKey);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_claims"))[0].n, 1);
    const changed = await json(b.baseUrl, `${root}/imports`, { method: "POST", token: OWNER_TOKEN, idempotencyKey: idem,
      body: JSON.stringify({ ...body, publicLabel: "Changed" }) });
    assert.equal(changed.status, 409);
  } finally { await b.stop(); }
}));

test("receiving: killed process after owner acceptance reconciles exactly one unpaid obligation", async () => withRound(async ({ schema, root, imported, post, sql }: any) => {
  const holder = (await imported()).body as any;
  assert.equal((await post(`${root}/claims/${holder.claim.id}/submissions`, packed(), holder.token)).status, 201);
  const path = `${root}/claims/${holder.claim.id}/accept`;
  const body = JSON.stringify({ provenance: "test" });
  const idem = key("unknown-accept");
  const a = await processServer(schema, true);
  const exited = once(a.child, "exit");
  await assert.rejects(json(a.baseUrl, path, { method: "POST", token: OWNER_TOKEN, idempotencyKey: idem, body }));
  await exited;
  const b = await processServer(schema);
  try {
    const replay = await json(b.baseUrl, path, { method: "POST", token: OWNER_TOKEN, idempotencyKey: idem, body });
    assert.equal(replay.status, 200);
    const accepted = replay.body as any;
    assert.equal(accepted.obligation.settlementKey, holder.claim.settlementKey);
    assert.equal(accepted.paid, false);
    assert.equal(accepted.transfer, null);
    const again = await json(b.baseUrl, path, { method: "POST", token: OWNER_TOKEN, idempotencyKey: key("accept-again"), body });
    assert.equal(again.status, 200);
    assert.equal((again.body as any).obligation.id, accepted.obligation.id);
    const rows = await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations WHERE paid=false AND settled=false AND transfer IS NULL AND revenue=false");
    assert.equal(rows[0].n, 1);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM earned_work_obligations"))[0].n, 0);
  } finally { await b.stop(); }
}));
