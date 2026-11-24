import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { careTable } from "../lib/care-database.js";
import { openCareStore } from "../lib/care-store.js";
import { drainCareMail } from "../lib/care-mail.js";
import { fetchPublicBounded, setTransportForTests } from "../lib/agent-readiness/bounded-fetch.js";
import { githubReader, runConfiguredSkillWatchTick, runSkillWatchTick } from "./skill-watch-tick.mjs";
import { readPinnedScanner } from "./skill-watch-release.mjs";

const preview = process.env.SDS_PRIVATE_PREVIEW === "1" && Boolean(process.env.SKILLGUARD_SOURCE);
const repo = "https://github.com/epistemedeus/skillguard";
const actual = "14705f72f8daa56f986401554783992a598b0f08";
const at = new Date("2026-06-25T00:00:00Z");
const published = "2026-06-24T03:01:27Z";
const commit = "a".repeat(40), tree = "b".repeat(40);
const blob = Buffer.from("An ordinary documentation fixture.\n");
const sha = createHash("sha1").update(`blob ${blob.length}\0`).update(blob).digest("hex");
const member = { path: "README.md", size: blob.length, sha, mode: "100644", type: "blob" };
const release = { tag_name: "v1", draft: false, published_at: published, target_commitish: commit };

function fixture({ change = {}, fail = false } = {}) {
  return githubReader({ exchange: async (url, options) => {
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(options.maxRedirects, 0);
    const route = url.pathname.split("/").slice(4).join("/");
    const bodies = {
      releases: [release], "git/ref/tags/v1": { ref: "refs/tags/v1", object: { type: "commit", sha: commit } },
      [`git/commits/${commit}`]: { sha: commit, tree: { sha: tree } },
      [`git/trees/${tree}`]: { sha: tree, truncated: false, tree: [member] },
      [`git/blobs/${sha}`]: { sha, size: blob.length, encoding: "base64", content: blob.toString("base64") },
      ...change,
    };
    assert(Object.hasOwn(bodies, route), "unexpected fixture route");
    return { status: fail ? 429 : 200, body: JSON.stringify(bodies[route]), redirects: [], oversize: false };
  } });
}

test("the admitted GitHub transport refuses a redirect and private DNS before any second hop", async t => {
  let calls = 0;
  setTransportForTests(async () => {
    calls++;
    return { status: 302, headers: { location: "http://127.0.0.1/" }, body: "" };
  });
  t.after(() => setTransportForTests());
  const path = "/repos/test/sample/releases";
  await assert.rejects(githubReader({ exchange: fetchPublicBounded, lookup: async () => [{ address: "127.0.0.1" }] }).read(path), /public address/);
  assert.equal(calls, 0);
  await assert.rejects(githubReader({ exchange: fetchPublicBounded, lookup: async () => [{ address: "140.82.114.5" }] }).read(path), /redirect/);
  assert.equal(calls, 1);
  const oversize = githubReader({ exchange: async () => ({ status: 200, oversize: true, redirects: [], body: "[]" }) });
  await assert.rejects(oversize.read(path), /unavailable/);
});

test("a wrong analyzer pointer is refused before acquisition or import", { skip: !preview }, async t => {
  const work = await mkdtemp(join(tmpdir(), "sds-watch-reject-"));
  t.after(() => rm(work, { recursive: true, force: true }));
  const wrong = join(work, "wrong.mjs");
  await writeFile(wrong, 'throw Error("unexpected import");\n', { mode: 0o600 });
  await assert.rejects(readPinnedScanner(wrong), /source differs/);
  const result = spawnSync(process.execPath, ["server/scripts/skill-watch-tick.mjs"], {
    env: { ...process.env, SKILLGUARD_SOURCE: wrong }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), { ok: false, stage: "scanner_pin" });
});

