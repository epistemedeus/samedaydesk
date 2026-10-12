import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import {
  OWNER_TOKEN,
  closeServer,
  databaseUrl,
  dropSchema,
  issueContributor,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

const CLOCK = () => new Date("2026-10-12T12:00:00Z");
const ROUND = "agent-opportunity-221400-v1";
const selfReport = {
  listingRef: null,
  encounterAt: null,
  encounterEstimated: false,
  route: "unknown",
  query: null,
  endpointOrFilter: null,
  upstreamPublicLink: null,
  snippetRef: null,
  pagesFollowed: [],
  decisionPoint: null,
  role: null,
  activeMinutes: null,
  confidence: "unknown",
  unknowns: ["route", "delivery", "acquisition"],
};

function roundBody(overrides: Record<string, unknown> = {}) {
  return {
    roundKey: key("funnel"),
    provenance: "test",
    productionAdmission: false,
    principalCapAtomic: 300000,
    atomicScale: 6,
    asset: "USDC",
    network: "base",
    chainId: 8453,
    submissionDeadline: "2026-10-19T23:59:59Z",
    claimTtlSeconds: 86400,
    reviewWithinDays: 3,
    maxClarifications: 1,
    maxEvidenceBytes: 12000,
    transferFeeCap: { amountAtomic: "10000000000000", asset: "ETH", note: "No transfer has occurred." },
    offers: [
      {
        offerKey: "discovery-trace",
        title: "Discovery",
        summary: "Synthetic discovery reservation. Unknown is not filled from a referrer.",
        slotCount: 10,
        ownerReservedSlots: 10,
        rewardAtomic: 10000,
        maxEffortSeconds: 300,
        acceptance: "Explicit unknowns",
        evidenceKind: "discovery_trace",
        publicClaimable: true,
        rank: 1,
      },
      {
        offerKey: "workflow-witness",
        title: "Workflow",
        summary: "Owner confirms a distinct scope before an unassigned slot starts.",
        slotCount: 4,
        ownerReservedSlots: 4,
        rewardAtomic: 50000,
        maxEffortSeconds: 1200,
        acceptance: "Actual attempt or limitation",
        evidenceKind: "workflow_witness",
        publicClaimable: false,
        rank: 2,
      },
    ],
    alternatives: [],
    ...overrides,
  };
}

function packed(evidence: unknown = { kind: "discovery_trace", selfReport }) {
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

async function withRound(
  fn: (ctx: any) => Promise<void>,
  options: { round?: Record<string, unknown>; config?: Record<string, unknown>; clock?: () => Date } = {},
) {
  const { store, schema } = await openStore({ clock: options.clock ?? CLOCK });
  const { server, baseUrl } = await listen(store, { config: options.config });
  const round = roundBody(options.round);
  const root = `/v1/opportunity-rounds/${round.roundKey}`;
  const post = (path: string, body: unknown, token = OWNER_TOKEN, idem = key("write")) =>
    json(baseUrl, path, { method: "POST", token, idempotencyKey: idem, body: JSON.stringify(body) });
  const sql = async (query: string, values: unknown[] = []) => {
    const client = new pg.Client({ connectionString: databaseUrl() });
    await client.connect();
    try {
      await client.query(`SET search_path TO ${quoteIdent(schema)}`);
      return (await client.query(query, values)).rows;
    } finally {
      await client.end();
    }
  };
  try {
    const created = await post("/v1/opportunity-rounds", round);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const termsVersion = (created.body as any).termsVersion;
    const imported = (extra: Record<string, unknown> = {}, idem = key("import")) =>
      post(`${root}/imports`, {
        provenance: round.provenance,
        offerKey: "discovery-trace",
        publicLabel: "Synthetic01",
        credentialRef: "test:synthetic-01",
        importKey: "synthetic-import-01",
        deferStart: false,
        ...extra,
      }, OWNER_TOKEN, idem);
    await fn({ baseUrl, schema, store, root, round, termsVersion, post, imported, sql, server });
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
}

test("funnel: owner imports and assignments are not holder or external conversions", async () => {
  await withRound(async ({ root, post, baseUrl, imported }) => {
    assert.equal((await imported()).status, 201);
    assert.equal((await imported({
      publicLabel: "Synthetic02",
      credentialRef: "test:synthetic-02",
      importKey: "synthetic-import-02",
    })).status, 201);
    const assigned = await post(`${root}/assignments`, {
      provenance: "test",
      offerKey: "workflow-witness",
      publicLabel: "Synthetic02",
      credentialRef: "test:synthetic-02",
      importKey: "synthetic-assign-02",
      scope: { title: "Synthetic workflow", instructions: "Synthetic scope only" },
    });
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
    const read = await json(baseUrl, `${root}/claims/${(assigned.body as any).claim.id}?provenance=test`, { token: OWNER_TOKEN });
    assert.equal(read.status, 200);
    const cohort = await json(baseUrl, `${root}/cohort?provenance=test`, { token: OWNER_TOKEN });
    const body = cohort.body as any;
    assert.equal(body.claimed, 3);
    assert.equal(body.claimedIsHolderConversion, false);
    assert.equal(body.claimedIsExternalActivity, false);
    assert.equal(body.agentConversion, "unknown");
    assert.equal(body.funnel.reservations.ownerImportRows, 2);
    assert.equal(body.funnel.reservations.ownerAssignmentRows, 1);
    assert.equal(body.funnel.reservations.publicClaimRows, 0);
    assert.equal(body.funnel.reservations.rows, 3);
    assert.equal(body.funnel.reservations.uniqueRecipients, 2);
    assert.equal(body.funnel.holderOriginated.acknowledgementEvents, 0);
    assert.equal(body.funnel.holderOriginated.acknowledgementRequests, 0);
    assert.equal(body.funnel.holderOriginated.uniqueRecipients, 0);
    assert.equal(body.funnel.holderOriginated.additionalPaidSlots, 0);
    assert.equal(body.funnel.holderOriginated.ownerIssuanceIncluded, false);
    assert.equal(body.funnel.holderOriginated.readbackIncluded, false);
    assert.equal(body.funnel.holderOriginated.verifiedExternalActivity, false);
    assert.equal(body.funnel.external.identity, "unknown");
    assert.equal(body.funnel.external.delivery, "unknown");
    assert.equal(body.funnel.external.acquisition, "unknown");
    assert.equal(body.funnel.submissions.rows, 0);
    assert.equal(body.funnel.owed.rows, 0);
    assert.equal(body.funnel.settlement.observedEvents, 0);
    assert.equal(body.funnel.settlement.inferredFromOwed, false);
    assert.equal(body.funnel.retainedUse.observedEvents, 0);
    assert.equal(body.paid, 0);
    assert.equal(body.revenue, false);
  });
});

test("funnel: repeated holder confirmation is one acknowledgement and no new slot", async () => {
  await withRound(async ({ root, baseUrl, imported, sql, termsVersion }) => {
    const first = (await imported()).body as any;
    const before = await sql("SELECT COUNT(*)::int AS n, COALESCE(SUM(reward_atomic),0)::text AS total FROM opportunity_claims");
    const ackBody = {
      provenance: "test",
      offerKey: "discovery-trace",
      termsVersion,
      publicLabel: "Synthetic01",
    };
    const idem = key("ack");
    const ack = await json(baseUrl, `${root}/claims`, {
      method: "POST", token: first.token, idempotencyKey: idem, body: JSON.stringify(ackBody),
    });
    assert.equal(ack.status, 201, JSON.stringify(ack.body));
    const ackBodyJson = ack.body as any;
    assert.equal(ackBodyJson.holderOriginatedAcknowledgement, true);
    assert.equal(ackBodyJson.acknowledgementCreated, true);
    assert.equal(ackBodyJson.additionalPaidSlot, false);
    assert.equal(ackBodyJson.newReservation, false);
    assert.equal(ackBodyJson.verifiedExternalActivity, false);
    assert.equal(ackBodyJson.externalIdentity, "unknown");
    assert.equal(ackBodyJson.claim.id, first.claim.id);
    assert.equal(ack.text.includes(first.token), false);
    const replay = await json(baseUrl, `${root}/claims`, {
      method: "POST", token: first.token, idempotencyKey: idem, body: JSON.stringify(ackBody),
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    const again = await json(baseUrl, `${root}/claims`, {
      method: "POST", token: first.token, idempotencyKey: key("ack-again"), body: JSON.stringify(ackBody),
    });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal((again.body as any).acknowledgementCreated, false);
    assert.equal((again.body as any).additionalPaidSlot, false);
    const after = await sql("SELECT COUNT(*)::int AS n, COALESCE(SUM(reward_atomic),0)::text AS total FROM opportunity_claims");
    assert.deepEqual(after[0], before[0]);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_events WHERE kind='holder_acknowledgement'"))[0].n, 1);
    const cohort = await json(baseUrl, `${root}/cohort?provenance=test`, { token: OWNER_TOKEN });
    const funnel = (cohort.body as any).funnel;
    assert.equal(funnel.holderOriginated.acknowledgementEvents, 1);
    assert.equal(funnel.holderOriginated.acknowledgementRequests, 2);
    assert.equal(funnel.holderOriginated.uniqueRecipients, 1);
    assert.equal(funnel.holderOriginated.additionalPaidSlots, 0);
    assert.equal(funnel.reservations.rows, 1);
    assert.equal((cohort.body as any).claimedIsHolderConversion, false);
    assert.equal(funnel.external.delivery, "unknown");
  });
});

test("funnel: another holder, round, or provenance cannot acknowledge the reservation", async () => {
  await withRound(async ({ root, baseUrl, imported, post, termsVersion, sql }) => {
    const holder = (await imported()).body as any;
    const other = await issueContributor(baseUrl);
    const deniedRead = await json(baseUrl, `${root}/claims/${holder.claim.id}?provenance=test`, { token: other.token });
    assert.equal(deniedRead.status, 403);
    const deniedAck = await json(baseUrl, `${root}/claims`, {
      method: "POST",
      token: other.token,
      idempotencyKey: key("other-holder"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "SyntheticOther" }),
    });
    assert.equal(deniedAck.status, 409, JSON.stringify(deniedAck.body));
    assert.equal((deniedAck.body as any).paidSlot, false);
    const otherRound = roundBody({ roundKey: key("other-round") });
    assert.equal((await post("/v1/opportunity-rounds", otherRound)).status, 201);
    const crossed = await json(baseUrl, `/v1/opportunity-rounds/${otherRound.roundKey}/claims`, {
      method: "POST",
      token: holder.token,
      idempotencyKey: key("other-round"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "Synthetic01" }),
    });
    assert.equal(crossed.status, 403, JSON.stringify(crossed.body));
    const wrongProvenance = await json(baseUrl, `${root}/claims`, {
      method: "POST",
      token: holder.token,
      idempotencyKey: key("wrong-provenance"),
      body: JSON.stringify({ provenance: "production", offerKey: "discovery-trace", termsVersion, publicLabel: "Synthetic01" }),
    });
    assert.equal(wrongProvenance.status, 404);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_events WHERE kind='holder_acknowledgement'"))[0].n, 0);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_claims"))[0].n, 1);
  });
});

