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

async function enroll(pool, repositories, start, end, { state = "paid", status = "ready", report = null } = {}) {
  const id = randomUUID(), invoice = `fixture-${id}`;
  await pool.query(`insert into ${careTable("care_orders")}
    (id,offer,amount_cents,live_mode,checkout_expires_at,checkout_origin,integration_id,state,rail_email,intake)
    values($1,'legacy_skill_watch',1200,false,now(),'https://samedaydesk.com',$2,$3,'watch-owner@example.test',$4)`,
  [id, id, state, { repositories }]);
  await pool.query(`insert into ${careTable("care_periods")}(invoice_id,order_id,period_start,period_end,status,report) values($1,$2,$3,$4,$5,$6)`,
    [invoice, id, start, end, status, report]);
  return { id, invoice };
}

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
    openReleaseSchedule: async () => {
      const rows = [{ repository: repo, since: new Date("2026-06-23T00:00:00Z") }];
      return async () => rows.shift();
    },
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

test("an unreceived checkpoint stops the tick without replaying the claim or losing confirmed counts", async () => {
  let claims = 0;
  const watch = { openReleaseSchedule: async () => async () => {
    if (++claims === 1) return { repository: repo, since: new Date("2026-06-23T00:00:00Z") };
    throw new Error("fixture checkpoint reply lost");
  } };
  const result = await runSkillWatchTick({ watch, at, upstream: fixture({ change: { releases: [] } }) });
  assert.equal(claims, 2);
  assert.equal(result.claimed, 1);
  assert.equal(result.requests, 1);
  assert.deepEqual(result.issues, ["schedule_claim_unreceived"]);
});

test("scheduled Watch consumes an immutable release, retains period bounds and sends exactly one private alert", { skip: !preview }, async t => {
  assert.ok(process.env.SDS_PREVIEW_MAIL_OUTBOX);
  assert.ok(!process.env.RESEND_API_KEY);
  const pool = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  const store = openCareStore();
  t.after(async () => { await store.close(); await pool.end(); });
  const start = "2026-06-23T00:00:00Z", end = "2026-07-23T00:00:00Z";
  const retained = { checks: [{ review: "retained fixture metadata" }] };
  const owner = await enroll(pool, [repo], start, end, { report: retained });
  const excluded = [
    await enroll(pool, [repo], "2026-05-23T00:00:00Z", start),
    await enroll(pool, [repo], start, end, { state: "refunded", status: "review" }),
    await enroll(pool, [repo], start, end, { status: "review" }),
  ];
  await pool.query(`insert into ${careTable("care_mail")}(mail_key,kind,order_id) values($1,'receipt',$2)`, [`unrelated/${owner.id}`, owner.id]);
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
  const claim = await store.watch.openReleaseSchedule(at);
  const [claimed, ...observed] = await Promise.all([claim(), store.watch.observeRelease(facts), store.watch.observeRelease(facts)]);
  assert.deepEqual(claimed, { repository: repo, since: new Date(start) });
  assert.equal(observed.reduce((count, result) => count + result.alertsQueued, 0), 1);
  assert.deepEqual(await store.watch.observeRelease({ ...facts, commit: "f".repeat(40) }), { observed: 1, alertsQueued: 0 });
  const saved = (await pool.query(`select report from ${careTable("care_periods")} where invoice_id=$1`, [owner.invoice])).rows[0].report;
  assert.deepEqual(saved.checks, retained.checks);
  assert.ok(Number.isFinite(Date.parse(saved.watchSchedule[repo])));
  assert.deepEqual(Object.values(saved.releases).map(entry => entry.commit).sort(), [commit, facts.commit, "f".repeat(40), ...(live ? [actual] : [])].sort());
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
  assert.equal((await pool.query(`select count(*)::int as count from ${careTable("care_periods")} where order_id=any($1) and report is not null`, [excluded.map(row => row.id)])).rows[0].count, 0);
  assert.equal(await (await store.watch.openReleaseSchedule(new Date(end)))(), null);
  const cli = spawnSync(process.execPath, ["server/scripts/skill-watch-tick.mjs"], { encoding: "utf8" });
  assert.equal(cli.status, 0);
  const receipt = JSON.parse(cli.stdout);
  assert.equal(receipt.scan.requests, 0);
  assert.deepEqual(receipt.mail, { accepted: 0, deferred: 0 });
});

const roster = prefix => Array.from({ length: 12 }, (_, index) => `https://github.com/fixture/${prefix}-${String(index).padStart(2, "0")}`);
const upstreamRepo = url => `https://github.com${url.pathname.slice("/repos".length, -"/releases".length)}`;

