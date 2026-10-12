// Host gates for /api/neomorphic-opportunity. Disposable Postgres only.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import http from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { createSdsApp } from "../app.js";
import { inspectOpportunityEnv, OPPORTUNITY_SCHEMA } from "../lib/neomorphic-opportunity-mount.js";

const DATABASE_URL = process.env.NEOMORPHIC_OPPORTUNITY_TEST_DATABASE_URL
  || "postgres://earned_work:earned_work@127.0.0.1:55432/earned_work_test";
const OWNER = "opp-owner-token-221600";
const PREFIX = "/api/neomorphic-opportunity";
const fixture = JSON.parse(readFileSync(new URL(
  "../../vendor/neomorphic-opportunity/services/earned-work/fixtures/opportunity/agent-opportunity-221400-v1.round.json",
  import.meta.url,
), "utf8"));
const selfReport = {
  listingRef: null, encounterAt: null, encounterEstimated: false, route: "unknown", query: null,
  endpointOrFilter: null, upstreamPublicLink: null, snippetRef: null, pagesFollowed: [],
  decisionPoint: null, role: null, activeMinutes: null, confidence: "unknown", unknowns: ["route"],
};
const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(new URL("./fixtures/hosted-startup-preload.mjs", import.meta.url));
const processFixture = fileURLToPath(new URL("./fixtures/neomorphic-opportunity-process.mjs", import.meta.url));

function envFor(extra = {}) {
  return {
    NODE_ENV: "test",
    NEOMORPHIC_OPPORTUNITY_DATABASE_URL: DATABASE_URL,
    NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN: OWNER,
    ...extra,
  };
}

function databaseAlias(change) {
  const url = new URL(DATABASE_URL);
  change(url);
  return url.href;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function sql(text, values = []) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`SET search_path TO ${OPPORTUNITY_SCHEMA}`);
    return (await client.query(text, values)).rows;
  } finally {
    await client.end();
  }
}

async function dropSchema() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${OPPORTUNITY_SCHEMA} CASCADE`);
  } finally {
    await client.end();
  }
}

async function schemaExists() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
      [OPPORTUNITY_SCHEMA],
    );
    return result.rowCount > 0;
  } finally {
    await client.end();
  }
}

let keyN = 0;
function idem(name) {
  keyN += 1;
  return `${name}-${keyN}-221600`;
}

function roundBody(roundKey, { reserve = false, claimTtlSeconds = 691200 } = {}) {
  return {
    ...fixture,
    roundKey,
    provenance: "test",
    productionAdmission: false,
    claimTtlSeconds,
    offers: fixture.offers.map((offer) => {
      if (reserve) return { ...offer };
      const { ownerReservedSlots, ...rest } = offer;
      return rest;
    }),
  };
}

function packed(evidence = { kind: "discovery_trace", selfReport }) {
  const bytes = JSON.stringify(evidence);
  return {
    provenance: "test",
    evidence,
    artifact: {
      ref: "fixture:synthetic-not-fetched",
      mediaType: "application/json",
      bytes: Buffer.byteLength(bytes),
      digestSha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

async function boot(t, { extra = {}, clock, afterDurableWrite } = {}) {
  await dropSchema();
  const app = createSdsApp({
    neomorphicOpportunity: { env: envFor(extra), clock, afterDurableWrite },
  });
  const handle = app.get("neoOpportunity");
  assert.ok(handle, "opportunity mount missing");
  await handle.ready();
  const server = await listen(app);
  const port = server.address().port;
  t.after(async () => {
    await handle.close();
    await new Promise((resolve) => server.close(resolve));
    await dropSchema();
  });
  return { app, handle, port };
}

function ownerPost(port, path, body, key = idem("owner")) {
  return request(port, path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OWNER}`,
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