test("funnel: acknowledgement keeps immutable terms and a deferred reservation closed", async () => {
  await withRound(async ({ root, baseUrl, imported, post, termsVersion }) => {
    const deferred = (await imported({ publicLabel: "Synthetic06", credentialRef: "test:synthetic-06", importKey: "synthetic-import-06", deferStart: true })).body as any;
    assert.equal(deferred.doNotStartWork, true);
    assert.equal(deferred.claim.termsVersion, termsVersion);
    const notice = await post("/v1/opportunity-notices", {
      campaignKey: key("notice"),
      nextRoundKey: ROUND,
      preservedPromise: { reward: "0.10", asset: "USDC", allocation: "0.50" },
    });
    assert.equal(notice.status, 201, JSON.stringify(notice.body));
    const ack = await json(baseUrl, `${root}/claims`, {
      method: "POST",
      token: deferred.token,
      idempotencyKey: key("deferred-ack"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "Synthetic06" }),
    });
    assert.equal(ack.status, 201, JSON.stringify(ack.body));
    assert.equal((ack.body as any).claim.deferStart, true);
    assert.equal((ack.body as any).doNotStartWork, true);
    assert.equal((ack.body as any).claim.termsVersion, termsVersion);
    assert.equal((ack.body as any).additionalPaidSlot, false);
    const submitted = await post(`${root}/claims/${deferred.claim.id}/submissions`, packed(), deferred.token);
    assert.equal(submitted.status, 409);
    assert.equal((submitted.body as any).error.code, "deferred_start");
    const changedTerms = await json(baseUrl, `${root}/claims`, {
      method: "POST",
      token: deferred.token,
      idempotencyKey: key("changed-terms"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion: `sha256:${"ab".repeat(32)}`, publicLabel: "Synthetic06" }),
    });
    assert.equal(changedTerms.status, 409);
    const read = await json(baseUrl, `${root}/claims/${deferred.claim.id}?provenance=test`, { token: deferred.token });
    assert.equal((read.body as any).claim.termsVersion, termsVersion);
    assert.equal((read.body as any).claim.deferStart, true);
    const preserved = await json(baseUrl, `/v1/opportunity-notices/${(notice.body as any).campaignKey}`);
    assert.equal((preserved.body as any).preservedPromise.reward, "0.10");
    assert.equal((preserved.body as any).repriced, false);
  });
});

