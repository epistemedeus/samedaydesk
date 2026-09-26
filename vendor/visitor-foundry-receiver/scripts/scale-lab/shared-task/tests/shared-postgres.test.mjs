import assert from "node:assert/strict";
import test from "node:test";
import { createIdempotencyKey } from "../../../../scripts/correspondence/client.mjs";
import { startCorrespondenceFixture } from "../../../../scripts/start-correspondence-fixture.mjs";
import { connectSharedWorkspace } from "../src/index.mjs";

let fixture;

test("setup postgres correspondence fixture", async () => {
  fixture = await startCorrespondenceFixture();
  assert.equal(fixture.health.ok, true);
  assert.equal(fixture.health.store, "postgres");
});

test("two independent clients complete brief → propose → accept → correct → resume", async () => {
  const owner = await connectSharedWorkspace({
    baseUrl: fixture.origin,
    adminToken: fixture.adminToken,
    title: "S20 dual-client journey",
    summary: "Postgres-backed shared task",
    bootstrapIdempotencyKey: createIdempotencyKey(),
  });

  const brief = await owner.createTaskBrief({
    title: "DEMONSTRATION brief",
    brief: "Bounded docs note. Unfunded.",
    fundingClass: "demonstration",
    idempotencyKey: createIdempotencyKey(),
  });
  assert.equal(brief.mode, "shared");
  assert.equal(brief.event.kind, "request");

  const grant = await owner.createWriterGrant();
  const writer = owner.asPeer({ peerToken: grant.token });

  const key = createIdempotencyKey();
  const proposal = await writer.proposeArtifact({
    summary: "Writer proposal",
    artifactUrl: "https://example.invalid/demo/s20-unhosted-receipt.json",
    artifactLabel: "receipt",
    idempotencyKey: key,
  });
  assert.equal(proposal.event.kind, "artifact");

  const replay = await writer.proposeArtifact({
    summary: "Writer proposal",
    artifactUrl: "https://example.invalid/demo/s20-unhosted-receipt.json",
    artifactLabel: "receipt",
    idempotencyKey: key,
  });
  assert.equal(replay.event.id, proposal.event.id);
  assert.equal(replay.replayed, true);

  const accept = await owner.acceptArtifact({
    proposalEventId: proposal.event.id,
    idempotencyKey: createIdempotencyKey(),
  });
  assert.equal(accept.event.kind, "reply");

  const correction = await writer.correctEvidence({
    correctsEventId: proposal.event.id,
    statement: "Correction retained as data.",
    idempotencyKey: createIdempotencyKey(),
  });
  assert.equal(correction.event.kind, "correction");

  const page1 = await owner.listChanges({ after: null, limit: 2 });
  assert.equal(page1.events.length, 2);
  assert.ok(page1.nextCursor);

  const page2 = await writer.listChanges({ after: page1.nextCursor, limit: 10 });
  assert.ok(page2.events.length >= 2);
  assert.ok(page2.events.every((e) => e.projectId === owner.projectId));

  const exported = await owner.exportAll();
  assert.equal(exported.mode, "shared");
  assert.ok(exported.events.length >= 4);

  owner.dispose();
  writer.dispose();
});

test("cursor scope isolation rejects foreign project cursor", async () => {
  const a = await connectSharedWorkspace({
    baseUrl: fixture.origin,
    adminToken: fixture.adminToken,
    title: "Project A",
    summary: "isolation A",
    bootstrapIdempotencyKey: createIdempotencyKey(),
  });
  await a.createTaskBrief({
    title: "A brief",
    brief: "a",
    idempotencyKey: createIdempotencyKey(),
  });
  const page = await a.listChanges({ limit: 1 });
  const foreignCursor = page.nextCursor;
  assert.ok(foreignCursor);

  const b = await connectSharedWorkspace({
    baseUrl: fixture.origin,
    adminToken: fixture.adminToken,
    title: "Project B",
    summary: "isolation B",
    bootstrapIdempotencyKey: createIdempotencyKey(),
  });
  await assert.rejects(() => b.listChanges({ after: foreignCursor }), (error) => {
    return error.code === "invalid_cursor" || /invalid_cursor|cursor/i.test(String(error.message));
  });

  a.dispose();
  b.dispose();
});

