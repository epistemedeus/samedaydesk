import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { assertLateDischargeSchema } from '../src/migrate.mjs';

const bin = process.env.HOSTED_WALLET_MARKET_TEST_PG_BIN;
const schema = 'cj227_earned_work';
const table = 'hosted_wallet_market.native_debt_dispositions';
const constraint = 'native_debt_acceptance_identity';
const trigger = 'native_debt_dispositions_match_late';
const migration = file => readFileSync(new URL('../schema/' + file,import.meta.url),'utf8');

test('migration 012 readiness requires the exact validated predicate and unconditional insert trigger', {
  skip: !bin && 'set HOSTED_WALLET_MARKET_TEST_PG_BIN to run disposable PostgreSQL',
}, async t => {
  const root = mkdtempSync(path.join(tmpdir(),'sds-late-readiness-'));
  const data = path.join(root,'data');
  const run = (program, ...args) => execFileSync(path.join(bin,program),args,{stdio:'pipe',timeout:20_000});
  let running = false, client;
  t.after(async () => {
    try { await client?.end(); }
    finally {
      try { if (running) run('pg_ctl','-D',data,'-m','fast','-w','stop'); }
      finally { rmSync(root,{recursive:true,force:true}); }
    }
  });
  const portProbe = createServer();
  await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
  const {port} = portProbe.address();
  await new Promise(resolve=>portProbe.close(resolve));
  run('initdb','-D',data,'--auth=trust','--username=fixture','--no-locale','--encoding=UTF8');
  run('pg_ctl','-D',data,'-l',path.join(root,'postgres.log'),'-w','start','-o',
    `-c listen_addresses=127.0.0.1 -c port=${port} -c unix_socket_directories=`);
  running = true;
  client = new pg.Client({host:'127.0.0.1',port,user:'fixture',database:'postgres'});
  await client.connect();

  // Reuse the original table, preservation trigger and rail DDL. The old
  // acceptance trigger's Neo dependencies are covered by the mounted suite.
  const original = migration('006_hosted_wallet_market.sql');
  await client.query('CREATE SCHEMA hosted_wallet_market;'+original.slice(
    original.indexOf('CREATE TABLE IF NOT EXISTS '+table),
    original.indexOf('CREATE OR REPLACE FUNCTION hosted_wallet_market.native_debt_matches_obligation')));
  await client.query(migration('009_native_coin_discharge.sql').split('CREATE OR REPLACE FUNCTION')[0]);
  const hash = 'a'.repeat(64), tx = '0x'+hash, address = '0x'+'2'.repeat(40);
  const legacy = {
    obligation_id:'fixture-old-obligation', obligation_family:'opportunity', tenant:'fixture',
    reservation_id:'fixture-old-reserve', claim_id:'fixture-old-claim', submission_id:'fixture-old-submission',
    verdict_id:'fixture-old-verdict', artifact_digest_sha256:hash, task_id:'fixture:task', terms_version:'sha256:'+hash,
    network:'eip155:8453', token:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', recipient:address,
    transaction_hash:tx, log_index:0, block_number:'1', block_hash:tx, block_timestamp:'2024-01-01T00:00:00Z',
    consumer_contract_sha256:hash, authority_receipt_sha256:hash, request_sha256:hash, amount_atomic:'7',
    receipt_id:hash, received_at:'2024-01-01T00:00:01Z',
    import_contract_sha256:'414ba86df5bfacd2876f38bd62d11781e9c9971cd8219ceec577f85dc0f93063',
    import_state:'bound', disposition:'external_discharge_allocated', kernel_paid:true, kernel_transfer:tx,
    native_paid_observation:true, transfer_initiated:false, payout_state:'owed', observed_source:'0x'+'1'.repeat(40),
    created_at:'2024-01-01T00:00:02Z', proof_kind:'erc20_transfer',
  };
  await client.query(`INSERT INTO ${table} SELECT (jsonb_populate_record(NULL::${table},$1)).*`,[legacy]);
  const row = async () => (await client.query(`SELECT to_jsonb(d) AS row FROM ${table} d`)).rows[0].row;
  const before = await row();
  const late = migration('012_late_native_discharge.sql');
  const ready = () => assertLateDischargeSchema(client,{earnedSchema:schema});
  const refused = () => assert.rejects(ready,{codeName:'runtime_schema_unready'});
  await refused();
  await client.query(late);
  await ready();
  await client.query(late);
  await ready();
  const {acceptance_kind,acceptance_operation_id,acceptance_receipt_sha256,...retained} = await row();
  assert.deepEqual(retained,before);
  assert.deepEqual([acceptance_kind,acceptance_operation_id,acceptance_receipt_sha256],['verdict',null,null]);

  await client.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`);
  await refused();
  await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (TRUE)`);
  await refused();
  await client.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}, ADD CONSTRAINT ${constraint}
    CHECK (acceptance_kind IN ('verdict','late_receipt_v1'))`);
  await refused();
  await client.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`);
  await client.query(late);
  await ready();

  await client.query(`DROP TRIGGER ${trigger} ON ${table}`);
  await refused();
  await client.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table} FOR EACH ROW
    WHEN (FALSE) EXECUTE FUNCTION hosted_wallet_market.native_debt_matches_late_acceptance()`);
  await refused();
  await client.query(late);
  await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  await refused();
  await client.query(late);
  await ready();
  await assert.rejects(client.query(`UPDATE ${table} SET verdict_id='fixture-rewritten'`),/disposition_immutable/);
  assert.deepEqual(await row(),{...before,acceptance_kind:'verdict',acceptance_operation_id:null,acceptance_receipt_sha256:null});
});