test("funnel: email and HTTP observations stay separate from source self-report", async () => {
  await withRound(async ({ root, baseUrl, imported, post, termsVersion, sql }) => {
    const holder = (await imported()).body as any;
    const email = await post(`${root}/cohort-events?provenance=test`, { kind: "contacted", eventRef: "email-thread-synthetic", channel: "email" });
    assert.equal(email.status, 201, JSON.stringify(email.body));
    const http = await post(`${root}/cohort-events?provenance=test`, { kind: "contacted", eventRef: "http-observation-synthetic", channel: "http" });
    assert.equal(http.status, 201, JSON.stringify(http.body));
    const clash = await post(`${root}/cohort-events?provenance=test`, { kind: "contacted", eventRef: "email-thread-synthetic", channel: "http" });
    assert.equal(clash.status, 409);
    const report = {
      ...selfReport,
      query: "current-query-not-original-encounter",
      route: "direct_invitation",
    };
    const observed = {
      eventIds: ["forged-event"],
      placementId: "placement-data",
      campaignId: "campaign-data",
      sourceId: "source-data",
      providerId: "provider-data",
      query: "current-query-not-original-encounter",
      endpoint: "/forged",
      reconstructed: false,
    };
    const ack = await json(baseUrl, `${root}/claims`, {
      method: "POST",
      token: holder.token,
      idempotencyKey: key("source-ack"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "Synthetic01" }),
    });
    assert.equal(ack.status, 201, JSON.stringify(ack.body));
    const source = await post(`${root}/claims/${holder.claim.id}/source`, { provenance: "test", selfReport: report, observed }, holder.token);
    assert.equal(source.status, 201, JSON.stringify(source.body));
    assert.equal((source.body as any).selfReport.query, "current-query-not-original-encounter");
    assert.equal((source.body as any).observed.server.query, null);
    assert.equal((source.body as any).observed.server.providerId, null);
    assert.equal((source.body as any).observed.volunteered.providerId, "provider-data");
    assert.equal((source.body as any).currentQueryIsOriginalEncounter, false);
    assert.equal((source.body as any).currentReferrerIsOriginalEncounter, false);
    const encounter = await sql("SELECT payload FROM opportunity_events WHERE claim_id=$1 AND kind='encounter'", [holder.claim.id]);
    assert.equal(JSON.stringify(encounter).includes("current-query-not-original-encounter"), false);
    const round = await json(baseUrl, `${root}?provenance=test`);
    assert.equal(round.text.includes("current-query-not-original-encounter"), false);
    assert.equal(round.text.includes("provider-data"), false);
    assert.equal(round.text.includes(holder.token), false);
    const cohort = await json(baseUrl, `${root}/cohort?provenance=test`, { token: OWNER_TOKEN });
    const body = cohort.body as any;
    assert.equal(body.contacted, 2);
    assert.equal(body.delivered, 0);
    assert.equal(body.sentIsNotDelivery, true);
    assert.equal(body.funnel.observations.email.contacted, 1);
    assert.equal(body.funnel.observations.email.delivered, 0);
    assert.equal(body.funnel.observations.http.contacted, 1);
    assert.equal(body.funnel.observations.http.delivered, 0);
    assert.equal(cohort.text.includes("current-query-not-original-encounter"), false);
    assert.equal(body.funnel.external.identity, "unknown");
    assert.equal(body.funnel.external.delivery, "unknown");
    assert.equal(body.funnel.external.acquisition, "unknown");
  });
});

