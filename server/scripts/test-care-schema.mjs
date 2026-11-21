import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";
import { careEnrollment } from "./care-enrollment.mjs";
import { careDatabaseOptions, careTable, careTables, closeSharedCarePool } from "../lib/care-database.js";
import { openCareStore } from "../lib/care-store.js";

// Real production TLS/parser and restricted login. No Stripe, mail or retained DB calls.
test("production Care schema enrollment and every database consumer respect role/RLS boundaries", { timeout: 60_000 }, async (t) => {
  const cluster = await startDisposablePg();
  let db, store;
  const admin = new pg.Client({ connectionString: cluster.url });
  await admin.connect();
  t.after(async () => {
    await closeSharedCarePool();
    if (db) await db.end();
    if (store) await store.close();
    await admin.end();
    await cluster.stop();
  });
  const data = join(cluster.dir, "pg");
  const key = join(cluster.dir, "tls.key"), cert = join(cluster.dir, "tls.crt");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
    "-keyout", key, "-out", cert], { stdio: "ignore", timeout: 10000 });
  chmodSync(key, 0o600);
  appendFileSync(join(data, "postgresql.conf"), `\nssl=on\nssl_cert_file='${cert}'\nssl_key_file='${key}'\n`);
  writeFileSync(join(data, "pg_hba.conf"), "local all all trust\nhostssl all all 127.0.0.1/32 scram-sha-256\nhostnossl all all 127.0.0.1/32 reject\n");
  const schema = "sds_care_disposable", role = "samedaydesk_care_app";
  const table = (name) => careTable(name, schema);
  await admin.query("create table public.unrelated_secret(value text); insert into public.unrelated_secret values ('unrelated')");
  // Table/view ACLs alone do not confer access without namespace USAGE.
  await admin.query(`create schema acl_hidden;
    revoke all on schema acl_hidden from public;
    create table acl_hidden.unreachable_table(value text);
    create view acl_hidden.unreachable_view as select 1 as value;
    grant select on acl_hidden.unreachable_table, acl_hidden.unreachable_view to public`);
  const inaccessible = (await admin.query(`select c.oid as relation, n.oid as namespace, c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='acl_hidden' and c.relkind in ('r','v')`)).rows;
  assert.equal(inaccessible.length, 2);
  await admin.query("create role anon; create role authenticated; create role service_role bypassrls");
  await admin.query(careEnrollment(schema, role));
  const password = randomBytes(24).toString("hex");
  await admin.query(`alter role ${role} password '${password}'`);
  execFileSync(join(cluster.bin, "pg_ctl"), ["-D", data, "reload"], { stdio: "ignore", timeout: 10000 });
  // Allow a bounded configuration reload interval before the single TLS connection attempt.
  await admin.query("select pg_sleep(0.1)");
  const env = { SDS_CARE_SCHEMA: schema, SDS_CARE_DATABASE_URL: `postgresql://${role}:${password}@127.0.0.1:${cluster.port}/correspondence`,
    SDS_CARE_DATABASE_CA_BASE64: readFileSync(cert).toString("base64") };
  const before = { ...process.env };
  delete process.env.SDS_PRIVATE_PREVIEW;
  Object.assign(process.env, env);
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before); });
  assert.equal(process.env.SDS_PRIVATE_PREVIEW, undefined);
  const options = careDatabaseOptions(env);
  assert.equal(options.ssl.rejectUnauthorized, true);
  db = new pg.Pool(options);
  store = openCareStore(env);
  const roleRow = (await db.query("select current_user,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit from pg_roles where rolname=current_user")).rows[0];
  assert.deepEqual(roleRow, { current_user: role, rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolinherit: false });
  assert.equal((await db.query("select ssl from pg_stat_ssl where pid=pg_backend_pid()")).rows[0].ssl, true);
  for (const relation of inaccessible) {
    const acl = (await db.query(`select has_table_privilege(current_user,$1::oid,'SELECT') as can_select,
      has_table_privilege(current_user,$1::oid,'INSERT,UPDATE,DELETE,TRUNCATE') as can_write,
      has_schema_privilege(current_user,$2::oid,'USAGE') as usage`, [relation.relation, relation.namespace])).rows[0];
    assert.deepEqual(acl, { can_select: true, can_write: false, usage: false });
    await assert.rejects(db.query(`select * from acl_hidden.${relation.relname}`), { code: "42501" });
  }
  console.log("ACL-visible table and view, namespace USAGE false: enrollment passed; actual SELECT refused 42501.");
  await assert.rejects(db.query("select * from public.unrelated_secret"), { code: "42501" });
  await assert.rejects(db.query(`create table "${schema}".forbidden(id int)`), { code: "42501" });
  await assert.rejects(db.query("create table public.forbidden(id int)"), { code: "42501" });
  await assert.rejects(db.query("create schema forbidden"), { code: "42501" });
  await assert.rejects(db.query(`alter table ${table("care_orders")} disable row level security`), { code: "42501" });
  const denied = new pg.Pool({ ...options, ssl: { rejectUnauthorized: true, ca: undefined } });
  await assert.rejects(denied.query("select 1"), /self-signed|certificate/i);
  await denied.end();
  const schemaState = (await admin.query(`select relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) as owner
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and relkind='r'`, [schema])).rows;
  assert.equal(schemaState.length, 8);
  assert.ok(schemaState.every(row => row.relrowsecurity && row.relforcerowsecurity && row.owner !== role));
  assert.equal((await admin.query("select count(*)::int as n from pg_tables where schemaname='public' and tablename=any($1::text[])", [careTables])).rows[0].n, 0);

  for (const browser of ["anon", "authenticated", "service_role"]) {
    const access = (await admin.query("select has_schema_privilege($1,$2,'USAGE') as usage, has_table_privilege($1,$3,'SELECT,INSERT,UPDATE') as dml", [browser, schema, table("care_orders")])).rows[0];
    assert.deepEqual(access, { usage: false, dml: false });
    await assert.rejects(db.query(`set role ${browser}`), { code: "42501" });
  }
  const id = randomUUID();
  await store.reserve({ id, offer: "keep_it_working", cents: 10000, live: true, expires: new Date(Date.now()+3600000), origin: "https://samedaydesk.com", integrationId: "schema-test" });
  await store.bindSession({ id, sessionId: "cs_schema" });
  await store.checkoutPaid({ id, sessionId: "cs_schema", customerId: "cus_schema", paymentId: "pi_schema", subscriptionId: "sub_schema", email: "schema@example.test", at: new Date() });
  assert.equal((await store.order(id)).state, "paid");
  await store.intake(id, { request: "private schema test" });
  await store.paidPeriod(id, "in_schema", { start: new Date(), end: new Date(Date.now()+86400000) });
  await store.refundOrRisk(id, { invoiceId: "in_schema" });
  assert.equal((await db.query(`select status from ${table("care_periods")}`)).rows[0].status, "review");
  assert.equal((await db.query(`select count(*)::int as n from ${table("care_period_holds")}`)).rows[0].n, 1);
  const mail = await store.nextMail();
  await store.acceptMail(mail.mail_key, mail.claim_id, "email_schema");
  assert.ok((await db.query(`select accepted_at from ${table("care_mail")} where mail_key=$1`, [mail.mail_key])).rows[0].accepted_at);
  const { defaultTaskRequestStore } = await import("../lib/task-requests.js");
  const request = await defaultTaskRequestStore().insert({ email: "schema@example.test", website: null, task: "A scoped private schema task" });
  const quote = await store.quotes.reserve(request.id, { amountCents: 12300, scope: "A private schema quote scope", acceptance: "The stated acceptance test passes" }, true);
  await store.quotes.price(quote.id, "price_schema");
  await store.quotes.offer(quote.id, "plink_schema", "https://buy.stripe.com/schema");
  await store.quotes.paid(quote.id, { sessionId: "cs_quote", paymentId: "pi_quote", payer: request.email, at: new Date() });
  assert.equal((await store.quotes.order(quote.id)).payment_intent, "pi_quote");
  assert.equal((await db.query(`select status from ${table("task_requests")} where id=$1`, [request.id])).rows[0].status, "paid");
  const { recordCommerceJourney } = await import("../lib/commerce-journey.js");
  assert.equal(await recordCommerceJourney("payment_verified", { sessionId: id, key: id, orderId: id, live: true }), true);
  assert.equal((await db.query(`select test from ${table("journey_events")}`)).rows[0].test, false);
  const { saveMailEvent } = await import("../lib/mail-events.js");
  await saveMailEvent({ event_id: "evt_schema", email_id: "email_schema", event_type: "email.delivered", test: false });
  await saveMailEvent({ event_id: "evt_schema", email_id: "email_schema", event_type: "email.delivered", test: false });
  assert.deepEqual((await db.query(`select event_id,test from ${table("mail_events")}`)).rows, [{ event_id: "evt_schema", test: false }]);
  for (const name of careTables) {
    await assert.rejects(db.query(`delete from ${table(name)}`), { code: "42501" });
    await assert.rejects(db.query(`truncate ${table(name)}`), { code: "42501" });
  }
  // Permissions alone do not confer access: removing the SELECT policy hides rows.
  await admin.query(`drop policy care_app_select on ${table("task_requests")}`);
  assert.equal((await db.query(`select * from ${table("task_requests")}`)).rowCount, 0);
  await admin.query(`drop policy care_app_insert on ${table("task_requests")}`);
  await assert.rejects(defaultTaskRequestStore().insert({ email: "schema@example.test", task: "RLS must reject this new task" }), { code: "42501" });
  // An accidental PUBLIC grant on an unrelated table prevents future enrollment.
  await admin.query("grant select on public.unrelated_secret to public");
  const effective = (await db.query(`select has_schema_privilege(current_user,'public','USAGE') as usage,
    has_table_privilege(current_user,'public.unrelated_secret','SELECT') as can_select`)).rows[0];
  assert.deepEqual(effective, { usage: true, can_select: true });
  assert.equal((await db.query("select * from public.unrelated_secret")).rows[0].value, "unrelated");
  await assert.rejects(admin.query(careEnrollment("sds_rejected", "sds_rejected_app")), /unrelated relation privileges/);
  await admin.query("rollback");
  assert.equal((await admin.query("select count(*)::int as n from pg_namespace where nspname='sds_rejected'")).rows[0].n, 0);
  console.log("Actually accessible unrelated PUBLIC relation still refuses enrollment and rolls back.");
  console.log("Production TLS, eight private tables, create/read/update, all consumers, RLS enforcement, no unrelated access or schema DDL: passed.");
});
