// Runs this site's demand adapter against a throwaway PostgreSQL built from the real migration, read
// through the pinned kit's read-only reader: node --test scripts/release/demand-adapter.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const kit = execFileSync(process.execPath, [join(root, "scripts/release/kit.mjs"), "path"], { encoding: "utf8" }).trim().split("\n").at(-1);
const { sqlReader, between, dayWindow } = await import(pathToFileURL(join(kit, "demand.mjs")).href);
process.env.DEMAND_DATABASE_SCHEMA = "care";
const [U1, U2, U3, U4] = ["1", "2", "3", "4"].map((n) => [n.repeat(8), n.repeat(4), "4" + n.repeat(3), "8" + n.repeat(3), n.repeat(12)].join("-"));
const QA_ORDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MIGRATION = "supabase/migrations/0014_commerce_journey.sql";
const SETUP = (create) => "create schema care;\n" + create.replace(/public\./g, "care.") + `
  insert into care.journey_events (event_key,brand,event,session_id,test,order_id,is_agent,referrer,utm,created_at) values
  ('k1','samedaydesk','visit','${U1}',false,null,false,'https://www.google.com','{}','2026-11-21T03:00Z'),
  ('k2','samedaydesk','visit','${U2}',false,null,true,null,'{"source":"chatgpt.com"}','2026-11-21T04:00Z'),
  ('k3','samedaydesk','checkout_started','${U1}',false,'order-live',false,null,'{}','2026-11-21T05:00Z'),
  ('k4','samedaydesk','visit','${U3}',true,null,false,null,'{}','2026-11-21T06:00Z'),
  ('k5','samedaydesk','checkout_started','${U3}',true,'${QA_ORDER}',false,null,'{}','2026-11-21T06:01Z'),
  ('k6','samedaydesk','visit','${U4}',false,null,false,null,'{}','2026-11-22T00:00Z');`;
const OWN_SESSION = { metadata: { sds_care_order: "o1", journey_session: U1 }, success_url: "https://samedaydesk.com/care" };
const OWN_JOURNEY = U1;
const adapter = await import(pathToFileURL(join(root, "scripts/release/demand-adapter.mjs")).href);

test("the adapter reads one day's live journey rows and marks QA", (t) => {
  const bin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
  const dir = mkdtempSync(join(tmpdir(), "demand-adapter-")), port = String(57000 + Math.floor(Math.random() * 1000));
  execFileSync(join(bin, "initdb"), ["-A", "trust", "-D", join(dir, "data")], { stdio: "ignore" });
  execFileSync(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-l", join(dir, "log"), "-o", `-F -p ${port} -k ${dir} -c listen_addresses=''`, "-w", "start"], { stdio: "ignore" });
  t.after(() => { execFileSync(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-m", "fast", "-w", "stop"], { stdio: "ignore" }); rmSync(dir, { recursive: true, force: true }); });
  const admin = (sql) => execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", port, "postgres"], { input: sql });
  const create = readFileSync(join(root, MIGRATION), "utf8").match(/create table if not exists [^;]+;/is)[0];
  admin(SETUP(create));
  admin("alter table care.journey_events add column traffic jsonb;");
  const url = `postgresql://${userInfo().username}@localhost/postgres?host=${encodeURIComponent(dir)}&port=${port}`;
  const window = dayWindow("2026-11-21");
  const journey = adapter.readJourney({ ...window, sql: sqlReader({ PATH: process.env.PATH, DEMAND_DATABASE_URL: url }), between: (c) => between(c, window) });
  assert.deepEqual(journey.visits.map((v) => [v.session, v.agent, v.referrer, v.utm]), [
    ["11111111-1111-4111-8111-111111111111", false, "https://www.google.com", {}],
    ["22222222-2222-4222-8222-222222222222", true, null, { source: "chatgpt.com" }],
  ]);
  assert.equal(journey.checkouts, 1);
  assert.deepEqual(journey.traffic.counts, {people:0,agents:0,scanners:0,own:1,unknown:2});
  assert.ok(journey.qaSessions.has("33333333-3333-4333-8333-333333333333"));
  assert.ok(journey.qaSessions.has(QA_ORDER));
  assert.equal(journey.qaSessions.has("11111111-1111-4111-8111-111111111111"), false);
});

test("Stripe sessions are matched to this site and its journey", () => {
  assert.equal(adapter.ownsSession(OWN_SESSION), true);
  assert.equal(adapter.ownsSession({ metadata: {}, success_url: "https://example.com/x" }), false);
  assert.equal(adapter.journeySession(OWN_SESSION), OWN_JOURNEY);
});