test("funnel: duplicate submissions and acceptance do not invent settlement or retained use", async () => {
  await withRound(async ({ root, post, baseUrl, imported, sql }) => {
    const holder = (await imported()).body as any;
    const evidence = packed();
    const first = await post(`${root}/claims/${holder.claim.id}/submissions`, evidence, holder.token, key("submit-1"));
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const duplicateKey = await post(`${root}/claims/${holder.claim.id}/submissions`, evidence, holder.token, key("submit-1"));
    assert.equal(duplicateKey.status, 200);
    const duplicateBody = await post(`${root}/claims/${holder.claim.id}/submissions`, evidence, holder.token, key("submit-2"));
    assert.equal(duplicateBody.status, 200);
    const accepted = await post(`${root}/claims/${holder.claim.id}/accept`, { provenance: "test" }, OWNER_TOKEN, key("accept-1"));
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    assert.equal((accepted.body as any).paid, false);
    assert.equal((accepted.body as any).settled, false);
    assert.equal((accepted.body as any).transfer, null);
    const acceptedAgain = await post(`${root}/claims/${holder.claim.id}/accept`, { provenance: "test" }, OWNER_TOKEN, key("accept-2"));
    assert.equal(acceptedAgain.status, 200);
    let cohort = (await json(baseUrl, `${root}/cohort?provenance=test`, { token: OWNER_TOKEN })).body as any;
    assert.equal(cohort.funnel.submissions.rows, 1);
    assert.equal(cohort.funnel.submissions.uniqueRecipients, 1);
    assert.equal(cohort.funnel.submissions.requests >= 2, true);
    assert.equal(cohort.funnel.acceptance.rows, 1);
    assert.equal(cohort.funnel.owed.rows, 1);
    assert.equal(cohort.funnel.owed.paidRows, 0);
    assert.equal(cohort.funnel.settlement.observedEvents, 0);
    assert.equal(cohort.funnel.settlement.inferredFromAcceptance, false);
    assert.equal(cohort.funnel.retainedUse.observedEvents, 0);
    assert.equal(cohort.funnel.retainedUse.inferredFromAcceptance, false);
    assert.equal((await post(`${root}/cohort-events?provenance=test`, { kind: "paid", eventRef: "settlement-observation", channel: "operator" })).status, 201);
    assert.equal((await post(`${root}/cohort-events?provenance=test`, { kind: "useful_later_consumer", eventRef: "retained-use-observation", channel: "operator" })).status, 201);
    cohort = (await json(baseUrl, `${root}/cohort?provenance=test`, { token: OWNER_TOKEN })).body as any;
    assert.equal(cohort.paid, 0);
    assert.equal(cohort.funnel.settlement.observedEvents, 1);
    assert.equal(cohort.funnel.settlement.obligationPaidRows, 0);
    assert.equal(cohort.funnel.retainedUse.observedEvents, 1);
    assert.equal(cohort.funnel.observations.operator.paid, 1);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_obligations WHERE paid=false AND settled=false AND transfer IS NULL"))[0].n, 1);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_submissions"))[0].n, 1);
    assert.equal((await sql("SELECT COUNT(*)::int AS n FROM earned_work_obligations"))[0].n, 0);
  });
});

