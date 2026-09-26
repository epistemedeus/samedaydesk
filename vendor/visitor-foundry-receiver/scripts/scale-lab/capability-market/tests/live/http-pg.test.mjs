import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { CorrespondenceClient, createIdempotencyKey } from "../../../../../scripts/correspondence/client.mjs";
import { startCorrespondenceFixture } from "../../../../../scripts/start-correspondence-fixture.mjs";
import {
  FIXTURE_NOW,
  persistCapabilityJourney,
  runCorrectionJourney,
  runDisclosureJourney,
  runMatchJourney,
} from "../../src/index.mjs";

const correctionFixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/hostile/correction.json"), "utf8"),
);

const databaseUrl = process.env.CORRESPONDENCE_TEST_DATABASE_URL || process.env.DATABASE_URL;
const NOW = Date.parse(FIXTURE_NOW);
const live = Boolean(databaseUrl);

let fixture;
let owner;
let client;

function stamp() {
  return `N13 ${Date.now().toString(36)} ${Math.random().toString(16).slice(2, 8)}`;
}

async function postEvent(body) {
  return client.postEvent({
    projectId: owner.project.id,
    token: owner.ownerToken,
    ...body,
  });
}

if (!live) {
  test("capability HTTP/PG journeys skipped without DATABASE_URL", { skip: true }, () => {});
} else {
  test("setup postgres correspondence fixture for capability journeys", async () => {
    fixture = await startCorrespondenceFixture({
      databaseUrl,
      adminToken: process.env.CORRESPONDENCE_ADMIN_TOKEN || "n13-test-admin-token-please-change-now",
    });
    assert.equal(fixture.health.ok, true);
    assert.equal(fixture.health.store, "postgres");

    client = new CorrespondenceClient({
      baseUrl: fixture.origin,
      fetch: globalThis.fetch,
      token: fixture.adminToken,
    });
    owner = await client.createProject({
      idempotencyKey: createIdempotencyKey(),
      token: fixture.adminToken,
      title: `N13 capability journey ${stamp()}`.slice(0, 120),
      summary: "Disposable S35 capability matching/disclosure journey against Postgres correspondence.",
    });
    assert.ok(owner.project.id);
    assert.ok(owner.ownerToken);
    client = new CorrespondenceClient({
      baseUrl: fixture.origin,
      fetch: globalThis.fetch,
      token: owner.ownerToken,
    });
  });

  test("HTTPS match journey persists request + artifact + delivery reply and reloads from Postgres", async () => {
    const journey = await runDisclosureJourney({
      request: { outcomes: ["public_page_extract"], inputs: { urls: ["https://neomorphic.io/"] } },
      nowMs: NOW,
    });
    assert.equal(journey.selection.capabilityId, "sdd-batch-extract-v0");
    assert.equal(journey.delivery.ok, true);
    assert.match(journey.delivery.evidence.note, /not fetched/i);

    const keys = journey.correspondenceBodies.map(() => createIdempotencyKey());
    const posted = await persistCapabilityJourney({
      bodies: journey.correspondenceBodies,
      keys,
      postEvent,
    });
    assert.equal(posted.length, 3);
    assert.equal(posted[0].event.kind, "request");
    assert.equal(posted[1].event.kind, "artifact");
    assert.equal(posted[1].event.artifact.url, "https://samedaydesk.com/");
    assert.equal(posted[2].event.kind, "reply");
    assert.equal(posted.every((row) => row.replayed === false), true);

    const replay = await persistCapabilityJourney({
      bodies: journey.correspondenceBodies,
      keys,
      postEvent,
    });
    assert.equal(replay[0].event.id, posted[0].event.id);
    assert.equal(replay[0].replayed, true);
    assert.equal(replay[1].event.id, posted[1].event.id);
    assert.equal(replay[1].replayed, true);

    const page = await client.listEvents({
      projectId: owner.project.id,
      token: owner.ownerToken,
      limit: 100,
    });
    const kinds = page.events.map((event) => event.kind);
    assert.ok(kinds.includes("request"));
    assert.ok(kinds.includes("artifact"));
    assert.ok(kinds.includes("reply"));
    const artifact = page.events.find((event) => event.id === posted[1].event.id);
    assert.equal(artifact.artifact.url, "https://samedaydesk.com/");
    assert.doesNotMatch(JSON.stringify(page.events), /Bearer |ownerToken|adminToken/i);
    assert.ok(page.events.every((event) => event.projectId === owner.project.id));
  });

  test("local-only fixture disclosure persists without minting a relative artifact URL", async () => {
    const isolated = await client.createProject({
      idempotencyKey: createIdempotencyKey(),
      token: fixture.adminToken,
      title: `N13 local echo ${stamp()}`.slice(0, 120),
      summary: "Local-only capability disclosure must not invent an HTTPS artifact.",
    });
    const localClient = new CorrespondenceClient({
      baseUrl: fixture.origin,
      fetch: globalThis.fetch,
      token: isolated.ownerToken,
    });
    const journey = await runDisclosureJourney({
      request: { outcomes: ["demo_echo"], inputs: { message: "pg-echo" } },
      nowMs: NOW,
    });
    assert.equal(journey.selection.capabilityId, "fixture-demo-echo");
    assert.ok(journey.correspondenceBodies.every((body) => body.kind !== "artifact"));

    const posted = await persistCapabilityJourney({
      bodies: journey.correspondenceBodies,
      keys: journey.correspondenceBodies.map(() => createIdempotencyKey()),
      postEvent: (body) =>
        localClient.postEvent({
          projectId: isolated.project.id,
          token: isolated.ownerToken,
          ...body,
        }),
    });
    assert.equal(posted[0].event.kind, "request");
    assert.equal(posted[1].event.kind, "reply");
    assert.equal(posted[2].event.kind, "reply");
    assert.equal(posted[1].event.artifact, undefined);

    const page = await localClient.listEvents({
      projectId: isolated.project.id,
      token: isolated.ownerToken,
      limit: 25,
    });
    assert.equal(page.events.length, 3);
    assert.ok(page.events.every((event) => !event.artifact));
    localClient.dispose();
  });

  test("no-result match persists needs_human; correction stays an explicit event", async () => {
    const isolated = await client.createProject({
      idempotencyKey: createIdempotencyKey(),
      token: fixture.adminToken,
      title: `N13 refusal ${stamp()}`.slice(0, 120),
      summary: "Honest no-result and correction disclosure.",
    });
    const localClient = new CorrespondenceClient({
      baseUrl: fixture.origin,
      fetch: globalThis.fetch,
      token: isolated.ownerToken,
    });
    const none = await runMatchJourney({
      request: { outcomes: ["teleportation"] },
      nowMs: NOW,
    });
    assert.equal(none.selection.ok, false);
    const nonePosted = await persistCapabilityJourney({
      bodies: none.correspondenceBodies,
      keys: none.correspondenceBodies.map(() => createIdempotencyKey()),
      postEvent: (body) =>
        localClient.postEvent({
          projectId: isolated.project.id,
          token: isolated.ownerToken,
          ...body,
        }),
    });
    assert.equal(nonePosted[1].event.kind, "needs_human");
    assert.match(nonePosted[1].event.text, /Honest refusal/i);

    const correction = runCorrectionJourney({
      correction: correctionFixture,
      nowMs: NOW,
    });
    const corrected = await persistCapabilityJourney({
      bodies: correction.correspondenceBodies,
      keys: [createIdempotencyKey()],
      postEvent: (body) =>
        localClient.postEvent({
          projectId: isolated.project.id,
          token: isolated.ownerToken,
          ...body,
        }),
    });
    assert.equal(corrected[0].event.kind, "correction");
    assert.match(corrected[0].event.text, /No silent rewrite/i);
    localClient.dispose();
  });

  test("reader grant cannot persist a capability disclosure", async () => {
    const grant = await client.createGrant({
      projectId: owner.project.id,
      token: owner.ownerToken,
      role: "reader",
    });
    const reader = new CorrespondenceClient({
      baseUrl: fixture.origin,
      fetch: globalThis.fetch,
      token: grant.token,
    });
    await assert.rejects(
      () =>
        reader.postEvent({
          projectId: owner.project.id,
          token: grant.token,
          idempotencyKey: createIdempotencyKey(),
          kind: "request",
          text: "reader must not write capability match requests",
        }),
      (error) => error.code === "forbidden" || error.code === "unauthorized" || /forbidden|scope/i.test(error.message),
    );
    reader.dispose();
  });

  test("teardown correspondence fixture", async () => {
    client?.dispose();
    await fixture.stop();
  });
}
