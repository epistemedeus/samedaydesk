import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import { hashToken } from "../src/crypto.js";
import { isTransientPgError } from "../src/store/postgres.js";
import {
  OWNER_TOKEN,
  TEST_ARTIFACT,
  TEST_PROVENANCE,
  closeServer,
  createReservedTask,
  databaseUrl,
  dropSchema,
  json,
  key,
  listen,
  openStore,
} from "./helpers.js";

/** Driver-boundary ACK loss after Postgres accepted the write. Not a network proxy. */
function lostAck(): Error {
  return Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
}

async function countRows(schema: string, sql: string, params: unknown[] = []): Promise<number> {
  const inspector = new pg.Client({ connectionString: databaseUrl() });
  inspector.on("error", () => {});
  await inspector.connect();
  try {
    await inspector.query(`SET search_path TO ${quoteIdent(schema)}`);
    const result = await inspector.query<{ n: number }>(sql, params);
    return result.rows[0]?.n ?? -1;
  } finally {
    await inspector.end();
  }
}

test("unique-violation is not a transient retry signal", () => {
  assert.equal(isTransientPgError(Object.assign(new Error("duplicate"), { code: "23505" })), false);
  assert.equal(isTransientPgError(lostAck()), true);
});

test("COMMIT ACK loss: same-key verdict/accept replay is one row each; later read works", async () => {
  let lose: "none" | "verdict" | "accept" = "none";
  const { store, schema } = await openStore({
    afterDurableWrite: ({ kind }) => {
      if (kind !== "commit") return;
      if (lose === "verdict" || lose === "accept") {
        lose = "none";
        throw lostAck();
      }
    },
  });
  const { server, baseUrl } = await listen(store);
  try {
    const { taskId, termsVersion } = await createReservedTask(baseUrl);
    const issued = await json(baseUrl, "/v1/contributor-tokens", {
      method: "POST",
      token: OWNER_TOKEN,
      body: JSON.stringify({ contributorPublicId: "ack-loss-contrib", provenance: TEST_PROVENANCE, taskId }),
    });
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    const contribToken = (issued.body as { token: string }).token;
    const claimed = await json(baseUrl, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contribToken,
      idempotencyKey: key("ack-claim"),
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
    const submitted = await json(baseUrl, `/v1/tasks/${taskId}/submissions`, {
      method: "POST",
      token: contribToken,
      idempotencyKey: key("ack-submit"),
      body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));

    const verdictKey = key("ack-verdict");
    lose = "verdict";
    const verdict = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: verdictKey,
      body: JSON.stringify({ reservationId, outcome: "pass" }),
    });
    assert.ok(verdict.status === 200 || verdict.status === 201, JSON.stringify(verdict.body));
    const verdictId = (verdict.body as { verdict: { id: string } }).verdict.id;
    const verdictReplay = await json(baseUrl, `/v1/tasks/${taskId}/verdicts`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: verdictKey,
      body: JSON.stringify({ reservationId, outcome: "pass" }),
    });
    assert.ok(verdictReplay.status === 200 || verdictReplay.status === 201, JSON.stringify(verdictReplay.body));
    assert.equal((verdictReplay.body as { verdict: { id: string } }).verdict.id, verdictId);
    assert.equal(await countRows(schema, "SELECT count(*)::int AS n FROM earned_work_verdicts WHERE task_id = $1", [taskId]), 1);

    const acceptKey = key("ack-accept");
    lose = "accept";
    const accepted = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: acceptKey,
      body: JSON.stringify({ reservationId, verdictId }),
    });
    assert.ok(accepted.status === 200 || accepted.status === 201, JSON.stringify(accepted.body));
    const replay = await json(baseUrl, `/v1/tasks/${taskId}/accept`, {
      method: "POST",
      token: OWNER_TOKEN,
      idempotencyKey: acceptKey,
      body: JSON.stringify({ reservationId, verdictId }),
    });
    assert.ok(replay.status === 200 || replay.status === 201, JSON.stringify(replay.body));
    assert.equal(await countRows(schema, "SELECT count(*)::int AS n FROM earned_work_obligations WHERE task_id = $1", [taskId]), 1);

    await store.checkReady();
    const owed = await json(baseUrl, `/v1/tasks/${taskId}/contributor-obligation`, { token: contribToken });
    assert.equal(owed.status, 200, JSON.stringify(owed.body));
    assert.equal((owed.body as { readback: string; obligation: { verdictId: string } }).readback, "owed");
    assert.equal((owed.body as { obligation: { verdictId: string } }).obligation.verdictId, verdictId);
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});

test("unfenced grant ACK loss is unknown; one token row; recovery does not issue a second token", async () => {
  let loseGrant = false;
  const { store, schema } = await openStore({
    afterDurableWrite: ({ kind }) => {
      if (kind === "autocommit" && loseGrant) {
        loseGrant = false;
        throw lostAck();
      }
    },
  });
  const { server, baseUrl } = await listen(store);
  const tokenHash = hashToken("ew_ctr_ack_loss_fixture_token");
  try {
    loseGrant = true;
    await assert.rejects(
      () =>
        store.createContributorToken({
          publicId: "ack-loss-grant",
          payoutDestination: null,
          taskScope: null,
          provenance: TEST_PROVENANCE,
          tokenHash,
          expiresAt: null,
        }),
      (error: unknown) => {
        assert.equal(isTransientPgError(error), true, String(error));
        assert.notEqual((error as { code?: string }).code, "23505");
        return true;
      },
    );
    assert.equal(loseGrant, false);
    assert.equal(
      await countRows(schema, "SELECT count(*)::int AS n FROM earned_work_contributor_tokens WHERE token_hash = $1", [
        tokenHash,
      ]),
      1,
    );
    const principal = await store.findContributorByTokenHash(tokenHash);
    assert.ok(principal);
    assert.equal(principal.publicId, "ack-loss-grant");
    await store.checkReady();

    loseGrant = true;
    const posted = await json(baseUrl, "/v1/contributor-tokens", {
      method: "POST",
      token: OWNER_TOKEN,
      body: JSON.stringify({ contributorPublicId: "ack-loss-http-grant", provenance: TEST_PROVENANCE }),
    });
    assert.equal(posted.status, 503, JSON.stringify(posted.body));
    assert.equal((posted.body as { error: { code: string } }).error.code, "unavailable");
    assert.equal(await countRows(schema, "SELECT count(*)::int AS n FROM earned_work_contributor_tokens"), 2);
    await store.checkReady();
    const health = await json(baseUrl, "/healthz");
    assert.equal(health.status, 200);
    assert.equal(
      await countRows(schema, "SELECT count(*)::int AS n FROM earned_work_contributor_tokens"),
      2,
      "E07 recovery is read/reconnect, not a second unfenced grant POST",
    );
  } finally {
    await closeServer(server);
    await store.close();
    await dropSchema(schema);
  }
});
