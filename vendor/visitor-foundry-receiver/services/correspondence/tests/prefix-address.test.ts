import assert from "node:assert/strict";
import test from "node:test";
import { boundedApi, canonicalOperatorOrigin } from "../bin/safe-io.mjs";
import {
  CorrespondenceClient,
  WorkbenchSession,
  identitiesEqual,
  parseCheckpoint,
  serializeCheckpoint,
} from "../../../scripts/correspondence/index.mjs";
import { createSyntheticFixture } from "../../../scripts/correspondence/fixture.mjs";
import { createApp, loadConfig, createPostgresStore, buildStoreFromEnv } from "../src/index.js";

const PREFIX = "https://example.test/api/correspondence";
const NOW = "2026-09-09T12:00:00.000Z";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function projectDoc(id = "prj_prefix") {
  return {
    id,
    title: "Prefixed",
    summary: "Mounted correspondence",
    status: "open",
    version: 1,
    nextAction: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("canonicalOperatorOrigin keeps standalone origin and optional path prefix", () => {
  assert.equal(canonicalOperatorOrigin("https://example.test"), "https://example.test");
  assert.equal(canonicalOperatorOrigin("https://example.test/"), "https://example.test");
  assert.equal(canonicalOperatorOrigin(`${PREFIX}/`), PREFIX);
  assert.equal(canonicalOperatorOrigin(PREFIX), PREFIX);
  assert.equal(
    canonicalOperatorOrigin("http://127.0.0.1:8787/api/correspondence"),
    "http://127.0.0.1:8787/api/correspondence",
  );
  assert.equal(
    canonicalOperatorOrigin("http://localhost:8787/api/correspondence/"),
    "http://localhost:8787/api/correspondence",
  );
  assert.throws(() => canonicalOperatorOrigin("https://user:pass@example.test/api/correspondence"), /canonical origin/);
  assert.throws(() => canonicalOperatorOrigin("https://example.test/api/correspondence?x=1"), /canonical origin/);
  assert.throws(() => canonicalOperatorOrigin("https://example.test/api/correspondence#frag"), /canonical origin/);
  assert.throws(() => canonicalOperatorOrigin("https://example.test/api/foo+bar"), /canonical origin/);
  assert.throws(() => canonicalOperatorOrigin("https://example.test/api//correspondence"), /canonical origin/);
  assert.throws(() => canonicalOperatorOrigin("http://example.test/api/correspondence"), /https:\/\/… or http:\/\/127\.0\.0\.1\|localhost/);
});

test("boundedApi concatenates a path-prefixed baseUrl onto /v1 routes", async () => {
  const seen: string[] = [];
  const result = await boundedApi(PREFIX, "POST", "/v1/projects", {
    body: { title: "t", summary: "s" },
    fetchImpl: async (input: unknown) => {
      seen.push(String(input));
      return jsonResponse({ ok: true }, 201);
    },
  });
  assert.equal(result.status, 201);
  assert.deepEqual(seen, ["https://example.test/api/correspondence/v1/projects"]);
});

test("two clients against a prefixed base URL construct /api/correspondence/v1/... URLs", async () => {
  const writerUrls: string[] = [];
  const readerUrls: string[] = [];
  const writer = new CorrespondenceClient({
    baseUrl: `${PREFIX}/`,
    token: "synthetic_fixture_writer_not_a_grant",
    fetch: async (url: string) => {
      writerUrls.push(String(url));
      return jsonResponse({
        event: {
          id: "ev_1",
          projectId: "prj_prefix",
          sequence: 1,
          kind: "request",
          text: "from writer",
          createdAt: NOW,
        },
        project: projectDoc(),
      }, 201);
    },
  });
  const reader = new CorrespondenceClient({
    baseUrl: PREFIX,
    token: "synthetic_fixture_reader_not_a_grant",
    fetch: async (url: string) => {
      readerUrls.push(String(url));
      return jsonResponse({
        events: [
          {
            id: "ev_1",
            projectId: "prj_prefix",
            sequence: 1,
            kind: "request",
            text: "from writer",
            createdAt: NOW,
          },
        ],
        nextCursor: "cursor-1",
      });
    },
  });
  await writer.postEvent({
    projectId: "prj_prefix",
    kind: "request",
    text: "from writer",
    idempotencyKey: "prefix-writer-key-1",
  });
  await reader.listEvents({ projectId: "prj_prefix" });
  assert.deepEqual(writerUrls, ["https://example.test/api/correspondence/v1/projects/prj_prefix/events"]);
  assert.equal(readerUrls.length, 1);
  assert.match(readerUrls[0]!, /^https:\/\/example\.test\/api\/correspondence\/v1\/projects\/prj_prefix\/events/);
  assert.equal(writer.baseUrl, PREFIX);
  assert.equal(reader.baseUrl, PREFIX);
});

test("checkpoint and workbench keep a prefixed address and refuse origin-only or another path", async () => {
  const fixture = createSyntheticFixture();
  const prefix = `${fixture.origin}/api/correspondence`;
  const fetchImpl = (url: string, init?: RequestInit) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, fixture.origin);
    assert.equal(parsed.pathname.startsWith("/api/correspondence/v1/"), true);
    const stripped = `${fixture.origin}${parsed.pathname.slice("/api/correspondence".length)}${parsed.search}`;
    return fixture.fetch(stripped, init);
  };
  const session = new WorkbenchSession();
  const connected = await session.connect({
    token: fixture.writerToken,
    projectId: fixture.projectId,
    baseUrl: `${prefix}/`,
    fetchImpl,
  });
  assert.equal(connected.ok, true);
  assert.equal(session.view().baseUrl, prefix);

  const checkpoint = session.exportCheckpoint();
  const parsed = parseCheckpoint(checkpoint);
  assert.equal(parsed.baseUrl, prefix);
  assert.notEqual(parsed.baseUrl, fixture.origin);

  const originOnly = serializeCheckpoint({ ...parsed, baseUrl: fixture.origin });
  const originMismatch = await session.resume(originOnly);
  assert.equal(originMismatch.ok, false);
  assert.equal(originMismatch.code, "mismatch");
  assert.equal(session.view().baseUrl, prefix);

  const otherPath = serializeCheckpoint({ ...parsed, baseUrl: `${fixture.origin}/api/other` });
  const pathMismatch = await session.resume(otherPath);
  assert.equal(pathMismatch.ok, false);
  assert.equal(pathMismatch.code, "mismatch");
  assert.equal(session.view().baseUrl, prefix);

  assert.equal(identitiesEqual(session, { projectId: fixture.projectId, baseUrl: fixture.origin }), false);
  assert.equal(identitiesEqual(session, { projectId: fixture.projectId, baseUrl: `${fixture.origin}/api/other` }), false);
  assert.equal(identitiesEqual(session, { projectId: fixture.projectId, baseUrl: prefix }), true);

  const samePrefix = await session.resume(checkpoint);
  assert.equal(samePrefix.ok, true);
  assert.equal(session.view().baseUrl, prefix);
});

test("package entry re-exports SDS mount symbols without listening", () => {
  assert.equal(typeof createApp, "function");
  assert.equal(typeof loadConfig, "function");
  assert.equal(typeof createPostgresStore, "function");
  assert.equal(typeof buildStoreFromEnv, "function");
});
