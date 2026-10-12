import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import { atomicToDecimal } from "../src/opportunity/atomic.js";
import { hashRoundTerms } from "../src/opportunity/terms.js";
import {
  OWNER_TOKEN,
  TEST_PROVENANCE,
  closeServer,
  createReservedTask,
  databaseUrl,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roundFixture = JSON.parse(
  readFileSync(path.join(root, "fixtures/opportunity/agent-opportunity-221400-v1.round.json"), "utf8"),
);
const cohortFixture = JSON.parse(
  readFileSync(path.join(root, "fixtures/opportunity/agent-opportunity-221400-v1.cohort.json"), "utf8"),
);

function discoveryEvidence(query: string | null = null) {
  return {
    kind: "discovery_trace",
    selfReport: {
      listingRef: query ? "https://example.test/listing" : null,
      encounterAt: null,
      encounterEstimated: false,
      route: query ? "search" : "unknown",
      query,
      endpointOrFilter: null,
      upstreamPublicLink: null,
      snippetRef: null,
      pagesFollowed: [],
      decisionPoint: "existing inquiry",
      role: "operator",
      activeMinutes: null,
      confidence: "unknown",
      unknowns: query ? ["endpoint"] : ["query", "endpoint", "upstream"],
    },
  };
}

function workflowEvidence() {
  return {
    kind: "workflow_witness",
    attempt: "ran the public recipe against the local runtime",
    limitationOrResult: "the adapter dropped the row at the retention boundary",
    syntheticFailure: false,
    versions: "fixture-runtime",
  };
}

function packed(evidence: unknown, ref = "fixture:opportunity-evidence-not-fetched") {
  const jsonText = JSON.stringify(evidence);
  return {
    artifact: {
      ref,
      digestSha256: createHash("sha256").update(jsonText, "utf8").digest("hex"),
      mediaType: "application/json",
      bytes: Buffer.byteLength(jsonText),
    },
    evidence,
  };
}

function miniRound(overrides: Record<string, unknown> = {}) {
  return {
    roundKey: `round-${randomBytes(4).toString("hex")}`,
    provenance: "test",
    productionAdmission: false,
    principalCapAtomic: 300000,
    atomicScale: 6,
    asset: "USDC",
    network: "base",
    chainId: 8453,
    submissionDeadline: "2026-10-19T23:59:59Z",
    claimTtlSeconds: 3600,
    reviewWithinDays: 3,
    maxClarifications: 1,
    maxEvidenceBytes: 12000,
    transferFeeCap: { amountAtomic: "10000000000000", asset: "ETH", note: "fee cap is not a transfer" },
    offers: [
      {
        offerKey: "discovery-trace",
        title: "Discovery",
        summary: "Truthful route record",
        slotCount: 2,
        rewardAtomic: 10000,
        maxEffortSeconds: 300,
        acceptance: "Explicit unknowns are eligible",
        evidenceKind: "discovery_trace",
        publicClaimable: true,
        rank: 1,
      },
      {
        offerKey: "workflow-witness",
        title: "Workflow",
        summary: "Scoped outside attempt",
        slotCount: 1,
        rewardAtomic: 50000,
        maxEffortSeconds: 1200,
        acceptance: "Actual attempt or actual limitation",
        evidenceKind: "workflow_witness",
        publicClaimable: false,
        rank: 2,
      },
    ],
    alternatives: [{ alternativeKey: "later-recipe", rank: 1, title: "Later recipe", summary: "Unfunded follow-on" }],
    ...overrides,
  };
}

async function count(schema: string, sql: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(`SET search_path TO ${quoteIdent(schema)}`);
    const result = await client.query<{ n: string }>(sql, params);
    return result.rows[0]?.n ?? "0";
  } finally {
    await client.end();
  }
}

test("atomic conversion matches the funded 0.01 and 0.05 prices", () => {
  assert.equal(atomicToDecimal(10000n, 6), "0.01");
  assert.equal(atomicToDecimal(50000n, 6), "0.05");
  assert.equal(atomicToDecimal(300000n, 6), "0.30");
  const migration = readFileSync(path.join(root, "migrations/002_opportunity_rounds.sql"), "utf8");
  assert.match(migration, /principal_cap_atomic BIGINT/);
  assert.doesNotMatch(migration, /CREATE TABLE[^\n]*transfer/i);
  assert.match(migration, /adapter = 'null_nonpaying_v0'/);
});