test("funnel: hosted projection is explicit, and absent, malformed, or wrong-origin input stays unconfigured", async () => {
  const hostedModule = await import("../opportunity-hosted-delivery.mjs");
  const admission = {origin: "https://samedaydesk.com", prefix: "/api/neomorphic-opportunity", roundKey: ROUND};
  const valid = hostedModule.projectHostedDelivery({
    origin: "https://samedaydesk.com",
    prefix: "/api/neomorphic-opportunity",
    roundKey: ROUND,
  }, admission);
  assert.equal(valid.configuration, "hosted");
  assert.equal(valid.deliveryState, "hosted");
  assert.equal(valid.publicPaidCapacity, 0);
  assert.equal(valid.hostedClaimAutomation, false);
  assert.equal(valid.settlementAutomatic, false);
  assert.equal(valid.grantsDelivered, false);
  assert.equal(valid.openInventory, false);
  assert.equal(valid.anonymousSelfRegistration, false);
  assert.equal(valid.roundReadPath, "https://samedaydesk.com/api/neomorphic-opportunity/v1/opportunity-rounds/agent-opportunity-221400-v1");
  assert.equal(valid.submissionPathTemplate, "https://samedaydesk.com/api/neomorphic-opportunity/v1/opportunity-rounds/agent-opportunity-221400-v1/claims/{claimId}/submissions");
  assert.equal(valid.readbackPathTemplate, "https://samedaydesk.com/api/neomorphic-opportunity/v1/opportunity-rounds/agent-opportunity-221400-v1/claims/{claimId}");
  assert.equal(hostedModule.projectHostedDelivery(undefined).configuration, "absent");
  assert.equal(hostedModule.projectHostedDelivery(undefined).deliveryState, "unconfigured");
  for (const input of [
    { origin: "https://samedaydesk.com" },
    { origin: "http://samedaydesk.com", prefix: "/api/neomorphic-opportunity", roundKey: ROUND },
    { origin: "https://user:secret@samedaydesk.com", prefix: "/api/neomorphic-opportunity", roundKey: ROUND },
    { origin: "https://samedaydesk.com/api/neomorphic-opportunity", prefix: "/api/neomorphic-opportunity", roundKey: ROUND },
    { origin: "https://samedaydesk.com", prefix: "/api/neomorphic-opportunity?token=ew_ctr_secret", roundKey: ROUND },
  ]) {
    const parsed = hostedModule.projectHostedDelivery(input, admission);
    assert.equal(parsed.configuration, "malformed", JSON.stringify(input));
    assert.equal(parsed.deliveryState, "unconfigured");
    assert.equal(parsed.roundReadPath, null);
    assert.equal(JSON.stringify(parsed).includes("secret"), false);
    assert.equal(JSON.stringify(parsed).includes("ew_ctr_"), false);
  }
  for (const origin of ["https://evil.example", "https://neomorphic.io", "https://www.samedaydesk.com"]) {
    const parsed = hostedModule.projectHostedDelivery({ origin, prefix: "/api/neomorphic-opportunity", roundKey: ROUND }, admission);
    assert.equal(parsed.configuration, "wrong_origin", origin);
    assert.equal(parsed.deliveryState, "unconfigured");
    assert.equal(parsed.origin, null);
  }
  assert.equal(hostedModule.projectHostedDelivery({
    origin: "https://samedaydesk.com",
    prefix: "/api/neomorphic-opportunity",
    roundKey: "some-other-round",
  }, admission).configuration, "out_of_scope");

  await withRound(async ({ root, baseUrl, termsVersion }) => {
    const read = await json(baseUrl, `${root}?provenance=test`);
    assert.equal((read.body as any).deliveryState, "unconfigured");
    assert.equal((read.body as any).hostedDelivery.configuration, "absent");
    assert.equal((read.body as any).publicClaimable ?? (read.body as any).offers[0].publicClaimable, false);
    assert.equal((read.body as any).offers.every((offer: any) => offer.publicRemainingSlots === 0 && offer.publicClaimable === false), true);
    assert.equal((read.body as any).hostedClaimAutomation, false);
    const caller = await issueContributor(baseUrl);
    const declared = await json(baseUrl, `${root}/claims`, {
      method: "POST",
      token: caller.token,
      idempotencyKey: key("declare"),
      body: JSON.stringify({
        provenance: "test",
        offerKey: "discovery-trace",
        termsVersion,
        publicLabel: "Synthetic",
        deliveryState: "hosted",
        hostedOrigin: "https://samedaydesk.com",
      }),
    });
    assert.equal(declared.status, 400);
    const still = await json(baseUrl, `${root}?provenance=test`);
    assert.equal((still.body as any).hostedDelivery.configuration, "absent");
    assert.equal((await json(baseUrl, "/v1/contributor-tokens", { method: "POST", body: JSON.stringify({ contributorPublicId: "Synthetic", provenance: "test" }) })).status, 401);
  }, { round: { roundKey: ROUND } });

  await withRound(async ({ root, baseUrl, imported, termsVersion }) => {
    const read = await json(baseUrl, `${root}?provenance=test`);
    const body = read.body as any;
    assert.equal(body.deliveryState, "hosted");
    assert.equal(body.hostedDelivery.configuration, "hosted");
    assert.equal(body.hostedDelivery.roundReadPath, valid.roundReadPath);
    assert.equal(body.hostedDelivery.submissionPathTemplate, valid.submissionPathTemplate);
    assert.equal(body.hostedDelivery.readbackPathTemplate, valid.readbackPathTemplate);
    assert.equal(body.hostedClaimAutomation, false);
    assert.equal(body.offers[0].publicRemainingSlots, 0);
    assert.equal(body.offers[0].publicClaimable, false);
    assert.equal(body.hostedDelivery.publicPaidCapacity, 0);
    assert.equal(body.hostedDelivery.settlementAutomatic, false);
    assert.equal(body.hostedDelivery.grantsDelivered, false);
    assert.match(body.hostedDelivery.note, /contact@neomorphic\.io/);
    assert.match(body.hostedDelivery.note, /scoped holder/i);
    const holder = (await imported({ provenance: "test" })).body as any;
    const ack = await json(baseUrl, `${root}/claims`, {
      method: "POST",
      token: holder.token,
      idempotencyKey: key("hosted-ack"),
      body: JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "Synthetic01" }),
    });
    assert.equal(ack.status, 201, JSON.stringify(ack.body));
    assert.equal((ack.body as any).hostedDelivery.readbackPathTemplate, valid.readbackPathTemplate);
    const submitted = await json(baseUrl, `${root}/claims/${holder.claim.id}/submissions`, {
      method: "POST",
      token: holder.token,
      idempotencyKey: key("hosted-submit"),
      body: JSON.stringify(packed()),
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal((submitted.body as any).hostedDelivery.submissionPathTemplate, valid.submissionPathTemplate);
    assert.equal((submitted.body as any).hostedDelivery.settlementAutomatic, false);
    const readback = await json(baseUrl, `${root}/claims/${holder.claim.id}?provenance=test`, { token: holder.token });
    assert.equal((readback.body as any).hostedDelivery.readbackPathTemplate, valid.readbackPathTemplate);
    assert.equal(readback.text.includes(holder.token), false);
  }, { round: { roundKey: ROUND }, config: { hostedDelivery: valid } });

  const malformed = hostedModule.projectHostedDelivery({ origin: "https://evil.example", prefix: "/api/neomorphic-opportunity", roundKey: ROUND }, admission);
  await withRound(async ({ root, baseUrl }) => {
    const read = await json(baseUrl, `${root}?provenance=test`);
    assert.equal((read.body as any).deliveryState, "unconfigured");
    assert.equal((read.body as any).hostedDelivery.configuration, "wrong_origin");
    assert.equal((read.body as any).hostedDelivery.roundReadPath, null);
    assert.equal(read.text.includes("evil.example"), false);
  }, { round: { roundKey: ROUND }, config: { hostedDelivery: malformed } });
});