function bearerPost(port, path, body, token, key = idem("holder")) {
  return request(port, path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

async function issueHolder(port, roundKey) {
  const created = await ownerPost(port, `${PREFIX}/v1/opportunity-rounds/${roundKey}/imports`, {
    provenance: "test",
    offerKey: "discovery-trace",
    publicLabel: "Synthetic01",
    credentialRef: `test:synthetic-${randomBytes(3).toString("hex")}`,
    importKey: idem("import"),
    deferStart: false,
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  return created.json;
}

test("missing and invalid opportunity configuration leaves the host up", async (t) => {
  const missing = createSdsApp({ neomorphicOpportunity: { env: { NODE_ENV: "test" } } });
  const missingHandle = missing.get("neoOpportunity");
  assert.ok(missingHandle);
  await missingHandle.ready();
  const missingServer = await listen(missing);
  t.after(async () => {
    await missingHandle.close();
    await new Promise((resolve) => missingServer.close(resolve));
  });
  const port = missingServer.address().port;
  const health = await request(port, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.service, "samedaydesk");
  const ready = await request(port, `${PREFIX}/healthz`);
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.json, { ok: false, enabled: false, reason: "unconfigured" });
  const blocked = await request(port, `${PREFIX}/v1/opportunity-rounds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(blocked.status, 503);
  assert.equal(blocked.json.error.code, "unconfigured");
  const correspondence = await request(port, "/api/correspondence/healthz");
  assert.equal(correspondence.json.reason, "unconfigured");
  assert.equal(await schemaExists(), false);

  const onlyGeneric = createSdsApp({
    neomorphicOpportunity: {
      env: { NODE_ENV: "test", DATABASE_URL, EARNED_WORK_DATABASE_URL: DATABASE_URL, EARNED_WORK_OWNER_TOKEN: "dev-owner-token-s275" },
    },
  });
  const genericHandle = onlyGeneric.get("neoOpportunity");
  await genericHandle.ready();
  assert.equal(genericHandle.state.reason, "unconfigured");
  assert.equal(genericHandle.state.store, null);
  await genericHandle.close();
  assert.equal(await schemaExists(), false);

  for (const [name, env] of [
    ["short token", envFor({ NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN: "short" })],
    ["pool above four", envFor({ NEOMORPHIC_OPPORTUNITY_POOL_MAX: "8" })],
    ["other schema", envFor({ NEOMORPHIC_OPPORTUNITY_PG_SCHEMA: "public" })],
    ["correspondence schema", envFor({ NEOMORPHIC_OPPORTUNITY_PG_SCHEMA: "pilot_correspondence" })],
    ["boolean trust proxy", envFor({ NEOMORPHIC_OPPORTUNITY_TRUST_PROXY: "true" })],
    ["reproduction verifier", envFor({ NEOMORPHIC_OPPORTUNITY_VERIFIER: "reproduction" })],
    ["same database url", envFor({ DATABASE_URL })],
    ["correspondence database", envFor({ CORRESPONDENCE_DATABASE_URL: DATABASE_URL })],
    ["database protocol alias", envFor({ DATABASE_URL: DATABASE_URL.replace(/^postgres:/, "postgresql:") })],
    ["database query alias", envFor({ EARNED_WORK_DATABASE_URL: `${DATABASE_URL}?application_name=other` })],
    ["database role alias", envFor({ CORRESPONDENCE_DATABASE_URL: DATABASE_URL.replace(/\/\/[^@]*@/, "//other-fixture-role@") })],
    ["database encoded name", envFor({ DATABASE_URL: databaseAlias((url) => {
      url.pathname = `/%${url.pathname.charCodeAt(1).toString(16)}${url.pathname.slice(2)}`;
    }) })],
    ["database endpoint override", envFor({ CORRESPONDENCE_DATABASE_URL: databaseAlias((url) => {
      url.searchParams.set("host", url.hostname);
      url.searchParams.set("port", url.port || "5432");
      url.hostname = "different.invalid";
      url.port = "1";
    }) })],
    ["correspondence owner", envFor({ CORRESPONDENCE_ADMIN_TOKEN: OWNER })],
    ["earned-work owner", envFor({ EARNED_WORK_OWNER_TOKEN: OWNER })],
    ["url only", { NEOMORPHIC_OPPORTUNITY_DATABASE_URL: DATABASE_URL }],
  ]) {
    const inspected = inspectOpportunityEnv(env);
    assert.equal(inspected.kind, "invalid_config", name);
    const app = createSdsApp({ neomorphicOpportunity: { env } });
    const handle = app.get("neoOpportunity");
    await handle.ready();
    const server = await listen(app);
    const response = await request(server.address().port, `${PREFIX}/healthz`);
    assert.equal(response.status, 200, name);
    assert.equal(response.json.ok, false, name);
    assert.equal(response.json.reason, "invalid_config", name);
    const hostHealth = await request(server.address().port, "/api/health");
    assert.equal(hostHealth.status, 200, name);
    await handle.close();
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(await schemaExists(), false);
  const separate = databaseAlias((url) => { url.pathname = "/separate_opportunity_fixture"; });
  assert.equal(inspectOpportunityEnv(envFor({ CORRESPONDENCE_DATABASE_URL: separate })).kind, "configured");
  assert.equal(inspectOpportunityEnv({
    NEOMORPHIC_OPPORTUNITY_DATABASE_URL: "postgres://fixture@db.invalid/opportunity",
    NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN: OWNER,
    DATABASE_URL: "postgresql://other@DB.invalid:5432/opportunity?sslmode=require",
  }).kind, "invalid_config");
});

test("a DML-only configured authority cannot migrate or become ready", { timeout: 20_000 }, async (t) => {
  await dropSchema();
  const seeded = createSdsApp({ neomorphicOpportunity: { env: envFor() } }).get("neoOpportunity");
  await seeded.ready();
  assert.equal(seeded.state.status, "ready");
  await seeded.close();
  await sql("CREATE ROLE opportunity_dml_221700 NOLOGIN");
  await sql(`GRANT USAGE ON SCHEMA ${OPPORTUNITY_SCHEMA} TO opportunity_dml_221700`);
  await sql(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${OPPORTUNITY_SCHEMA} TO opportunity_dml_221700`);
  t.after(async () => {
    await dropSchema();
    await sql("DROP OWNED BY opportunity_dml_221700");
    await sql("DROP ROLE opportunity_dml_221700");
  });
  const url = new URL(DATABASE_URL);
  url.searchParams.set("options", "-c role=opportunity_dml_221700");
  const app = createSdsApp({ neomorphicOpportunity: {
    env: envFor({ NEOMORPHIC_OPPORTUNITY_DATABASE_URL: url.href }),
  } });
  const handle = app.get("neoOpportunity");
  t.after(() => handle.close());
  await handle.ready();
  assert.equal(handle.state.status, "disabled");
  assert.equal(handle.state.reason, "store_unavailable");
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.equal((await request(server.address().port, `${PREFIX}/healthz`)).status, 503);
  assert.equal((await request(server.address().port, "/api/health")).status, 200);
  assert.equal(await schemaExists(), true);
  assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_rounds"))[0].n, 0);
});

test("configured but unreachable storage does not claim readiness", { timeout: 20_000 }, async (t) => {
  const env = envFor({
    NEOMORPHIC_OPPORTUNITY_DATABASE_URL: databaseAlias((url) => { url.pathname = "/no_such_opportunity_db"; }),
    DATABASE_URL,
  });
  const app = createSdsApp({ neomorphicOpportunity: { env } });
  const handle = app.get("neoOpportunity");
  assert.ok(handle);
  await handle.ready();
  const server = await listen(app);
  t.after(async () => {
    await handle.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const port = server.address().port;
  const ready = await request(port, `${PREFIX}/healthz`);
  assert.equal(ready.status, 503);
  assert.equal(ready.json.ok, false);
  assert.equal(ready.json.enabled, false);
  assert.equal(ready.json.reason, "store_unavailable");
  const health = await request(port, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.service, "samedaydesk");
  const round = await request(port, `${PREFIX}/v1/opportunity-rounds/agent-opportunity-221400-v1`);
  assert.equal(round.status, 503);
  assert.equal(round.json.error.code, "store_unavailable");
});

test("prefixed opportunity routes coexist with old host routes", { timeout: 30_000 }, async (t) => {
  const { port, handle } = await boot(t);
  assert.equal(handle.state.status, "ready");
  assert.equal(handle.state.schema, OPPORTUNITY_SCHEMA);
  assert.equal(handle.state.poolMax, 4);
  assert.equal(handle.state.store.pool.options.max, 4);
  const health = await request(port, "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  const opportunity = await request(port, `${PREFIX}/healthz`);
  assert.equal(opportunity.status, 200);
  assert.deepEqual(opportunity.json, { ok: true, enabled: true, store: "postgres" });
  const correspondence = await request(port, "/api/correspondence/healthz");
  assert.equal(correspondence.json.reason, "unconfigured");
  const uploads = await request(port, "/api/uploads/signed-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(uploads.status, 501);
  const mcp = await request(port, "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "s221600", version: "0" } },
    }),
  });
  assert.equal(mcp.status, 200);
  assert.equal(mcp.json.result.serverInfo.name, "samedaydesk-agent-tools");
  const tasks = await request(port, `${PREFIX}/v1/tasks`);
  assert.equal(tasks.status, 404);
  assert.equal(tasks.json.error.code, "not_found");
  const payout = await request(port, `${PREFIX}/v1/tasks/task-1/payout`);
  assert.equal(payout.status, 404);
  const openapi = await request(port, `${PREFIX}/openapi.json`);
  assert.equal(openapi.status, 404);
  const unprefixed = await request(port, "/v1/opportunity-rounds/agent-opportunity-221400-v1");
  assert.notEqual(unprefixed.status, 200);
  for (const path of ["/v1/tasks", "/v1/tasks/task-1/funding/reserve", "/v1/tasks/task-1/payout", "/openapi.json"]) {
    const refused = await ownerPost(port, `${PREFIX}${path}`, {});
    assert.equal(refused.status, 404, path);
  }
  for (const method of ["PUT", "DELETE"]) {
    const refused = await request(port, `${PREFIX}/v1/opportunity-rounds`, {
      method, headers: { authorization: `Bearer ${OWNER}`, "content-type": "application/json", "content-length": "2" }, body: "{}",
    });
    assert.equal(refused.status, 404, method);
  }
  const wrongType = await request(port, `${PREFIX}/v1/opportunity-rounds`, {
    method: "POST", headers: { authorization: `Bearer ${OWNER}`, "content-type": "text/plain" }, body: "{}",
  });
  assert.equal(wrongType.status, 400);

  const roundKey = "h-prefixed";
  const root = `${PREFIX}/v1/opportunity-rounds/${roundKey}`;
  const created = await ownerPost(port, `${PREFIX}/v1/opportunity-rounds`, roundBody(roundKey));
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.deliveryState, "unconfigured");
  assert.equal(created.json.hostedClaimAutomation, false);
  assert.equal(created.json.offers.every((offer) => offer.publicClaimable === false && offer.publicRemainingSlots === 0), true);
  const read = await request(port, `${root}?provenance=test`);
  assert.equal(read.status, 200);
  assert.equal(read.json.publicView, true);
  assert.equal(read.json.deliveryState, "unconfigured");
  const holder = await issueHolder(port, roundKey);
  const publicAfterImport = await request(port, `${root}?provenance=test`);
  assert.equal(publicAfterImport.text.includes(holder.token), false);
  assert.equal(publicAfterImport.text.includes("credentialRef"), false);
  for (const path of ["claims", "cohort"]) {
    const refused = await request(port, `${root}/${path}?provenance=test`, {
      headers: { authorization: `Bearer ${holder.token}` },
    });
    assert.equal(refused.status, 401, path);
  }
  const roundId = (await sql("SELECT id FROM opportunity_rounds WHERE round_key = $1", [roundKey]))[0].id;
  const scoped = await ownerPost(port, `${PREFIX}/v1/contributor-tokens`, {
    contributorPublicId: "Synthetic02",
    provenance: "test",
    taskId: `opportunity:${roundId}`,
  });
  assert.equal(scoped.status, 201, JSON.stringify(scoped.json));
  const claimed = await bearerPost(port, `${root}/claims`, {
    provenance: "test",
    offerKey: "discovery-trace",
    publicLabel: "Synthetic02",
    termsVersion: created.json.termsVersion,
    volunteeredObservation: {
      placementId: "volunteered-placement",
      campaignId: null,
      sourceId: null,
      providerId: "volunteered-provider",
      query: "volunteered-query",
    },
  }, scoped.json.token);
  assert.equal(claimed.status, 201, JSON.stringify(claimed.json));
  const rows = await sql("SELECT observed FROM opportunity_source_records WHERE claim_id = $1", [claimed.json.claim.id]);
  assert.equal(rows[0].observed.server.endpoint, `${root}/claims`);
  assert.equal(rows[0].observed.server.query, null);
  assert.equal(rows[0].observed.server.providerId, null);
  assert.equal(rows[0].observed.volunteered.query, "volunteered-query");
  const denied = await bearerPost(port, `${root}/close`, { provenance: "test" }, holder.token);
  assert.equal(denied.status, 401);
  const forged = await bearerPost(port, `${PREFIX}/v1/contributor-tokens`, {
    contributorPublicId: "Synthetic",
    provenance: "test",
  }, holder.token);
  assert.equal(forged.status, 401);
  const kernel = await bearerPost(port, `${PREFIX}/v1/tasks`, {
    title: "no kernel",
    summary: "must not mint",
    provenance: "test",
  }, holder.token);
  assert.equal(kernel.status, 404);
});

test("owner-reserved capacity stays out of public claims", { timeout: 20_000 }, async (t) => {
  const { port } = await boot(t);
  const roundKey = "h-reserved";
  const created = await ownerPost(port, `${PREFIX}/v1/opportunity-rounds`, roundBody(roundKey, { reserve: true }));
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.protectedPersonalAtomic, "250000");
  assert.equal(created.json.availableAtomic, "50000");
  assert.equal(created.json.principalCapAtomic, "300000");
  const holder = await ownerPost(port, `${PREFIX}/v1/contributor-tokens`, {
    contributorPublicId: "SyntheticPublic",
    provenance: "test",
  });
  assert.equal(holder.status, 201, JSON.stringify(holder.json));
  const claim = await bearerPost(port, `${PREFIX}/v1/opportunity-rounds/${roundKey}/claims`, {
    provenance: "test",
    offerKey: "discovery-trace",
    publicLabel: "SyntheticPublic",
    termsVersion: created.json.termsVersion,
  }, holder.json.token);
  assert.equal(claim.status, 409, JSON.stringify(claim.json));
  assert.equal(claim.json.paidSlot, false);
  assert.equal(claim.json.rewardPromised, false);
  assert.equal(claim.json.doNotStartWork, true);
  const workflow = await bearerPost(port, `${PREFIX}/v1/opportunity-rounds/${roundKey}/claims`, {
    provenance: "test",
    offerKey: "workflow-witness",
    publicLabel: "SyntheticPublic",
    termsVersion: created.json.termsVersion,
  }, holder.json.token);
  assert.equal(workflow.status, 409);
  assert.equal(workflow.json.paidSlot, false);
  const rows = await sql("SELECT COUNT(*)::int AS n FROM opportunity_claims");
  assert.equal(rows[0].n, 0);
});

test("duplicate and changed imports and submissions stay bound", { timeout: 20_000 }, async (t) => {
  const { port } = await boot(t);
  const roundKey = "h-duplicate";
  const root = `${PREFIX}/v1/opportunity-rounds/${roundKey}`;
  const created = await ownerPost(port, `${PREFIX}/v1/opportunity-rounds`, roundBody(roundKey));
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const body = {
    provenance: "test",
    offerKey: "discovery-trace",
    publicLabel: "Synthetic01",
    credentialRef: "test:synthetic-01",
    importKey: "synthetic-import-01",
    deferStart: false,
  };
  const first = await ownerPost(port, `${root}/imports`, body, idem("dup-a"));
  assert.equal(first.status, 201, JSON.stringify(first.json));
  const replay = await ownerPost(port, `${root}/imports`, body, idem("dup-b"));
  assert.equal(replay.status, 200, JSON.stringify(replay.json));
  assert.equal(replay.json.tokenReissued, false);
  assert.equal(replay.json.credentialGrant, "already_issued");
  assert.equal(replay.json.claim.id, first.json.claim.id);
  assert.equal(replay.json.claim.settlementKey, first.json.claim.settlementKey);
  const changed = await ownerPost(port, `${root}/imports`, { ...body, publicLabel: "Changed" }, idem("dup-c"));
  assert.equal(changed.status, 409);
  assert.equal(changed.json.error.code, "import_conflict");
  const evidence = packed();
  const submitKey = idem("submit");
  const submitted = await bearerPost(port, `${root}/claims/${first.json.claim.id}/submissions`, evidence, first.json.token, submitKey);
  assert.equal(submitted.status, 201, JSON.stringify(submitted.json));
  const same = await bearerPost(port, `${root}/claims/${first.json.claim.id}/submissions`, evidence, first.json.token, submitKey);
  assert.equal(same.status, 200);
  const other = packed();
  other.evidence.selfReport = { ...selfReport, unknowns: ["changed"] };
  other.artifact.bytes = Buffer.byteLength(JSON.stringify(other.evidence));
  other.artifact.digestSha256 = createHash("sha256").update(JSON.stringify(other.evidence)).digest("hex");
  const conflict = await bearerPost(port, `${root}/claims/${first.json.claim.id}/submissions`, other, first.json.token, submitKey);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  const rows = await sql("SELECT COUNT(*)::int AS n FROM opportunity_claims");
  assert.equal(rows[0].n, 1);
});

test("malformed and oversized evidence is refused before storage", { timeout: 20_000 }, async (t) => {
  const { port } = await boot(t);
  const roundKey = "h-evidence";
  const root = `${PREFIX}/v1/opportunity-rounds/${roundKey}`;
  const created = await ownerPost(port, `${PREFIX}/v1/opportunity-rounds`, roundBody(roundKey));
  assert.equal(created.status, 201);
  const holder = await issueHolder(port, roundKey);
  const badJson = await request(port, `${root}/claims/${holder.claim.id}/submissions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${holder.token}`,
      "idempotency-key": idem("bad-json"),
    },
    body: "{",
  });
  assert.equal(badJson.status, 400);
  assert.equal(badJson.json.error.code, "invalid_input");
  const huge = await request(port, `${root}/claims/${holder.claim.id}/submissions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${holder.token}`,
      "idempotency-key": idem("huge"),
    },
    body: JSON.stringify({ pad: "x".repeat(40_000) }),
  });
  assert.equal(huge.status, 413);
  assert.equal(huge.json.error.code, "payload_too_large");
  const forged = await bearerPost(port, `${root}/claims/${holder.claim.id}/submissions`, packed({
    kind: "discovery_trace",
    selfReport,
    verified: true,
  }), holder.token);
  assert.equal(forged.status, 400);
  const empty = await bearerPost(port, `${root}/claims/${holder.claim.id}/submissions`, packed({
    kind: "workflow_witness",
    attempt: "",
    limitationOrResult: "",
    syntheticFailure: false,
  }), holder.token);
  assert.equal(empty.status, 400);
  const obligations = await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations");
  assert.equal(obligations[0].n, 0);
});

