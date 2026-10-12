import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { compareDecimal } from "../src/decimal.js";
import { loadConfig } from "../src/config.js";
import { databaseUrl } from "./helpers.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(path.join(root, "../migrations/001_init.sql"), "utf8");

test("EARNED_WORK_DATABASE_URL is required (disposable Postgres)", () => {
  assert.ok(process.env.EARNED_WORK_DATABASE_URL, "set EARNED_WORK_DATABASE_URL");
  assert.match(databaseUrl(), /^postgres(ql)?:\/\//);
});

test("SQL migration names durable tables, uniqueness, and refuses payment rails", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_tasks/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_terms/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_reservations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_submissions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_verdicts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_obligations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_idempotency/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS earned_work_contributor_tokens/);
  assert.match(migration, /current_terms_version TEXT NOT NULL CHECK \(current_terms_version ~ '\^sha256:\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration, /terms_revision INTEGER NOT NULL CHECK \(terms_revision >= 1\)/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS earned_work_reservations_active_contributor/);
  assert.match(migration, /contributor_token_id TEXT NOT NULL/);
  assert.match(migration, /\(task_id, terms_version, contributor_token_id\)/);
  assert.match(migration, /ordinal INTEGER NOT NULL CHECK \(ordinal >= 1\)/);
  assert.match(migration, /UNIQUE \(reservation_id, ordinal\)/);
  assert.match(migration, /verdict_id TEXT NOT NULL UNIQUE REFERENCES earned_work_verdicts/);
  assert.doesNotMatch(migration, /artifact_digest_sha256, verifier_version\)/);
  assert.match(migration, /payout_state TEXT NOT NULL CHECK \(payout_state = 'owed'\)/);
  assert.match(migration, /correction_max_revisions INTEGER NOT NULL CHECK \(correction_max_revisions >= 0 AND correction_max_revisions <= 1\)/);
  assert.match(migration, /provenance TEXT NOT NULL CHECK \(provenance IN \('test', 'fixture', 'production'\)\)/);
  assert.match(migration, /kind TEXT NOT NULL CHECK \(kind IN \([\s\S]*'discovery'[\s\S]*'claim'[\s\S]*'submit'[\s\S]*'accept'[\s\S]*'pay'[\s\S]*'repeat'/);
  assert.doesNotMatch(migration, /CREATE TABLE[^\n]*transfer/i);
  assert.doesNotMatch(migration, /payment_signature/i);
  assert.doesNotMatch(migration, /CREATE TABLE[^\n]*outbox/i);
  assert.match(migration, /Never fetched or executed|never execute|No payment rails/i);
  assert.match(migration, /evidence_bytes BYTEA/);
  assert.match(migration, /octet_length\(evidence_bytes\) <= 16384/);
});

test("atomic decimal compare never uses IEEE floats", () => {
  assert.equal(compareDecimal("0.10", "0.1"), 0);
  assert.equal(compareDecimal("0.10", "0.05"), 1);
  assert.equal(compareDecimal("0.05", "0.10"), -1);
  assert.equal(compareDecimal("1.00", "1"), 0);
});

test("owner token is hashed at rest in config", () => {
  const cfg = loadConfig({
    EARNED_WORK_OWNER_TOKEN: "dev-owner-token-s275",
    EARNED_WORK_DATABASE_URL: databaseUrl(),
  });
  assert.equal(cfg.ownerTokenHash.length, 64);
  assert.notEqual(cfg.ownerTokenHash, cfg.ownerToken);
  assert.match(cfg.ownerTokenHash, /^[a-f0-9]{64}$/);
  assert.equal(cfg.listenHost, "127.0.0.1");
  assert.equal(cfg.shutdownTimeoutMs, 8000);
});