test("funnel: killed acknowledgement reconciles one event and no second slot", async () => {
  await withRound(async ({ schema, root, imported, termsVersion, sql }) => {
    const holder = (await imported()).body as any;
    const body = JSON.stringify({ provenance: "test", offerKey: "discovery-trace", termsVersion, publicLabel: "Synthetic01" });
    const idem = key("unknown-ack");
    const child = spawn(process.execPath, ["--import", "tsx", new URL("./opportunity-process-fixture.mjs", import.meta.url).pathname], {
      env: { ...process.env, EARNED_WORK_PG_SCHEMA: schema, RECEIVING_CRASH_AFTER_COMMIT: "1" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let errors = "";
    child.stderr.on("data", (chunk) => { errors += chunk; });
    const ready = await Promise.race([
      once(child, "message").then(([message]) => message as { baseUrl: string }),
      once(child, "exit").then(([code]) => { throw new Error(`server exited ${code}: ${errors}`); }),
    ]);
    const exited = once(child, "exit");
    await assert.rejects(json(ready.baseUrl, `${root}/claims`, { method: "POST", token: holder.token, idempotencyKey: idem, body }));
    await exited;
    const restarted = spawn(process.execPath, ["--import", "tsx", new URL("./opportunity-process-fixture.mjs", import.meta.url).pathname], {
      env: { ...process.env, EARNED_WORK_PG_SCHEMA: schema, RECEIVING_CRASH_AFTER_COMMIT: "0" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const again = await once(restarted, "message").then(([message]) => message as { baseUrl: string });
    try {
      const retry = await json(again.baseUrl, `${root}/claims`, { method: "POST", token: holder.token, idempotencyKey: idem, body });
      assert.equal(retry.status, 200, JSON.stringify(retry.body));
      assert.equal((retry.body as any).holderOriginatedAcknowledgement, true);
      assert.equal((retry.body as any).additionalPaidSlot, false);
      assert.equal(retry.text.includes(holder.token), false);
      assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_events WHERE kind='holder_acknowledgement'"))[0].n, 1);
      assert.equal((await sql("SELECT COUNT(*)::int AS n FROM opportunity_claims"))[0].n, 1);
      assert.equal((await sql("SELECT COUNT(*)::int AS n FROM earned_work_idempotency WHERE scope='opportunity_holder_ack' AND key=$1", [idem]))[0].n, 1);
    } finally {
      const done = once(restarted, "exit");
      restarted.kill("SIGTERM");
      await done;
    }
  });
});

test("funnel: holder CLI reads through the env bearer and does not print it", async () => {
  await withRound(async ({ baseUrl, round, imported }) => {
    const holder = (await imported()).body as any;
    const env = { ...process.env, OPPORTUNITY_HOLDER_TOKEN: holder.token, OPPORTUNITY_BASE_URL: baseUrl };
    delete env.EARNED_WORK_OWNER_TOKEN;
    const child = spawn(process.execPath, [
      new URL("../scripts/opportunity.mjs", import.meta.url).pathname,
      "read-claim",
      "--round",
      round.roundKey,
      "--claim",
      holder.claim.id,
      "--provenance",
      "test",
    ], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = await new Promise<string>((resolve, reject) => {
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.stderr.on("data", (chunk) => { err += chunk; });
      child.on("exit", (code) => code === 0 ? resolve(out) : reject(new Error(err || out)));
    });
    assert.equal(stdout.includes(holder.token), false);
    assert.equal(stdout.includes("Bearer"), false);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, 200);
    assert.equal(parsed.body.claim.id, holder.claim.id);
  });
});

