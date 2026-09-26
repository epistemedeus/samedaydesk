import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createIdempotencyKey, WorkbenchSession } from "../../../../scripts/correspondence/index.mjs";
import { startCorrespondenceFixture } from "../../../../scripts/start-correspondence-fixture.mjs";
import { connectSharedWorkspace } from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const distIndex = join(root, "services/correspondence/dist/index.js");

async function startOnPort(opts, attempts = 15) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await startCorrespondenceFixture(opts);
    } catch (error) {
      last = error;
      await sleep(150);
    }
  }
  throw last;
}

test("process restart + reload resume uses Postgres, not a shared browser store", async (t) => {
  const databaseUrl = process.env.CORRESPONDENCE_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip("requires explicit disposable Postgres CORRESPONDENCE_TEST_DATABASE_URL");
    return;
  }
  if (!existsSync(distIndex)) {
    throw new Error("services/correspondence/dist/index.js missing; run npm run build in that package first");
  }

  const adminToken = process.env.CORRESPONDENCE_ADMIN_TOKEN || "s20-test-admin-token-please-change-now";
  const first = await startCorrespondenceFixture({ databaseUrl, adminToken });
  const origin = first.origin;
  const port = first.port;
  const createKey = createIdempotencyKey();
  let projectId;
  let ownerToken;
  let checkpoint;
  let briefId;
  let cursorAfterBrief;

  try {
    assert.equal(first.health.store, "postgres");
    const owner = await connectSharedWorkspace({
      baseUrl: origin,
      adminToken,
      title: "N17 shared restart",
      summary: "Process restart then fresh client reload.",
      bootstrapIdempotencyKey: createKey,
    });
    projectId = owner.projectId;
    ownerToken = owner.token;
    const brief = await owner.createTaskBrief({
      title: "Restart brief",
      brief: "Must survive SIGTERM.",
      fundingClass: "demonstration",
      idempotencyKey: createIdempotencyKey(),
    });
    briefId = brief.event.id;
    const page = await owner.listChanges({ after: null, limit: 10 });
    cursorAfterBrief = page.nextCursor;
    assert.ok(cursorAfterBrief);

    const session = new WorkbenchSession();
    assert.equal((await session.connect({ token: ownerToken, projectId, baseUrl: origin })).ok, true);
    checkpoint = session.exportCheckpoint();
    const reply = await session.submit({ kind: "reply", text: "peer note before restart" });
    assert.equal(reply.ok, true);
    session.disconnect();
    owner.dispose();
  } finally {
    await first.stop();
  }

  const reloadedHeap = new WorkbenchSession();
  assert.equal(reloadedHeap.view().events.length, 0, "a new page heap has no events until HTTP reload");

  const second = await startOnPort({ databaseUrl, adminToken, port });
  try {
    assert.equal(second.origin, origin);
    assert.equal(second.health.store, "postgres");

    const owner = await connectSharedWorkspace({
      baseUrl: origin,
      token: ownerToken,
      projectId,
    });
    const exported = await owner.exportAll();
    assert.equal(exported.mode, "shared");
    assert.ok(exported.events.some((event) => event.id === briefId));
    assert.ok(exported.events.some((event) => event.kind === "reply"));

    const correction = await owner.correctEvidence({
      correctsEventId: briefId,
      statement: "correction after process restart",
      idempotencyKey: createIdempotencyKey(),
    });
    assert.equal(correction.event.kind, "correction");

    const resumed = await owner.listChanges({ after: cursorAfterBrief, limit: 25 });
    assert.ok(resumed.events.some((event) => event.kind === "reply"));
    assert.ok(resumed.events.some((event) => event.kind === "correction"));

    const session = new WorkbenchSession();
    assert.equal((await session.connect({ token: ownerToken, projectId, baseUrl: origin })).ok, true);
    assert.ok(session.view().events.some((event) => event.id === briefId));
    const fromCheckpoint = await session.resume(checkpoint);
    assert.equal(fromCheckpoint.ok, true);
    assert.ok(session.view().events.some((event) => event.kind === "correction"));
    session.disconnect();
    owner.dispose();
  } finally {
    await second.stop();
  }
});

test("shared-task UI keeps cursor in process memory, not localStorage", () => {
  const ui = readFileSync(join(root, "scripts/shared-task-ui.js"), "utf8");
  assert.match(ui, /let cursor = null/);
  assert.doesNotMatch(ui, /localStorage/);
  assert.doesNotMatch(ui, /sessionStorage/);
});