test("funded fixture round accounts the cap and does not promote fixture identity", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const created = await json(baseUrl, "/v1/opportunity-rounds", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("round"),
      body: JSON.stringify(roundFixture),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const body = created.body as {
      termsVersion: string;
      committedAtomic: string;
      remainingAtomic: string;
      principalCapAtomic: string;
      productionAdmission: boolean;
    };
    assert.equal(body.principalCapAtomic, "300000");
    assert.equal(body.committedAtomic, "0");
    assert.equal(body.remainingAtomic, "300000");
    assert.equal(body.productionAdmission, false);
    assert.equal(body.termsVersion, hashRoundTerms({
      ...roundFixture,
      offers: roundFixture.offers,
      alternatives: roundFixture.alternatives.map((item: { alternativeKey: string; rank: number; title: string; summary: string }) => ({
        ...item,
        funded: false,
        paidSlot: false,
      })),
    }));

    const replay = await json(baseUrl, "/v1/opportunity-rounds", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("round"),
      body: JSON.stringify(roundFixture),
    });
    assert.equal(replay.status, 200);
    assert.equal((replay.body as { termsVersion: string }).termsVersion, body.termsVersion);

    const changed = { ...roundFixture, principalCapAtomic: 1 };
    const rejected = await json(baseUrl, "/v1/opportunity-rounds", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("changed-round"),
      body: JSON.stringify(changed),
    });
    assert.equal(rejected.status, 409);
    assert.equal((rejected.body as { error: { code: string } }).error.code, "round_unchanged");

    let deferredToken = "";
    let workflowHolderToken = "";
    const importKey = key("cohort");
    for (const row of cohortFixture.imports) {
      const imported = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/imports`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: `${importKey}-${row.credentialRef}`,
        body: JSON.stringify({
          provenance: "fixture",
          offerKey: "discovery-trace",
          importKey: `personal:${row.credentialRef}`,
          ...row,
        }),
      });
      assert.equal(imported.status, 201, JSON.stringify(imported.body));
      const token = (imported.body as { token?: string }).token;
      assert.equal(typeof token, "string");
      assert.equal((imported.body as { productionCredential: boolean }).productionCredential, false);
      assert.equal((imported.body as { credentialGrant: string }).credentialGrant, "fixture_or_test_only");
      if (row.publicLabel === "Synthetic06") {
        deferredToken = token!;
        assert.equal((imported.body as { doNotStartWork: boolean }).doNotStartWork, true);
      }
      if (row.publicLabel === "Synthetic05") workflowHolderToken = token!;
      const again = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/imports`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: key(`dup-import-${row.credentialRef}`),
        body: JSON.stringify({
          provenance: "fixture",
          offerKey: "discovery-trace",
          importKey: `personal:${row.credentialRef}`,
          ...row,
        }),
      });
      assert.equal(again.status, 200, JSON.stringify(again.body));
      assert.equal((again.body as { token?: string }).token, undefined);
    }

    for (const row of cohortFixture.assignments) {
      const assigned = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/assignments`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: key(`assign-${row.credentialRef}`),
        body: JSON.stringify({
          provenance: "fixture",
          offerKey: "workflow-witness",
          importKey: `assign:${row.credentialRef}`,
          ...row,
        }),
      });
      assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
      assert.equal((assigned.body as { token?: string }).token, undefined);
      assert.equal((assigned.body as { credentialGrant: string }).credentialGrant, "already_issued");
    }

    const view = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}?provenance=fixture`);
    assert.equal(view.status, 200);
    const listed = view.body as { committedAtomic: string; remainingAtomic: string; offers: { offerKey: string; remainingSlots: number }[] };
    assert.equal(listed.committedAtomic, "250000");
    assert.equal(listed.remainingAtomic, "50000");
    const discovery = listed.offers.find((offer) => offer.offerKey === "discovery-trace");
    const workflow = listed.offers.find((offer) => offer.offerKey === "workflow-witness");
    assert.equal(discovery?.remainingSlots, 0);
    assert.equal(workflow?.remainingSlots, 1);
    const dumped = JSON.stringify(view.body).replaceAll("contact@neomorphic.io", "");
    assert.equal(dumped.includes("ew_ctr_"), false);
    assert.equal(dumped.includes("fixture:221400"), false);
    assert.equal(dumped.includes("SCOPE-PRIVATE-221400"), false);
    assert.equal(dumped.includes("@"), false);

    const outsider = await issueContributor(baseUrl, { provenance: "fixture" });
    const overflow = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims`, {
      method: "POST",
      token: outsider.token,
      idempotencyKey: key("overflow"),
      body: JSON.stringify({
        provenance: "fixture",
        offerKey: "discovery-trace",
        termsVersion: body.termsVersion,
        publicLabel: "Outsider",
      }),
    });
    assert.equal(overflow.status, 409, JSON.stringify(overflow.body));
    const routed = overflow.body as {
      paidSlot: boolean;
      doNotStartWork: boolean;
      claimAuthority: string;
      rewardPromised: boolean;
      nextTasks: { kind: string; funded?: boolean; rewardPromised: boolean }[];
      waitlist: { paidSlot: boolean };
    };
    assert.equal(routed.paidSlot, false);
    assert.equal(routed.doNotStartWork, true);
    assert.equal(routed.claimAuthority, "none");
    assert.equal(routed.rewardPromised, false);
    assert.equal(routed.waitlist.paidSlot, false);
    assert.equal(routed.nextTasks.some((task) => task.kind === "unfunded_follow_on" && task.funded === false), true);
    assert.equal(routed.nextTasks.every((task) => task.rewardPromised === false), true);

    const workflowGrab = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims`, {
      method: "POST",
      token: outsider.token,
      idempotencyKey: key("workflow-grab"),
      body: JSON.stringify({
        provenance: "fixture",
        offerKey: "workflow-witness",
        termsVersion: body.termsVersion,
        publicLabel: "Outsider",
      }),
    });
    assert.equal(workflowGrab.status, 409);
    assert.equal((workflowGrab.body as { error: { code: string } }).error.code, "offer_mismatch");
    assert.equal((workflowGrab.body as { rewardPromised: boolean }).rewardPromised, false);

    const claims = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims?provenance=fixture`, {
      token: OWNER_TOKEN,
    });
    const deferred = (claims.body as { claims: { publicLabel: string; id: string; offerKey: string }[] }).claims.find(
      (claim) => claim.publicLabel === "Synthetic06" && claim.offerKey === "discovery-trace",
    );
    assert.ok(deferred);
    const early = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims/${deferred.id}/submissions`, {
      method: "POST",
      token: deferredToken,
      idempotencyKey: key("deferred-early"),
      body: JSON.stringify({ provenance: "fixture", ...packed(discoveryEvidence()) }),
    });
    assert.equal(early.status, 409);
    assert.equal((early.body as { doNotStartWork: boolean; paid: boolean }).doNotStartWork, true);
    assert.equal((early.body as { paid: boolean }).paid, false);
    const started = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims/${deferred.id}/start`, {
      method: "POST",
      token: deferredToken,
      idempotencyKey: key("deferred-start"),
      body: JSON.stringify({ provenance: "fixture" }),
    });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.equal((started.body as { doNotStartWork: boolean }).doNotStartWork, false);

    const workflowHolder = (claims.body as { claims: { publicLabel: string; id: string; offerKey: string }[] }).claims.find(
      (claim) => claim.publicLabel === "Synthetic05" && claim.offerKey === "workflow-witness",
    );
    assert.ok(workflowHolder);
    const holder = await json(
      baseUrl,
      `/v1/opportunity-rounds/${roundFixture.roundKey}/claims/${workflowHolder.id}?provenance=fixture`,
      { token: workflowHolderToken },
    );
    assert.equal(JSON.stringify(holder.body).includes("SCOPE-PRIVATE-221400"), true);
    const submitted = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims/${workflowHolder.id}/submissions`, {
      method: "POST",
      token: workflowHolderToken,
      idempotencyKey: key("workflowHolder-submit"),
      body: JSON.stringify({ provenance: "fixture", ...packed(workflowEvidence(), "file:///etc/passwd") }),
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(JSON.stringify(submitted.body).includes("root:x:0:0"), false);
    const duplicate = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims/${workflowHolder.id}/submissions`, {
      method: "POST",
      token: workflowHolderToken,
      idempotencyKey: key("workflowHolder-submit"),
      body: JSON.stringify({ provenance: "fixture", ...packed(workflowEvidence(), "file:///etc/passwd") }),
    });
    assert.equal(duplicate.status, 200);
    const accepted = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims/${workflowHolder.id}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("workflowHolder-accept"),
      body: JSON.stringify({ provenance: "fixture", requesterActiveMinutes: 4 }),
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    const owed = accepted.body as { paid: boolean; transfer: null; obligation: { id: string; adapter: string; settlementKey: string } };
    assert.equal(owed.paid, false);
    assert.equal(owed.transfer, null);
    assert.equal(owed.obligation.adapter, "null_nonpaying_v0");
    const acceptedAgain = await json(baseUrl, `/v1/opportunity-rounds/${roundFixture.roundKey}/claims/${workflowHolder.id}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("workflowHolder-accept-2"),
      body: JSON.stringify({ provenance: "fixture" }),
    });
    assert.equal(acceptedAgain.status, 200);
    assert.equal((acceptedAgain.body as { obligation: { id: string } }).obligation.id, owed.obligation.id);
    assert.equal(await count(schema, "SELECT COUNT(*)::text AS n FROM earned_work_obligations"), "0");
    assert.equal(await count(schema, "SELECT COUNT(*)::text AS n FROM opportunity_obligations"), "1");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("restart replays the same settlement key and unknown-outcome import stays one row", async () => {
  let commits = 0;
  const { store, schema } = await openStore({
    afterDurableWrite: ({ kind }) => {
      if (kind !== "commit") return;
      commits += 1;
      if (commits === 2) {
        throw Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
      }
    },
  });
  const { server, baseUrl } = await listen(store);
  const round = miniRound();
  const idem = key("import-ack");
  try {
    const created = await json(baseUrl, "/v1/opportunity-rounds", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("mini"),
      body: JSON.stringify(round),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const first = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/imports`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: idem,
      body: JSON.stringify({
        provenance: "test",
        offerKey: "discovery-trace",
        publicLabel: "Synthetic01",
        importKey: "personal:primary",
        credentialRef: "test:primary",
      }),
    });
    assert.notEqual(first.status, 201);
    const replay = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/imports`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: idem,
      body: JSON.stringify({
        provenance: "test",
        offerKey: "discovery-trace",
        publicLabel: "Synthetic01",
        importKey: "personal:primary",
        credentialRef: "test:primary",
      }),
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    const claimId = (replay.body as { claim: { id: string; settlementKey: string } }).claim.id;
    const settlementKey = (replay.body as { claim: { settlementKey: string } }).claim.settlementKey;
    assert.equal(await count(schema, "SELECT COUNT(*)::text AS n FROM opportunity_claims"), "1");
    await closeServer(server);
    await store.close();
    const reopened = await openStore({ schema });
    const again = await listen(reopened.store);
    try {
      const read = await json(again.baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${claimId}?provenance=test`, {
        token: OWNER_TOKEN,
      });
      assert.equal(read.status, 200, JSON.stringify(read.body));
      assert.equal((read.body as { claim: { settlementKey: string } }).claim.settlementKey, settlementKey);
      assert.equal((read.body as { paid: boolean }).paid, false);
    } finally {
      await closeServer(again.server);
      await reopened.store.close();
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close().catch(() => {});
    await dropSchema(schema);
  }
});

test("stale terms, malformed evidence, expiry, and label collision stay inside the cap", async () => {
  let now = new Date("2026-10-12T00:00:00Z");
  const { store, schema } = await openStore({ clock: () => now });
  const { server, baseUrl } = await listen(store);
  try {
    const round = miniRound({ claimTtlSeconds: 60, principalCapAtomic: 20000, offers: [
      {
        offerKey: "discovery-trace",
        title: "Discovery",
        summary: "Truthful route record",
        slotCount: 2,
        rewardAtomic: 10000,
        maxEffortSeconds: 300,
        acceptance: "Explicit unknowns are eligible",
        evidenceKind: "discovery_trace",
        publicClaimable: true,
        rank: 1,
      },
    ] });
    const created = await json(baseUrl, "/v1/opportunity-rounds", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("terms-round"),
      body: JSON.stringify(round),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const termsVersion = (created.body as { termsVersion: string }).termsVersion;
    const a = await issueContributor(baseUrl, { provenance: TEST_PROVENANCE });
    const b = await issueContributor(baseUrl, { provenance: TEST_PROVENANCE, contributorPublicId: a.publicId });
    const stale = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims`, {
      method: "POST",
      token: a.token,
      idempotencyKey: key("stale"),
      body: JSON.stringify({
        provenance: "test",
        offerKey: "discovery-trace",
        termsVersion: `sha256:${"ab".repeat(32)}`,
        publicLabel: "SameLabel",
      }),
    });
    assert.equal(stale.status, 409);
    assert.equal((stale.body as { error: { code: string }; doNotStartWork: boolean; termsVersion: string }).error.code, "terms_changed");
    assert.equal((stale.body as { doNotStartWork: boolean }).doNotStartWork, true);
    assert.equal((stale.body as { termsVersion: string }).termsVersion, termsVersion);
    assert.equal(await count(schema, "SELECT COUNT(*)::text AS n FROM opportunity_claims"), "0");

    const first = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims`, {
      method: "POST",
      token: a.token,
      idempotencyKey: key("claim-a"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "SameLabel" }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims`, {
      method: "POST",
      token: b.token,
      idempotencyKey: key("claim-b"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "SameLabel" }),
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.notEqual(
      (first.body as { claim: { id: string } }).claim.id,
      (second.body as { claim: { id: string } }).claim.id,
    );
    const claimId = (first.body as { claim: { id: string } }).claim.id;
    const badRoute = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${claimId}/source`, {
      method: "POST",
      token: a.token,
      idempotencyKey: key("bad-source"),
      body: JSON.stringify({
        provenance: "test",
        selfReport: { ...discoveryEvidence("invented query").selfReport, route: "unknown", query: "invented query" },
        observed: {
          eventIds: [],
          placementId: null,
          campaignId: null,
          sourceId: null,
          providerId: "any-provider",
          query: null,
          endpoint: null,
          reconstructed: false,
        },
      }),
    });
    assert.equal(badRoute.status, 400);
    assert.equal((badRoute.body as { error: { code: string } }).error.code, "reconstructed_route");
    const source = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${claimId}/source`, {
      method: "POST",
      token: a.token,
      idempotencyKey: key("source"),
      body: JSON.stringify({
        provenance: "test",
        selfReport: discoveryEvidence("exact query kept").selfReport,
        observed: {
          eventIds: ["evt-volunteered"],
          placementId: "placement-data",
          campaignId: "campaign-data",
          sourceId: "source-data",
          providerId: "any-provider",
          query: null,
          endpoint: "/v1/opportunity-rounds/example/claims",
          reconstructed: false,
        },
      }),
    });
    assert.equal(source.status, 201, JSON.stringify(source.body));
    const recorded = source.body as { selfReport: { query: string }; observed: { server: { query: null; reconstructed: boolean } } };
    assert.equal(recorded.selfReport.query, "exact query kept");
    assert.equal(recorded.observed.server.query, null);
    assert.equal(recorded.observed.server.reconstructed, false);

    const oversizeEvidence = { ...discoveryEvidence(), blob: "x".repeat(13000) };
    const oversize = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${claimId}/submissions`, {
      method: "POST",
      token: a.token,
      idempotencyKey: key("oversize"),
      body: JSON.stringify({ provenance: "test", ...packed(oversizeEvidence) }),
    });
    assert.equal(oversize.status, 400);
    assert.equal((oversize.body as { error: { code: string } }).error.code, "oversize");
    const malformed = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${claimId}/submissions`, {
      method: "POST",
      token: a.token,
      idempotencyKey: key("malformed"),
      body: JSON.stringify({ provenance: "test", ...packed({ kind: "note" }) }),
    });
    assert.equal(malformed.status, 400);

    const submitted = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${claimId}/submissions`, {
      method: "POST",
      token: a.token,
      idempotencyKey: key("ok-submit"),
      body: JSON.stringify({ provenance: "test", ...packed(discoveryEvidence()) }),
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const accepted = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${claimId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("ok-accept"),
      body: JSON.stringify({ provenance: "test", requesterActiveMinutes: 2 }),
    });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    now = new Date("2026-10-18T00:00:00Z");
    const otherId = (second.body as { claim: { id: string } }).claim.id;
    const late = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${otherId}/submissions`, {
      method: "POST",
      token: b.token,
      idempotencyKey: key("late"),
      body: JSON.stringify({ provenance: "test", ...packed(discoveryEvidence()) }),
    });
    assert.equal(late.status, 409);
    assert.equal((late.body as { error: { code: string } }).error.code, "late_submission");
    const after = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}?provenance=test`);
    assert.equal((after.body as { committedAtomic: string }).committedAtomic, "10000");
    const owedStill = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/claims/${claimId}?provenance=test`, {
      token: OWNER_TOKEN,
    });
    assert.equal((owedStill.body as { claim: { status: string }; obligation: { paid: boolean } }).claim.status, "owed");
    assert.equal((owedStill.body as { obligation: { paid: boolean } }).obligation.paid, false);

    await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/cohort-events?provenance=test`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("contacted"),
      body: JSON.stringify({ kind: "contacted", eventRef: "thread-1" }),
    });
    await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/cohort-events?provenance=test`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("paid-obs"),
      body: JSON.stringify({ kind: "paid", eventRef: "not-a-transfer" }),
    });
    const cohort = await json(baseUrl, `/v1/opportunity-rounds/${round.roundKey}/cohort?provenance=test`, { token: OWNER_TOKEN });
    const numbers = cohort.body as { contacted: number; delivered: number; paid: number; paidObservations: number; revenue: boolean; routeConversion: string };
    assert.equal(numbers.contacted, 1);
    assert.equal(numbers.delivered, 0);
    assert.equal(numbers.paid, 0);
    assert.equal(numbers.paidObservations, 1);
    assert.equal(numbers.revenue, false);
    assert.equal(numbers.routeConversion, "unknown");
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("fixture credentials cannot enter production and old task claims still reserve exclusively", async () => {
  const { store, schema } = await openStore();
  const { server, baseUrl } = await listen(store);
  try {
    const denied = await json(baseUrl, "/v1/opportunity-rounds", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("bad-prod"),
      body: JSON.stringify(miniRound({ roundKey: "prod-denied", provenance: "fixture", productionAdmission: true })),
    });
    assert.equal(denied.status, 400);
    const production = miniRound({
      roundKey: "prod-round",
      provenance: "production",
      productionAdmission: true,
      offers: [
        {
          offerKey: "discovery-trace",
          title: "Discovery",
          summary: "Production shape only",
          slotCount: 1,
          rewardAtomic: 10000,
          maxEffortSeconds: 300,
          acceptance: "Explicit unknowns",
          evidenceKind: "discovery_trace",
          publicClaimable: true,
          rank: 1,
        },
      ],
    });
    const created = await json(baseUrl, "/v1/opportunity-rounds", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("prod"),
      body: JSON.stringify(production),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const termsVersion = (created.body as { termsVersion: string }).termsVersion;
    const fixtureCaller = await issueContributor(baseUrl, { provenance: "fixture" });
    const blocked = await json(baseUrl, "/v1/opportunity-rounds/prod-round/claims", {
      method: "POST",
      token: fixtureCaller.token,
      idempotencyKey: key("fixture-prod"),
      body: JSON.stringify({
        provenance: "production",
        offerKey: "discovery-trace",
        termsVersion,
        publicLabel: "FixtureCaller",
      }),
    });
    assert.equal(blocked.status, 403);
    assert.equal((blocked.body as { error: { code: string } }).error.code, "fixture_not_admitted");
    const forged = await json(baseUrl, "/v1/opportunity-rounds/prod-round/imports", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("forged"),
      body: JSON.stringify({
        provenance: "production",
        offerKey: "discovery-trace",
        publicLabel: "Synthetic01",
        importKey: "personal:forged",
        credentialRef: "fixture:synthetic-01",
      }),
    });
    assert.equal(forged.status, 403);

    const { taskId, termsVersion: taskTerms } = await createReservedTask(baseUrl);
    const contributor = await issueContributor(baseUrl);
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contributor.token,
      idempotencyKey: key("old-claim"),
      body: JSON.stringify({ termsVersion: taskTerms }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const other = await issueContributor(baseUrl);
    const lost = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: other.token,
      idempotencyKey: key("old-lose"),
      body: JSON.stringify({ termsVersion: taskTerms }),
    });
    assert.equal(lost.status, 409);
    assert.equal((lost.body as { error: { code: string } }).error.code, "reserved_elsewhere");

    const notice = await json(baseUrl, "/v1/opportunity-notices", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("notice"),
      body: JSON.stringify({
        campaignKey: "CRT-100198",
        nextRoundKey: "agent-opportunity-221400-v1",
        preservedPromise: { reward: "0.10", asset: "USDC", allocation: "0.50", unchanged: true },
      }),
    });
    assert.equal(notice.status, 201, JSON.stringify(notice.body));
    const repriced = await json(baseUrl, "/v1/opportunity-notices", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("notice-2"),
      body: JSON.stringify({
        campaignKey: "CRT-100198",
        nextRoundKey: "agent-opportunity-221400-v1",
        preservedPromise: { reward: "0.05", asset: "USDC", allocation: "0.50", unchanged: true },
      }),
    });
    assert.equal(repriced.status, 409);
    assert.equal((repriced.body as { error: { code: string } }).error.code, "promise_immutable");
    const read = await json(baseUrl, "/v1/opportunity-notices/CRT-100198");
    assert.equal((read.body as { preservedPromise: { reward: string }; doNotStartWork: boolean; paidSlot: boolean }).preservedPromise.reward, "0.10");
    assert.equal((read.body as { doNotStartWork: boolean }).doNotStartWork, true);
    assert.equal((read.body as { paidSlot: boolean }).paidSlot, false);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("two independent processes cannot oversubscribe one atomic cap", async () => {
  const { store, schema } = await openStore({ poolMax: 4 });
  const { server, baseUrl } = await listen(store);
  try {
    const round = miniRound({
      principalCapAtomic: 20000,
      offers: [
        {
          offerKey: "discovery-trace",
          title: "Discovery",
          summary: "One budgeted slot. A second independent claim must not reserve another.",
          slotCount: 1,
          rewardAtomic: 20000,
          maxEffortSeconds: 300,
          acceptance: "Explicit unknowns",
          evidenceKind: "discovery_trace",
          publicClaimable: true,
          rank: 1,
        },
      ],
    });
    const created = await json(baseUrl, "/v1/opportunity-rounds", {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: key("race-round"),
      body: JSON.stringify(round),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const termsVersion = (created.body as { termsVersion: string }).termsVersion;
    const callers = await Promise.all([issueContributor(baseUrl), issueContributor(baseUrl)]);
    const results = await Promise.all(
      callers.map(
        (caller, index) =>
          new Promise<{ status: number; body: unknown }>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [
                "--input-type=module",
                "-e",
                `const response = await fetch(process.env.URL, {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    authorization: "Bearer " + process.env.TOKEN,
                    "idempotency-key": process.env.IDEM,
                  },
                  body: process.env.BODY,
                });
                const text = await response.text();
                process.stdout.write(JSON.stringify({ status: response.status, body: text ? JSON.parse(text) : null }));`,
              ],
              {
                env: {
                  ...process.env,
                  URL: `${baseUrl}/v1/opportunity-rounds/${round.roundKey}/claims`,
                  TOKEN: caller.token,
                  IDEM: `race-${index}-${randomBytes(4).toString("hex")}`,
                  BODY: JSON.stringify({
                    provenance: "test",
                    offerKey: "discovery-trace",
                    termsVersion,
                    publicLabel: `Racer${index}`,
                  }),
                },
              },
            );
            let out = "";
            child.stdout.on("data", (chunk) => {
              out += String(chunk);
            });
            child.on("error", reject);
            child.on("close", (code) => {
              if (code !== 0) {
                reject(new Error(`child ${index} exited ${code}: ${out}`));
                return;
              }
              resolve(JSON.parse(out) as { status: number; body: unknown });
            });
          }),
      ),
    );
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [201, 409], JSON.stringify(results));
    assert.equal(await count(schema, "SELECT COALESCE(SUM(reward_atomic),0)::text AS n FROM opportunity_claims WHERE status IN ('reserved','submitted','accepted','owed')"), "20000");
    const loser = results.find((result) => result.status === 409);
    assert.equal((loser?.body as { doNotStartWork: boolean; paidSlot: boolean }).doNotStartWork, true);
    assert.equal((loser?.body as { paidSlot: boolean }).paidSlot, false);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