test("unpublished, mismatched tag/commit, non-regular, oversized, truncated and changed blob inputs stay unobserved", { skip: !preview }, async () => {
  const source = await readPinnedScanner(process.env.SKILLGUARD_SOURCE);
  const watch = {
    scheduledRepositories: async () => [{ repository: repo, since: new Date("2026-06-23T00:00:00Z") }],
    needsRelease: async () => true,
    observeRelease: async () => assert.fail("an invalid source reached the store"),
  };
  const run = async upstream => runSkillWatchTick({ watch, source, at, upstream });
  const draft = await run(fixture({ change: { releases: [{ ...release, draft: true }, { ...release, published_at: null }] } }));
  assert.equal(draft.published, 0);
  assert.deepEqual(draft.issues, []);
  for (const change of [
    { "git/ref/tags/v1": { ref: "refs/tags/wrong", object: { type: "commit", sha: commit } } },
    { releases: [{ ...release, target_commitish: "c".repeat(40) }] },
    { [`git/commits/${commit}`]: { sha: "c".repeat(40), tree: { sha: tree } } },
    ...[{ ...member, mode: "120000" }, { ...member, path: "lib/.git/config" }, { ...member, size: 8 * 1024 * 1024 + 1 }]
      .map(item => ({ [`git/trees/${tree}`]: { sha: tree, truncated: false, tree: [item] } })),
    { [`git/trees/${tree}`]: { sha: tree, truncated: true, tree: [] } },
    { [`git/blobs/${sha}`]: { sha, size: blob.length, encoding: "base64", content: Buffer.alloc(blob.length).toString("base64") } },
  ]) assert.deepEqual((await run(fixture({ change }))).issues, ["release_not_received"]);
  const limited = await run(fixture({ fail: true }));
  assert.deepEqual(limited.issues, ["upstream_refused_or_limited"]);
  assert.equal(limited.requests, 1);
});

