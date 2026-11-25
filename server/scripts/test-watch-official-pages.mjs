import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { fetchPublicBounded, setTransportForTests } from "../lib/agent-readiness/bounded-fetch.js";
import { careDatabaseOptions, careTable } from "../lib/care-database.js";
import { drainCareMail } from "../lib/care-mail.js";
import { openCareStore } from "../lib/care-store.js";
import { officialPages, officialWatch, readOfficialPage, runOfficialWatch } from "../lib/watch-official-pages.js";
import { runConfiguredSkillWatchTick } from "./skill-watch-tick.mjs";

const target = "irs-ss4";
const page = (amount) => `<main><h1>About Form SS-4</h1><p>The form instructions describe how to apply for an employer identification number. Fixture cost ${amount}.</p></main>`;
const reply = (url, body, extra = {}) => ({
  ok: true, status: 200, contentType: "text/html; charset=utf-8", finalUrl: url.href, body, redirects: [], oversize: false, ...extra,
});
const read = (amount) => (id) => readOfficialPage(id, { exchange: async url => reply(url, page(amount)) });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hasPg = process.env.SDS_PRIVATE_PREVIEW === "1" && Boolean(process.env.SDS_PREVIEW_MAIL_OUTBOX && process.env.SKILLGUARD_SOURCE);

test("official HTML uses material text, availability labels and PDF links", async () => {
  const frame = (link, hidden) => `<script>${hidden}</script><nav>${hidden}</nav><main>
    <h1>Corporate Fee Schedule</h1><p>See the updated fees and required forms for registering this business entity.</p>
    <a href="${link}">Current schedule</a><img alt="Available"><p hidden>${hidden}</p></main>`;
  const doc = (link, hidden) => readOfficialPage("delaware-fee-index", {
    exchange: async url => reply(url, frame(link, hidden)),
  });
  assert.equal(await doc("/fee-1.pdf", "old"), await doc("/fee-1.pdf", "new"));
  assert.notEqual(await doc("/fee-1.pdf", "old"), await doc("/fee-2.pdf", "old"));
  assert.notEqual(await read(100)(target), await read(200)(target));
  const countries = (country) => readOfficialPage("paypal-locations", { exchange: async url => reply(url,
    `<main>Skeleton</main><div hidden><article id="nd-page"><h1>Country and region codes</h1>
    <p>The REST API uses codes to list available countries for business accounts.</p>
    <table><tr><td>${country}</td></tr></table></article></div>`) });
  assert.notEqual(await countries("ALBANIA"), await countries("ANDORRA"));
});

test("official acquisition rejects private addresses, redirects, challenge, oversize and unrelated content", async t => {
  let requests = 0;
  setTransportForTests(async () => {
    requests++;
    return { status: 302, headers: { location: "https://www.irs.gov/not-approved" } };
  });
  t.after(() => setTransportForTests());
  await assert.rejects(readOfficialPage(target, { lookup: async () => [{ address: "127.0.0.1" }] }), /public address/);
  assert.equal(requests, 0);
  await assert.rejects(readOfficialPage(target, { lookup: async () => [{ address: "8.8.8.8" }] }), /redirect/);
  assert.equal(requests, 1);
  for (const extra of [{ oversize: true }, { status: 403 }, { headers: { "cf-mitigated": "challenge" } }, { body: "<main>Another subject</main>" }]) {
    await assert.rejects(readOfficialPage(target, { exchange: async url => reply(url, page(100), extra) }), /official_.*unavailable/);
  }
  await assert.rejects(readOfficialPage("https://example.test", { exchange: () => assert.fail("arbitrary URL") }), /unknown_official_target/);
});

test("PDF bytes use the same admitted read and its actual byte cap", async t => {
  const bytes = Buffer.from([37, 80, 68, 70, 45, 255, 254, 178]);
  setTransportForTests(async (_url, options) => {
    assert.equal(options.responseBytes, true);
    assert.ok(options.maxBytes <= 2500001);
    return { status: 200, headers: { "content-type": "application/pdf" }, body: bytes };
  });
  t.after(() => setTransportForTests());
  const opts = { lookup: async () => [{ address: "8.8.8.8" }] };
  assert.equal(await readOfficialPage("wyoming-fees", opts), sha(bytes));
  assert.equal(await readOfficialPage("delaware-fees", opts), sha(bytes));
  const result = await fetchPublicBounded(officialPages["wyoming-fees"][1], { ...opts, responseBytes: true, maxBytes: 5 });
  assert.equal(result.oversize, true);
  assert.deepEqual(result.body, bytes.subarray(0, 5));
});

test("an unreceived observation stops without replaying it", async () => {
  let writes = 0;
  const result = await runOfficialWatch({ at: new Date(), read: read(100), watch: {
    officialTargets: async () => [target, "irs-5472"],
    observeOfficialPage: async () => { writes++; throw new Error("fixture lost reply"); },
  } });
  assert.equal(writes, 1);
  assert.deepEqual(result.issues, [target + ":observation_unreceived"]);
});