test("other-round and cross-holder credentials are denied", { timeout: 20_000 }, async (t) => {
  const { port } = await boot(t);
  const firstKey = "h-round-a";
  const secondKey = "h-round-b";
  assert.equal((await ownerPost(port, `${PREFIX}/v1/opportunity-rounds`, roundBody(firstKey))).status, 201);
  assert.equal((await ownerPost(port, `${PREFIX}/v1/opportunity-rounds`, roundBody(secondKey))).status, 201);
  const holder = await issueHolder(port, firstKey);
  const cross = await bearerPost(port, `${PREFIX}/v1/opportunity-rounds/${secondKey}/waitlist`, {
    provenance: "test",
    publicLabel: "Synthetic01",
  }, holder.token);
  assert.equal(cross.status, 403, JSON.stringify(cross.json));
  const scoped = await ownerPost(port, `${PREFIX}/v1/contributor-tokens`, {
    contributorPublicId: "SyntheticScoped",
    provenance: "test",
    taskId: "opportunity:some-other-round",
  });
  assert.equal(scoped.status, 201);
  const read = await request(port, `${PREFIX}/v1/opportunity-rounds/${firstKey}?provenance=test`);
  const denied = await bearerPost(port, `${PREFIX}/v1/opportunity-rounds/${firstKey}/claims`, {
    provenance: "test",
    offerKey: "discovery-trace",
    publicLabel: "SyntheticScoped",
    termsVersion: read.json.termsVersion,
  }, scoped.json.token);
  assert.equal(denied.status, 403, JSON.stringify(denied.json));
});