test("scheduled Watch consumes an immutable release, retains period bounds and sends exactly one private alert", { skip: !preview }, async t => {
  assert.ok(process.env.SDS_PREVIEW_MAIL_OUTBOX);
  assert.ok(!process.env.RESEND_API_KEY);
  const pool = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  const store = openCareStore();
  t.after(async () => { await store.close(); await pool.end(); });
  const rows = [];
  async function enroll(repository, start, end, state = "paid", status = "ready") {
    const id = randomUUID(), invoice = `fixture-${id}`;
    rows.push(id);
    await pool.query(`insert into ${careTable("care_orders")}
      (id,offer,amount_cents,live_mode,checkout_expires_at,checkout_origin,integration_id,state,rail_email,intake)
      values($1,'legacy_skill_watch',1200,false,now(),'https://samedaydesk.com',$2,$3,'watch-owner@example.test',$4)`,
    [id, id, state, { repositories: [repository] }]);
    await pool.query(`insert into ${careTable("care_periods")}(invoice_id,order_id,period_start,period_end,status) values($1,$2,$3,$4,$5)`,
      [invoice, id, start, end, status]);
    return { id, invoice };
  }
  const start = "2026-06-23T00:00:00Z", end = "2026-07-23T00:00:00Z";
  const owner = await enroll(repo, start, end);
  await enroll(repo, "2026-05-23T00:00:00Z", start);
  await enroll(repo, start, end, "refunded", "review");
  await enroll(repo, start, end, "paid", "review");
  await pool.query(`insert into ${careTable("care_mail")}(mail_key,kind,order_id) values($1,'receipt',$2)`, [`unrelated/${owner.id}`, owner.id]);
  const inputs = await store.watch.scheduledRepositories(at, 9);
  assert.deepEqual(inputs, [{ repository: repo, since: new Date(start) }]);
  const live = process.env.SDS_TEST_WATCH_PUBLIC_RELEASE === "1";
  const failure = await runConfiguredSkillWatchTick({ at, upstream: fixture({ fail: true }) });
  assert.equal(failure.ok, false);
  assert.equal(failure.scan.requests, 1);
  assert.equal(failure.mail.accepted, 0);

  if (live) {
    const received = await runConfiguredSkillWatchTick({ at });
    assert.ok(received.ok, JSON.stringify(received));
    assert.equal(received.scan.observed, 1);
    assert.equal(received.scan.alertsQueued, 1);
    assert.deepEqual(received.mail, { accepted: 1, deferred: 0 });
    const next = await runConfiguredSkillWatchTick({ at });
    assert.ok(next.ok, JSON.stringify(next));
    assert.equal(next.scan.scanned, 0);
    assert.equal(next.mail.accepted, 0);
    const sent = (await readFile(process.env.SDS_PREVIEW_MAIL_OUTBOX, "utf8")).trim().split("\n")
      .map(JSON.parse).filter(message => message.subject === "SkillGuard Watch release alert");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "watch-owner@example.test");
    assert.match(sent[0].from, /samedaydesk\.com/);
    assert.ok(sent[0].text.includes(repo) && sent[0].text.includes(actual));
    const stored = (await pool.query(`select * from ${careTable("care_mail")} where order_id=$1 and kind='skill_watch_alert'`, [owner.id])).rows;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].provider_id, "private-outbox");
    assert.ok(stored[0].accepted_at);
    assert.ok(stored[0].details.rules.length > 0 && stored[0].details.rules.every(rule => sent[0].text.includes(rule)));
    const observed = Object.values((await pool.query(`select report from ${careTable("care_periods")} where invoice_id=$1`, [owner.invoice])).rows[0].report.releases);
    assert.equal(observed[0].publishedAt, new Date(published).toISOString());
    assert.deepEqual(observed.map(item => item.commit), [actual]);
    t.diagnostic(JSON.stringify({ realRelease: "v1.3.0", commit: actual, publishedAt: published, scan: received.scan,
      verdict: observed[0].verdict, blobsScanned: observed[0].scanned, newRules: stored[0].details.rules.length, accepted: received.mail.accepted,
      repeat: next.scan, privateSink: true }));
  }

  const concurrent = await Promise.all([fixture(), fixture()].map(upstream => runConfiguredSkillWatchTick({ at, upstream })));
  assert.ok(concurrent.every(result => result.ok));
  assert.equal(concurrent.reduce((count, result) => count + result.scan.observed, 0), 1);
  assert.ok(concurrent.every(result => result.scan.alertsQueued === 0));
  const due = "2026-06-24T23:00:00Z";
  const facts = { repository: repo, commit: "e".repeat(40), publishedAt: due, report: { verdict: "suspicious", scanned: 1, rules: ["fixture new rule"] } };
  const observed = await Promise.all([store.watch.observeRelease(facts), store.watch.observeRelease(facts)]);
  assert.equal(observed.reduce((count, result) => count + result.alertsQueued, 0), 1);
  assert.deepEqual(await store.watch.observeRelease({ ...facts, commit: "f".repeat(40) }), { observed: 1, alertsQueued: 0 });
  const dbMail = async () => (await pool.query(`select * from ${careTable("care_mail")} where order_id=$1 and details->>'commit'=$2`, [owner.id, facts.commit])).rows[0];
  let acceptedKey;
  const send = async (message, { idempotencyKey }) => {
    assert.ok(message.text.includes("fixture new rule"));
    if (!acceptedKey) { acceptedKey = idempotencyKey; throw new Error("fixture provider accepted; reply unknown"); }
    assert.equal(idempotencyKey, acceptedKey);
    return { data: { id: "fixture-same-acceptance" } };
  };
  const deliver = () => drainCareMail({ store, send, limit: 1, kind: "skill_watch_alert", secret: process.env.SDS_CARE_ACCESS_SECRET,
    from: "contact@samedaydesk.com", replyTo: "contact@samedaydesk.com" });
  assert.deepEqual(await deliver(), { accepted: 0, deferred: 1 });
  assert.equal((await dbMail()).accepted_at, null);
  assert.deepEqual(await deliver(), { accepted: 0, deferred: 0 });
  await pool.query(`update ${careTable("care_mail")} set next_attempt_at=now()-interval '1 second' where mail_key=$1`, [(await dbMail()).mail_key]);
  assert.deepEqual(await deliver(), { accepted: 1, deferred: 0 });
  assert.equal((await dbMail()).provider_id, "fixture-same-acceptance");
  const unrelated = (await pool.query(`select * from ${careTable("care_mail")} where mail_key=$1`, [`unrelated/${owner.id}`])).rows[0];
  assert.equal(unrelated.first_attempt_at, null);
  assert.equal((await pool.query(`select count(*)::int as count from ${careTable("care_periods")} where order_id=any($1) and report is not null`, [rows.slice(1)])).rows[0].count, 0);
  assert.deepEqual(await store.watch.scheduledRepositories(new Date(end), 9), []);
  const cli = spawnSync(process.execPath, ["server/scripts/skill-watch-tick.mjs"], { encoding: "utf8" });
  assert.equal(cli.status, 0);
  const receipt = JSON.parse(cli.stdout);
  assert.equal(receipt.scan.requests, 0);
  assert.deepEqual(receipt.mail, { accepted: 0, deferred: 0 });
});