test("foreign workspace token cannot bind, observe, or mutate another project", async () => {
  const a = await connectSharedWorkspace({
    baseUrl: fixture.origin,
    adminToken: fixture.adminToken,
    title: "Workspace A",
    summary: "tenant A isolation",
    bootstrapIdempotencyKey: createIdempotencyKey(),
  });
  const briefA = await a.createTaskBrief({
    title: "A secret brief",
    brief: "tenant-A-only",
    idempotencyKey: createIdempotencyKey(),
  });

  const b = await connectSharedWorkspace({
    baseUrl: fixture.origin,
    adminToken: fixture.adminToken,
    title: "Workspace B",
    summary: "tenant B isolation",
    bootstrapIdempotencyKey: createIdempotencyKey(),
  });
  await b.createTaskBrief({
    title: "B brief",
    brief: "tenant-B-only",
    idempotencyKey: createIdempotencyKey(),
  });

  await assert.rejects(
    () =>
      connectSharedWorkspace({
        baseUrl: fixture.origin,
        token: a.token,
        projectId: b.projectId,
      }),
    (error) =>
      error.status === 404 ||
      error.code === "not_found" ||
      /not found|not accessible/i.test(String(error.message)),
  );

  const rebound = b.asPeer({ peerToken: a.token });
  await assert.rejects(
    () => rebound.listChanges(),
    (error) =>
      error.status === 404 ||
      error.code === "not_found" ||
      /not found|not accessible/i.test(String(error.message)),
  );
  await assert.rejects(
    () =>
      rebound.createTaskBrief({
        title: "cross write",
        brief: "must deny",
        idempotencyKey: createIdempotencyKey(),
      }),
    (error) =>
      error.status === 404 ||
      error.code === "not_found" ||
      /not found|not accessible/i.test(String(error.message)),
  );

  const pageB = await b.listChanges({ limit: 10 });
  assert.equal(
    pageB.events.some((event) => event.id === briefA.event.id),
    false,
  );
  assert.ok(pageB.events.every((event) => event.projectId === b.projectId));

  a.dispose();
  b.dispose();
  rebound.dispose();
});

test("authorization enforced server-side for reader writes", async () => {
  const owner = await connectSharedWorkspace({
    baseUrl: fixture.origin,
    adminToken: fixture.adminToken,
    title: "Auth project",
    summary: "reader cannot write",
    bootstrapIdempotencyKey: createIdempotencyKey(),
  });
  const readerGrant = await owner.createReaderGrant();
  const reader = owner.asPeer({ peerToken: readerGrant.token });
  await assert.rejects(
    () =>
      reader.proposeArtifact({
        summary: "nope",
        artifactUrl: "https://example.invalid/demo/s20-unhosted-receipt.json",
        idempotencyKey: createIdempotencyKey(),
      }),
    (error) => error.code === "forbidden" || error.code === "unauthorized" || /forbidden|scope/i.test(error.message),
  );
  owner.dispose();
  reader.dispose();
});

test("idempotency conflict on same key different body", async () => {
  const owner = await connectSharedWorkspace({
    baseUrl: fixture.origin,
    adminToken: fixture.adminToken,
    title: "Idempotency project",
    summary: "conflict",
    bootstrapIdempotencyKey: createIdempotencyKey(),
  });
  const key = createIdempotencyKey();
  await owner.createTaskBrief({
    title: "one",
    brief: "first",
    idempotencyKey: key,
  });
  await assert.rejects(
    () => owner.createTaskBrief({ title: "two", brief: "different body", idempotencyKey: key }),
    (error) => error.code === "idempotency_conflict" || /idempotency/i.test(error.message),
  );
  owner.dispose();
});

test("teardown fixture", async () => {
  await fixture.stop();
});