test("closure and expiry keep submitted and owed obligations unpaid", { timeout: 30_000 }, async (t) => {
  let now = new Date("2026-10-12T00:00:00.000Z");
  const { port } = await boot(t, { clock: () => now });
  const roundKey = "h-lifecycle";
  const root = `${PREFIX}/v1/opportunity-rounds/${roundKey}`;
  const created = await ownerPost(port, `${PREFIX}/v1/opportunity-rounds`, roundBody(roundKey, { claimTtlSeconds: 60 }));
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const first = await issueHolder(port, roundKey);
  const second = await ownerPost(port, `${root}/imports`, {
    provenance: "test",
    offerKey: "discovery-trace",
    publicLabel: "Synthetic02",
    credentialRef: "test:synthetic-02",
    importKey: "synthetic-import-02",
    deferStart: false,
  });
  assert.equal(second.status, 201, JSON.stringify(second.json));
  assert.equal((await bearerPost(port, `${root}/claims/${first.claim.id}/submissions`, packed(), first.token)).status, 201);
  assert.equal((await bearerPost(port, `${root}/claims/${second.json.claim.id}/submissions`, packed(), second.json.token)).status, 201);
  const accepted = await ownerPost(port, `${root}/claims/${first.claim.id}/accept`, { provenance: "test" });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.json));
  assert.equal(accepted.json.paid, false);
  assert.equal(accepted.json.transfer, null);
  assert.equal(accepted.json.obligation.adapter, "null_nonpaying_v0");
  assert.equal(accepted.json.obligation.payoutState, "owed");
  assert.equal(accepted.json.obligation.settled, false);
  assert.equal(accepted.json.obligation.revenue, false);
  const expiring = await ownerPost(port, `${root}/imports`, {
    provenance: "test",
    offerKey: "discovery-trace",
    publicLabel: "Synthetic03",
    credentialRef: "test:synthetic-03",
    importKey: "synthetic-import-03",
    deferStart: true,
  });
  assert.equal(expiring.status, 201, JSON.stringify(expiring.json));
  now = new Date("2026-10-12T00:01:01.000Z");
  const expired = await request(port, `${root}/claims/${expiring.json.claim.id}?provenance=test`, {
    headers: { authorization: `Bearer ${expiring.json.token}` },
  });
  assert.equal(expired.status, 200, JSON.stringify(expired.json));
  assert.equal(expired.json.claim.status, "expired");
  assert.equal(expired.json.paidSlot, false);
  assert.equal(expired.json.claimAuthority, "none");
  assert.equal(expired.json.rewardPromised, false);
  const late = await bearerPost(port, `${root}/claims/${expiring.json.claim.id}/submissions`, packed(), expiring.json.token);
  assert.equal(late.status, 409);
  const preserved = await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations WHERE paid = false");
  assert.equal(preserved[0].n, 1);

  now = new Date("2026-10-20T00:00:00.000Z");
  const closed = await ownerPost(port, `${root}/close`, { provenance: "test" });
  assert.equal(closed.status, 200, JSON.stringify(closed.json));
  assert.equal(closed.json.paid, false);
  assert.equal(closed.json.promisesRepriced, false);
  for (const [item, token, status] of [
    [first.claim.id, first.token, "owed"],
    [second.json.claim.id, second.json.token, "submitted"],
  ]) {
    const read = await request(port, `${root}/claims/${item}?provenance=test`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(read.status, 200, JSON.stringify(read.json));
    assert.equal(read.json.claim.status, status);
    assert.equal(read.json.paid, false);
    assert.equal(read.json.doNotStartWork, true);
  }
  const lateAccept = await ownerPost(port, `${root}/claims/${second.json.claim.id}/accept`, { provenance: "test" });
  assert.equal(lateAccept.status, 201, JSON.stringify(lateAccept.json));
  assert.equal(lateAccept.json.paid, false);
  const owed = await sql("SELECT adapter, paid, settled, transfer, revenue, SUM(reward_atomic)::text AS n FROM opportunity_obligations GROUP BY adapter, paid, settled, transfer, revenue");
  assert.equal(owed.length, 1);
  assert.equal(owed[0].adapter, "null_nonpaying_v0");
  assert.equal(owed[0].paid, false);
  assert.equal(owed[0].settled, false);
  assert.equal(owed[0].transfer, null);
  assert.equal(owed[0].revenue, false);
  assert.equal(owed[0].n, "20000");
  const kernel = await sql("SELECT COUNT(*)::int AS n FROM earned_work_obligations");
  assert.equal(kernel[0].n, 0);
  const stillOwed = await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations WHERE paid = false");
  assert.equal(stillOwed[0].n, 2);
});

