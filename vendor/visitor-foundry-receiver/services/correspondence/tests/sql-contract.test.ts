import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hashToken, issueToken } from "../src/crypto.js";
import { MemoryStore } from "../src/store/memory.js";
import { createPostgresStore, PostgresStore } from "../src/store/postgres.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(path.join(root, "../migrations/001_init.sql"), "utf8");

test("SQL migration names the required durable tables and constraints", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS correspondence_projects/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS correspondence_grants/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS correspondence_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS correspondence_idempotency/);
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(migration, /UNIQUE \(project_id, sequence\)/);
  assert.match(migration, /PRIMARY KEY \(scope, project_id, key\)/);
  assert.doesNotMatch(migration, /CREATE TABLE[^\n]*outbox/i);
  assert.doesNotMatch(migration, /CREATE TABLE[^\n]*email/i);
  assert.doesNotMatch(migration, /CREATE TABLE[^\n]*callback/i);
});

test("memory store persists across logical restart within process boundary only as volatile state", async () => {
  const store = new MemoryStore();
  const token = issueToken("neo_own");
  const created = await store.createProject({
    title: "Volatile",
    summary: "Memory adapter is test-only",
    ownerTokenHash: hashToken(token),
    ownerTokenPlainForReplay: token,
    idempotencyKey: "mem-1",
    requestHash: "abc",
  });
  assert.equal(created.statusCode, 201);
  const grant = await store.findActiveGrantByTokenHash(hashToken(token));
  assert.ok(grant);
  await store.close();
});

test("postgres store integration when DATABASE_URL is provided", async (t) => {
  const databaseUrl = process.env.CORRESPONDENCE_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip(
      "No disposable Postgres URL. Remaining integration gate: provision an isolated DATABASE_URL and re-run this file.",
    );
    return;
  }

  const store = await createPostgresStore(databaseUrl);
  assert.ok(store instanceof PostgresStore);
  try {
    const token = issueToken("neo_own");
    const created = await store.createProject({
      title: "Persistent project",
      summary: "Postgres restart and resume",
      ownerTokenHash: hashToken(token),
      ownerTokenPlainForReplay: token,
      idempotencyKey: `pg-${Date.now()}`,
      requestHash: `hash-${Date.now()}`,
    });
    assert.equal(created.replayed, false);

    const restarted = new PostgresStore(databaseUrl);
    const project = await restarted.getProject(created.project.id);
    assert.ok(project);
    assert.equal(project.title, "Persistent project");

    const event = await restarted.createEvent({
      projectId: created.project.id,
      kind: "request",
      text: "continue after restart",
      idempotencyKey: `pg-evt-${Date.now()}`,
      requestHash: `evt-${Date.now()}`,
    });
    assert.equal(event.event.sequence, 1);

    const page = await restarted.listEvents({
      projectId: created.project.id,
      afterSequence: 0,
      limit: 10,
    });
    assert.equal(page.events.length, 1);
    await restarted.close();
  } finally {
    await store.close();
  }
});
