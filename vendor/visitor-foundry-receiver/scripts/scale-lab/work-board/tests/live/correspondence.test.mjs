/**
 * Live work-board create/update/observe against Postgres-backed correspondence.
 * Not included in the default unit glob. Requires DATABASE_URL.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createIdempotencyKey } from "../../../../../scripts/correspondence/client.mjs";
import { startCorrespondenceFixture } from "../../../../../scripts/start-correspondence-fixture.mjs";
import { runWorkBoardJourney } from "../../src/index.mjs";

const DATABASE_URL =
  process.env.CORRESPONDENCE_TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgres://neo_s35:neo_s35_disposable_only@127.0.0.1:55432/neo_s35_correspondence";
const ADMIN = process.env.CORRESPONDENCE_ADMIN_TOKEN || "n12-s35-work-board-admin-token";

function assertSafeId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`refusing to interpolate id: ${id}`);
  }
  return id;
}

function pgScalar(sql) {
  return execFileSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

let fixture;

test("setup postgres correspondence fixture", async () => {
  fixture = await startCorrespondenceFixture({
    databaseUrl: DATABASE_URL,
    adminToken: ADMIN,
  });
  assert.equal(fixture.health.ok, true);
  assert.equal(fixture.health.store, "postgres");
});

test("create/update/observe posts board events and reads them back over HTTP+PG", async () => {
  const result = await runWorkBoardJourney({
    baseUrl: fixture.origin,
    adminToken: fixture.adminToken,
    bootstrapIdempotencyKey: createIdempotencyKey(),
    job: { id: "job_n12_live_http", idempotencyKey: "n12-live-create" },
  });

  assert.equal(result.boardMode, "local-demo");
  assert.equal(result.correspondenceBound, true);
  assert.equal(result.hostedApi, false);
  assert.equal(result.jobStatus, "corrected");
  assert.ok(result.projectId);
  assert.deepEqual(result.localEventKinds, ["request", "request", "artifact", "correction"]);
  assert.deepEqual(result.serviceEventKinds, ["request", "request", "artifact", "correction"]);
  assert.equal(result.serviceEventIds.length, 4);
  assert.equal(result.replayedSameId, true);
  assert.equal(result.observedCount, 4);
  assert.equal("ownerToken" in result, false);
  assert.equal("token" in result, false);

  const projectId = assertSafeId(result.projectId);
  const pgCount = Number(
    pgScalar(`select count(*) from correspondence_events where project_id = '${projectId}'`),
  );
  assert.equal(pgCount, 4);
  const kinds = pgScalar(
    `select string_agg(kind, ',' order by sequence) from correspondence_events where project_id = '${projectId}'`,
  );
  assert.equal(kinds, "request,request,artifact,correction");
  const title = pgScalar(`select title from correspondence_projects where id = '${projectId}'`);
  assert.match(title, /DEMONSTRATION/);
});

test("teardown fixture", async () => {
  if (fixture) await fixture.stop();
});