test("two fresh configured processes reach twelve repos after the first eight return no releases", { skip: !preview }, async t => {
  const pool = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  t.after(() => pool.end());
  const repositories = roster("empty");
  const old = { reviews: { disposition: "retain" }, releases: { old: { repository: repositories[0], commit } } };
  const { invoice } = await enroll(pool, repositories, "2026-08-01", "2026-09-01", { report: old });
  const run = () => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { githubReader, runConfiguredSkillWatchTick } from './server/scripts/skill-watch-tick.mjs';
      const visited = [];
      const repository = ${upstreamRepo.toString()};
      const upstream = githubReader({exchange: async url => {
        visited.push(repository(url));
        return { status: 200, redirects: [], oversize: false, body: '[]' };
      }});
      const tick = await runConfiguredSkillWatchTick({at:new Date('2026-08-02T00:00:00Z'),upstream});
      console.log(JSON.stringify({ tick, visited }));`], { encoding: "utf8", timeout: 10_000 });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  const first = run();
  assert.equal(first.tick.ok, true);
  assert.equal(first.tick.scan.claimed, 8);
  assert.equal(first.tick.scan.published, 0);
  assert.deepEqual(first.visited, repositories.slice(0, 8));
  const second = run();
  assert.equal(second.tick.ok, true);
  assert.equal(second.tick.scan.claimed, 8);
  assert.deepEqual(second.visited.slice(0, 4), repositories.slice(8));
  assert.equal(new Set([...first.visited, ...second.visited]).size, 12);
  const { report } = (await pool.query(`select report from ${careTable("care_periods")} where invoice_id=$1`, [invoice])).rows[0];
  assert.deepEqual(report.releases, old.releases);
  assert.deepEqual(report.reviews, old.reviews);
  assert.deepEqual(Object.keys(report.watchSchedule).sort(), repositories);
  t.diagnostic(JSON.stringify({ fairness: { freshProcesses: 2, firstClaimed: 8, firstPublished: 0, nextPreviouslyUnvisited: 4, totalReached: 12, historyPreserved: true } }));
});

test("failure checkpoints advance only attempted repos, and overlapping ticks retain progress", { skip: !preview, timeout: 15_000 }, async t => {
  const pool = new pg.Pool({ connectionString: process.env.SDS_CARE_DATABASE_URL });
  t.after(() => pool.end());
  const repositories = roster("failure"), unsupported = "https://example.test/fixture";
  const { invoice } = await enroll(pool, [unsupported, ...repositories], "2026-09-01", "2026-10-01");
  const clock = new Date("2026-09-02T00:00:00Z");
  const run = (visited, respond) => runConfiguredSkillWatchTick({at:clock, upstream:githubReader({exchange:async url=>{
    const repository = upstreamRepo(url);
    visited.push(repository);
    return { status: await respond(repository), redirects: [], oversize: false, body: "[]" };
  }})});
  const saved = async () => Object.keys((await pool.query(`select report from ${careTable("care_periods")} where invoice_id=$1`, [invoice])).rows[0].report.watchSchedule).sort();
  const failed = [];
  const first = await run(failed, repo => repo === repositories[0] ? 503 : 429);
  assert.deepEqual(first.scan.issues, ["unsupported_repository", "release_not_received", "upstream_refused_or_limited"]);
  assert.equal(first.scan.claimed, 3);
  assert.deepEqual(failed, repositories.slice(0, 2));
  assert.deepEqual(await saved(), [unsupported, ...repositories.slice(0, 2)]);
  const limited = [];
  const second = await run(limited, () => 429);
  assert.equal(second.scan.claimed, 1);
  assert.deepEqual(limited, repositories.slice(2, 3));
  assert.deepEqual(await saved(), [unsupported, ...repositories.slice(0, 3)]);

  const overlapped = [[], []], firstClaims = [];
  let release;
  const bothStarted = new Promise(resolve => { release = resolve; });
  const outcomes = await Promise.all(overlapped.map(visited => run(visited, async repo => {
    if (visited.length === 1) {
      firstClaims.push(repo);
      if (firstClaims.length === 2) release();
      await bothStarted;
    }
    return 200;
  })));
  assert.equal(new Set(firstClaims).size, 2);
  assert.ok(outcomes.every(result => result.scan.claimed <= 8 && result.mail.accepted === 0));
  assert.deepEqual(await saved(), [unsupported, ...repositories]);
  assert.ok(repositories.slice(3).every(repository => overlapped.flat().includes(repository)));
  t.diagnostic(JSON.stringify({ recovery: { attemptsBeforeRateStop: 3, nextRateStop: 1, overlappingTicks: 2, uniqueFirstClaims: 2, totalReached: 13 } }));
});