test("configured native tick baselines, retries after a read failure and delivers one owner alert without becoming a paid period",
  { skip: !hasPg }, async t => {
    const pool = new pg.Pool(careDatabaseOptions(process.env));
    const store = openCareStore();
    t.after(() => Promise.all([pool.end(), store.close()]));
    const orders = careTable("care_orders"), periods = careTable("care_periods"), mail = careTable("care_mail");
    const now = Date.now(), clock = n => new Date(now + n * 10);
    const upstream = {
      get requests() { return 0; },
      read: () => assert.fail("review enrollment entered paid release schedule"),
    };
    const messages = [];
    const previewTransport = { emails: { async send(message) {
      messages.push(message);
      return { data: { id: "fixture-owner-transport" } };
    } } };
    const run = (n, readOfficial) => runConfiguredSkillWatchTick({ at: clock(n), upstream, readOfficial, previewTransport });
    assert.equal((await run(0, () => assert.fail("not yet enrolled"))).official.enrolled, false);
    await pool.query(`insert into ${orders}
      (id,offer,amount_cents,live_mode,checkout_expires_at,checkout_origin,integration_id,state,rail_email,intake)
      values($1,'legacy_skill_watch',1200,false,now(),'https://samedaydesk.com',$2,'review',$3,$4)`,
    [officialWatch.order, officialWatch.tag, officialWatch.recipient, { officialPages: [target] }]);
    await pool.query(`insert into ${periods}(invoice_id,order_id,period_start,period_end,status,report)
      values($1,$2,now()-interval '1 day',now()+interval '1 day','review',$3)`,
    [officialWatch.window, officialWatch.order, { watchSchedule: { previous: true }, releases: { keep: true }, extra: "retained" }]);

    const baseline = await run(1, read(100));
    assert.ok(baseline.ok, JSON.stringify(baseline));
    assert.equal(baseline.official.baseline, 1);
    assert.equal(baseline.mail.accepted, 0);
    const unchanged = await run(2, read(100));
    assert.equal(unchanged.official.unchanged, 1);
    const failed = await run(3, async () => { throw new Error("fixture read failed"); });
    assert.equal(failed.ok, false);
    assert.deepEqual(failed.official.issues, [target + ":read_failed"]);
    const observed = async () => (await pool.query(`select report from ${periods} where invoice_id=$1`, [officialWatch.window])).rows[0].report;
    assert.equal((await observed()).officialPages[target].checkedAt, clock(2).toISOString());
    const overlap = await Promise.all([run(4, read(200)), run(4, read(200))]);
    assert.equal(overlap.reduce((n, result) => n + result.official.changed, 0), 1);
    assert.equal(overlap.reduce((n, result) => n + result.mail.accepted, 0), 1);
    assert.equal((await run(5, read(200))).official.unchanged, 1);
    assert.equal((await run(4, read(100))).official.skipped, 1);
    const saved = await observed();
    assert.deepEqual(saved.watchSchedule, { previous: true });
    assert.deepEqual(saved.releases, { keep: true });
    assert.equal(saved.extra, "retained");
    const rows = (await pool.query(`select details, accepted_at from ${mail} where order_id=$1`, [officialWatch.order])).rows;
    assert.equal(rows.length, 1);
    assert.ok(rows[0].accepted_at);
    assert.equal(rows[0].details.target, target);
    assert.equal(messages.length, 1);
    assert.match(JSON.stringify(messages[0]), /Official source changed: IRS Form SS-4/);
    assert.match(JSON.stringify(messages[0]), /https:\/\/www\.irs\.gov\/forms-pubs\/about-form-ss-4/);
    assert.match(JSON.stringify(messages[0]), /contact@samedaydesk\.com/);
    assert.doesNotMatch(JSON.stringify(messages[0]), /Paid:|Fixture cost/);
    assert.deepEqual((await pool.query(`select state, live_mode, session_id, received_at from ${orders} where id=$1`, [officialWatch.order])).rows[0],
      { state: "review", live_mode: false, session_id: null, received_at: null });

    // Hold a provider-unknown claim, then recover through the existing same-key window.
    await store.watch.observeOfficialPage({ id: target, digest: await read(300)(target), at: clock(6) });
    const keys = [];
    const drain = (at, send) => drainCareMail({
      store: { ...store, nextMail: (_at, kind) => store.nextMail(at, kind) }, kind: "skill_watch_alert",
      from: officialWatch.recipient, send: async (_message, options) => { keys.push(options.idempotencyKey); return send(); },
    });
    assert.equal((await drain(new Date(), async () => { throw new Error("fixture provider reply lost"); })).deferred, 1);
    assert.equal((await drain(new Date(), () => assert.fail("premature replay"))).accepted, 0);
    await pool.query(`update ${orders} set intake='{"officialPages":[]}' where id=$1`, [officialWatch.order]);
    assert.equal((await drain(new Date(now + 6 * 60_000), () => assert.fail("disabled enrollment"))).accepted, 0);
    await pool.query(`update ${orders} set intake=$2 where id=$1`, [officialWatch.order, { officialPages: [target] }]);
    assert.equal((await drain(new Date(now + 6 * 60_000), async () => ({ data: { id: "fixture-original-provider-id" } }))).accepted, 1);
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
  });