function childMessage(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("opportunity child did not report a port")), 20_000);
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("message", (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const detail = Buffer.concat(stderr).toString("utf8").slice(-500);
      reject(new Error(`opportunity child exited ${code}${detail ? `: ${detail}` : ""}`));
    });
  });
}

async function stopChild(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 1500);
  try { await exited; } finally { clearTimeout(timer); }
}

test("unknown commit acknowledgement survives an independent restart", { timeout: 40_000 }, async (t) => {
  await dropSchema();
  t.after(dropSchema);
  const { port, handle } = await boot(t);
  const roundKey = "h-restart";
  const root = `${PREFIX}/v1/opportunity-rounds/${roundKey}`;
  const created = await ownerPost(port, `${PREFIX}/v1/opportunity-rounds`, roundBody(roundKey));
  assert.equal(created.status, 201, JSON.stringify(created.json));
  await handle.close();
  const body = {
    provenance: "test",
    offerKey: "discovery-trace",
    publicLabel: "Synthetic01",
    credentialRef: "test:restart-01",
    importKey: "restart-import-01",
    deferStart: false,
  };
  const key = idem("crash-import");
  const crash = spawn(process.execPath, [processFixture], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      NEOMORPHIC_OPPORTUNITY_DATABASE_URL: DATABASE_URL,
      NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN: OWNER,
      NEOMORPHIC_OPPORTUNITY_CRASH_AFTER_COMMIT: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  t.after(() => stopChild(crash));
  const crashed = once(crash, "exit");
  const ready = await childMessage(crash);
  assert.equal(ready.error, undefined);
  const lost = request(ready.port, `${root}/imports`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OWNER}`,
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
  lost.catch(() => {});
  const [code] = await crashed;
  assert.equal(code, 86);
  await lost.catch(() => {});
  const restarted = spawn(process.execPath, [processFixture], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      NEOMORPHIC_OPPORTUNITY_DATABASE_URL: DATABASE_URL,
      NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN: OWNER,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  t.after(() => stopChild(restarted));
  const again = await childMessage(restarted);
  const replay = await request(again.port, `${root}/imports`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OWNER}`,
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
  assert.equal(replay.status, 200, JSON.stringify(replay.json));
  assert.equal(replay.json.tokenReissued, false);
  assert.ok(replay.json.token);
  assert.ok(replay.json.claim.settlementKey);
  const rows = await sql("SELECT COUNT(*)::int AS n, MIN(settlement_key) AS key FROM opportunity_claims");
  assert.equal(rows[0].n, 1);
  assert.equal(rows[0].key, replay.json.claim.settlementKey);
});

test("resident shutdown closes the opportunity pool and keeps the round", { timeout: 30_000 }, async (t) => {
  await dropSchema();
  t.after(dropSchema);
  const children = [];
  t.after(async () => {
    await Promise.all(children.map((child) => stopChild(child)));
  });
  function start(args = ["server/index.js"]) {
    const child = spawn(process.execPath, ["--import", preload, ...args], {
      cwd: rootDir,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        PORT: "0",
        NEOMORPHIC_OPPORTUNITY_DATABASE_URL: DATABASE_URL,
        NEOMORPHIC_OPPORTUNITY_OWNER_TOKEN: OWNER,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    children.push(child);
    return child;
  }
  const first = start();
  const ready = await childMessage(first);
  const created = await ownerPost(ready.port, `${PREFIX}/v1/opportunity-rounds`, roundBody("h-shutdown"));
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const root = `${PREFIX}/v1/opportunity-rounds/h-shutdown`;
  const holders = [];
  for (let i = 0; i < 2; i += 1) {
    const holder = await issueHolder(ready.port, "h-shutdown");
    holders.push(holder);
    const submitted = await bearerPost(ready.port, `${root}/claims/${holder.claim.id}/submissions`, packed(), holder.token);
    assert.equal(submitted.status, 201, JSON.stringify(submitted.json));
  }
  const accepted = await ownerPost(ready.port, `${root}/claims/${holders[0].claim.id}/accept`, { provenance: "test" });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.json));
  assert.equal(accepted.json.obligation.adapter, "null_nonpaying_v0");
  assert.equal((await ownerPost(ready.port, `${root}/close`, { provenance: "test" })).status, 200);
  const began = Date.now();
  const exited = once(first, "exit");
  first.kill("SIGTERM");
  const [code] = await exited;
  const elapsed = Date.now() - began;
  assert.equal(code, 0);
  assert.ok(elapsed < 4000, `shutdown took ${elapsed}ms`);
  const second = start(["--eval", 'require("./server/index.js")']);
  const again = await childMessage(second);
  const read = await request(again.port, `${PREFIX}/v1/opportunity-rounds/h-shutdown?provenance=test`);
  assert.equal(read.status, 200);
  assert.equal(read.json.roundKey, "h-shutdown");
  assert.equal(read.json.deliveryState, "unconfigured");
  assert.equal(read.json.paid, false);
  for (const [index, status] of [[0, "owed"], [1, "submitted"]]) {
    const holder = holders[index];
    const retained = await request(again.port, `${root}/claims/${holder.claim.id}?provenance=test`, {
      headers: { authorization: `Bearer ${holder.token}` },
    });
    assert.equal(retained.status, 200, JSON.stringify(retained.json));
    assert.equal(retained.json.claim.status, status);
    assert.equal(retained.json.paid, false);
    assert.equal(retained.json.doNotStartWork, true);
  }
  assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations WHERE paid = false"))[0].n, 1);
});

test("explicit owner delivery configuration reaches the actual mount", { timeout: 20000 }, async (t) => {
  const target = {origin:"https://samedaydesk.com",prefix:PREFIX,roundKey:"synthetic-hosted-222000"};
  const extra = {
    NEOMORPHIC_OPPORTUNITY_HOSTED_ORIGIN: target.origin,
    NEOMORPHIC_OPPORTUNITY_HOSTED_PREFIX: target.prefix,
    NEOMORPHIC_OPPORTUNITY_HOSTED_ROUND_KEY: target.roundKey,
    NEOMORPHIC_OPPORTUNITY_HOSTED_ADMISSION: JSON.stringify(target),
  };
  const {port} = await boot(t,{extra});
  assert.equal((await ownerPost(port,`${PREFIX}/v1/opportunity-rounds`,roundBody(target.roundKey,{reserve:true}))).status,201);
  const read = await request(port,`${PREFIX}/v1/opportunity-rounds/${target.roundKey}?provenance=test`);
  assert.equal(read.status,200);
  assert.equal(read.json.hostedDelivery.configuration,"hosted");
  assert.equal(read.json.hostedDelivery.roundReadPath,`${target.origin}${PREFIX}/v1/opportunity-rounds/${target.roundKey}`);
  assert.equal(read.json.hostedDelivery.grantsDelivered,false);
  assert.equal(read.json.hostedDelivery.settlementAutomatic,false);
  assert.equal(read.json.hostedDelivery.publicPaidCapacity,0);
  assert.equal(read.json.offers.every(o=>o.publicRemainingSlots===0),true);
});

test("malformed, missing admission and mismatched delivery stays unconfigured without leaking values", {timeout:30000}, async(t)=>{
  const target={origin:"https://samedaydesk.com",prefix:PREFIX,roundKey:"synthetic-refused-222000"};
  const valid={
    NEOMORPHIC_OPPORTUNITY_HOSTED_ORIGIN:target.origin,
    NEOMORPHIC_OPPORTUNITY_HOSTED_PREFIX:target.prefix,
    NEOMORPHIC_OPPORTUNITY_HOSTED_ROUND_KEY:target.roundKey,
    NEOMORPHIC_OPPORTUNITY_HOSTED_ADMISSION:JSON.stringify(target),
  };
  const cases=[
    {...valid,NEOMORPHIC_OPPORTUNITY_HOSTED_ADMISSION:undefined},
    {...valid,NEOMORPHIC_OPPORTUNITY_HOSTED_ADMISSION:'{secret'},
    {...valid,NEOMORPHIC_OPPORTUNITY_HOSTED_ORIGIN:'https://user:secret@synthetic.invalid'},
    {...valid,NEOMORPHIC_OPPORTUNITY_HOSTED_ORIGIN:'https://secret.synthetic.invalid'},
    {...valid,NEOMORPHIC_OPPORTUNITY_HOSTED_PREFIX:'/secret'},
    {...valid,NEOMORPHIC_OPPORTUNITY_HOSTED_ROUND_KEY:'secret-round'},
    {...valid,NEOMORPHIC_OPPORTUNITY_HOSTED_PREFIX:undefined},
    {EARNED_WORK_HOSTED_ORIGIN:target.origin,EARNED_WORK_HOSTED_PREFIX:PREFIX,EARNED_WORK_HOSTED_ROUND_KEY:target.roundKey,EARNED_WORK_HOSTED_ADMISSION:JSON.stringify(target)},
  ];
  for(const extra of cases) {
    // Each case gets its own surface/pool; retained DB guards are unchanged.
    const app=createSdsApp({neomorphicOpportunity:{env:envFor(extra)}});
    const handle=app.get('neoOpportunity');await handle.ready();
    const server=await listen(app);const port=server.address().port;
    try {
      const root=`${PREFIX}/v1/opportunity-rounds/${target.roundKey}`;
      const created=await ownerPost(port,`${PREFIX}/v1/opportunity-rounds`,roundBody(target.roundKey,{reserve:true}));
      assert.ok([200,201].includes(created.status),JSON.stringify(created.json));
      const r=await request(port,root+'?provenance=test');assert.equal(r.status,200);
      assert.equal(r.json.deliveryState,'unconfigured');assert.equal(r.json.hostedDelivery.roundReadPath,null);
      assert.equal(r.text.includes('secret'),false);assert.equal(r.json.hostedDelivery.grantsDelivered,false);
      assert.equal((await request(port,'/api/health')).status,200);
    } finally {await handle.close();await new Promise(resolve=>server.close(resolve));await dropSchema();}
  }
});

test("even an owner-admitted prefix must match the actual mounted route", async(t)=>{
  const target={origin:"https://samedaydesk.com",prefix:"/synthetic-other-prefix",roundKey:"synthetic-refused-222000"};
  const app=createSdsApp({neomorphicOpportunity:{env:envFor({
    NEOMORPHIC_OPPORTUNITY_HOSTED_ORIGIN:target.origin,
    NEOMORPHIC_OPPORTUNITY_HOSTED_PREFIX:target.prefix,
    NEOMORPHIC_OPPORTUNITY_HOSTED_ROUND_KEY:target.roundKey,
    NEOMORPHIC_OPPORTUNITY_HOSTED_ADMISSION:JSON.stringify(target),
  })}});
  const handle=app.get('neoOpportunity');await handle.ready();const server=await listen(app);
  t.after(async()=>{await handle.close();await new Promise(resolve=>server.close(resolve));});
  const port=server.address().port;
  assert.equal((await request(port,`${PREFIX}/healthz`)).json.reason,'invalid_config');
  assert.equal((await request(port,'/api/health')).status,200);
});

test("previous installed host submissions and owed rows survive migration, holder acknowledgement and restart", {
  timeout:40000, skip:!process.env.NEOMORPHIC_OPPORTUNITY_PREVIOUS_HOST,
}, async(t)=>{
  await dropSchema();t.after(dropSchema);
  const roundKey='synthetic-upgrade-222000';const root=`${PREFIX}/v1/opportunity-rounds/${roundKey}`;
  const target={origin:'https://samedaydesk.com',prefix:PREFIX,roundKey};
  const extra={NEOMORPHIC_OPPORTUNITY_HOSTED_ORIGIN:target.origin,NEOMORPHIC_OPPORTUNITY_HOSTED_PREFIX:PREFIX,NEOMORPHIC_OPPORTUNITY_HOSTED_ROUND_KEY:roundKey,NEOMORPHIC_OPPORTUNITY_HOSTED_ADMISSION:JSON.stringify(target)};
  const children=[];t.after(async()=>{for(const c of children) await stopChild(c);});
  async function start(previous=false,crash=false){
    const path=previous ? `${process.env.NEOMORPHIC_OPPORTUNITY_PREVIOUS_HOST}/server/scripts/fixtures/neomorphic-opportunity-process.mjs` : processFixture;
    const c=spawn(process.execPath,[path],{env:{PATH:process.env.PATH,...envFor(previous?{}:extra),NEOMORPHIC_OPPORTUNITY_CRASH_AFTER_COMMIT:crash?'1':'0'},stdio:['ignore','pipe','pipe','ipc']});
    children.push(c);const ready=await childMessage(c);assert.equal(ready.error,undefined);return {c,port:ready.port};
  }
  const old=await start(true);
  const created=await ownerPost(old.port,`${PREFIX}/v1/opportunity-rounds`,roundBody(roundKey,{reserve:true}));assert.equal(created.status,201,JSON.stringify(created.json));
  const holders=[];
  for(let i=0;i<3;i++) {
    const holder=await ownerPost(old.port,root+'/imports',{provenance:'test',offerKey:'discovery-trace',publicLabel:`Synthetic${i}`,credentialRef:`test:upgrade-${i}`,importKey:`upgrade-${i}`,deferStart:i===2});
    assert.equal(holder.status,201,JSON.stringify(holder.json));holders.push(holder.json);
    if(i<2) assert.equal((await bearerPost(old.port,`${root}/claims/${holder.json.claim.id}/submissions`,packed(),holder.json.token)).status,201);
  }
  const owed=await ownerPost(old.port,`${root}/claims/${holders[0].claim.id}/accept`,{provenance:'test'});assert.equal(owed.status,201,JSON.stringify(owed.json));
  const terms=created.json.termsVersion;const settlement=owed.json.obligation.settlementKey;
  const oldSubmissions=await sql('SELECT * FROM opportunity_submissions ORDER BY id');
  const oldObligations=await sql('SELECT * FROM opportunity_obligations ORDER BY id');
  const oldRound=await request(old.port,root+'?provenance=test');
  await stopChild(old.c);
  const upgraded=await start();
  const before=await request(upgraded.port,root+'/cohort?provenance=test',{headers:{authorization:`Bearer ${OWNER}`}});
  assert.equal(before.status,200);assert.equal(before.json.funnel.reservations.rows,3);
  assert.equal(before.json.funnel.holderOriginated.acknowledgementEvents,0);assert.equal(before.json.funnel.holderOriginated.uniqueRecipients,0);
  assert.deepEqual(before.json.funnel.external,{identity:'unknown',delivery:'unknown',acquisition:'unknown'});
  assert.equal(before.json.funnel.submissions.rows,2);assert.equal(before.json.funnel.owed.rows,1);
  await stopChild(upgraded.c);
  const crashing=await start(false,true);
  const ack={provenance:'test',offerKey:'discovery-trace',publicLabel:'Synthetic0',termsVersion:terms};const ackKey=idem('upgrade-ack');
  const lostExit=once(crashing.c,'exit');
  const lost=bearerPost(crashing.port,root+'/claims',ack,holders[0].token,ackKey);lost.catch(()=>{});
  const [exit]=await lostExit;assert.equal(exit,86);await lost.catch(()=>{});
  const now=await start();
  const replay=await bearerPost(now.port,root+'/claims',ack,holders[0].token,ackKey);assert.equal(replay.status,200,JSON.stringify(replay.json));
  assert.equal(replay.json.additionalPaidSlot,false);assert.equal(replay.json.claim.id,holders[0].claim.id);
  const again=await bearerPost(now.port,root+'/claims',ack,holders[0].token,idem('upgrade-fresh-ack'));assert.equal(again.status,200,JSON.stringify(again.json));
  const after=await request(now.port,root+'/cohort?provenance=test',{headers:{authorization:`Bearer ${OWNER}`}});
  assert.equal(after.json.funnel.holderOriginated.acknowledgementEvents,1);assert.equal(after.json.funnel.holderOriginated.uniqueRecipients,1);
  assert.equal(after.json.funnel.holderOriginated.acknowledgementRequests,2);assert.equal(after.json.funnel.reservations.rows,3);
  assert.equal(after.json.funnel.holderOriginated.verifiedExternalActivity,false);assert.equal(after.json.agentConversion,'unknown');
  for(const [i,status] of [[0,'owed'],[1,'submitted'],[2,'reserved']]) {
    const r=await request(now.port,`${root}/claims/${holders[i].claim.id}?provenance=test`,{headers:{authorization:`Bearer ${holders[i].token}`}});
    assert.equal(r.status,200);assert.equal(r.json.claim.status,status);assert.equal(r.json.claim.termsVersion,terms);assert.equal(r.json.paid,false);
    assert.equal(r.json.hostedDelivery.configuration,'hosted');assert.equal(r.json.hostedDelivery.grantsDelivered,false);
    if(i===0) {assert.equal(r.json.obligation.settlementKey,settlement);assert.equal(r.json.obligation.adapter,'null_nonpaying_v0');assert.equal(r.json.obligation.settled,false);assert.equal(r.json.obligation.transfer,null);}
    if(i===2) assert.equal(r.json.doNotStartWork,true);
  }
  const publicRound=await request(now.port,root+'?provenance=test');assert.equal(publicRound.json.termsVersion,terms);assert.equal(publicRound.json.hostedDelivery.publicPaidCapacity,0);
  assert.equal(publicRound.json.committedAtomic,oldRound.json.committedAtomic);assert.equal(publicRound.json.principalCapAtomic,'300000');
  assert.deepEqual(publicRound.json.termsDocument,oldRound.json.termsDocument);
  assert.deepEqual(await sql('SELECT * FROM opportunity_submissions ORDER BY id'),oldSubmissions);
  assert.deepEqual(await sql('SELECT * FROM opportunity_obligations ORDER BY id'),oldObligations);
  assert.equal((await request(now.port,`${root}/claims/${holders[0].claim.id}?provenance=test`,{headers:{authorization:`Bearer ${holders[1].token}`}})).status,403);
  assert.equal((await request(now.port,`${root}/claims/${holders[0].claim.id}?provenance=production`,{headers:{authorization:`Bearer ${holders[0].token}`}})).status,404);
  const rows=await sql('SELECT COUNT(*)::int AS n FROM opportunity_claims');assert.equal(rows[0].n,3);
  assert.equal((await sql('SELECT COUNT(*)::int AS n FROM earned_work_obligations'))[0].n,0);
  await stopChild(now.c);
});
