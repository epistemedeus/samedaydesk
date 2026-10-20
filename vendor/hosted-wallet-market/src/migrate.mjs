import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertIdent} from './profile.mjs';
import {OBLIGATION_COLUMNS, REFUSED_MIGRATION} from './preserve.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export const SERVING_COMMIT = 'e56c4d84f1c59f02307d5aa9a2c330957a28aa6d';
export const INSTALLED_SDS_COMMIT = '6d6c70d73d5e3fc841b9bf90cea390e948b7e4dc';
export const SUCCESSOR_NEO = 'd17323eb4c9873a358d3dafee03c0df0d50e9211';
export const MIGRATION_005 = 'services/earned-work/migrations/005_obligation_settlement_and_retention.sql';

const root = 'vendor/neomorphic-contributor-journey/services/contributor-journey/dist/runtime/services';
export const SERVING_MIGRATIONS = Object.freeze([
  `${root}/earned-work/migrations/001_init.sql`,
  `${root}/earned-work/migrations/002_opportunity_rounds.sql`,
  `${root}/earned-work/migrations/003_opportunity_personal_capacity.sql`,
  `${root}/earned-work/migrations/004_opportunity_funnel_stages.sql`,
  `${root}/contributor-journey/account/migrations/001_accounts.sql`,
]);

export function assertServingPath(file) {
  if (String(file).includes('005_') || String(file).endsWith(REFUSED_MIGRATION)) {
    throw Object.assign(new Error('migration_005_refused'), {codeName: 'migration_005_refused'});
  }
  if (!SERVING_MIGRATIONS.includes(file)) {
    throw Object.assign(new Error('migration_refused'), {codeName: 'migration_refused'});
  }
  return file;
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
}

export async function applyServingSchema(client, {repo, commit = SERVING_COMMIT, earnedSchema = 'cj227_earned_work'} = {}) {
  if (!repo) throw Object.assign(new Error('migration_source_required'), {codeName: 'migration_source_required'});
  const resolved = git(repo, ['rev-parse', `${commit}^{commit}`]).trim();
  if (resolved !== SERVING_COMMIT) {
    throw Object.assign(new Error('serving_commit_refused'), {codeName: 'serving_commit_refused'});
  }
  assertIdent(earnedSchema);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${earnedSchema}`);
  await client.query(`SET search_path TO ${earnedSchema}`);
  for (const file of SERVING_MIGRATIONS) {
    assertServingPath(file);
    const sql = git(repo, ['show', `${SERVING_COMMIT}:${file}`]);
    if (sql.includes('capture_evidence') || sql.includes(REFUSED_MIGRATION)) {
      throw Object.assign(new Error('migration_005_refused'), {codeName: 'migration_005_refused'});
    }
    await client.query(sql);
  }
  return assertEarnedWorkShape(client, {earnedSchema});
}

export async function assertEarnedWorkShape(client, {earnedSchema = 'cj227_earned_work'} = {}) {
  assertIdent(earnedSchema);
  const columns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'earned_work_obligations'
     ORDER BY ordinal_position`,
    [earnedSchema],
  );
  const names = columns.rows.map(row => row.column_name);
  const migration005Applied = names.includes('capture_evidence');
  const expected = migration005Applied ? [...OBLIGATION_COLUMNS, 'capture_evidence'] : [...OBLIGATION_COLUMNS];
  const match = names.length === expected.length && names.every((name, index) => name === expected[index]);
  if (!match) throw Object.assign(new Error('obligation_columns_refused'), {codeName: 'obligation_columns_refused'});
  return {obligationColumns: names, obligationColumnsMatch: true, migration005Applied};
}

/**
 * Applies successor neo migration 005 only on a disposable loopback database.
 * A live database URL is refused before any SQL is read into the session.
 */
export async function applyMigration005Disposable(client, {
  repo,
  databaseUrl,
  confirm,
  earnedSchema = 'cj227_earned_work',
} = {}) {
  if (confirm !== 'disposable-database-only') {
    throw Object.assign(new Error('migration_005_live_refused'), {codeName: 'migration_005_live_refused'});
  }
  let url;
  try { url = new URL(databaseUrl); }
  catch {
    throw Object.assign(new Error('migration_005_live_refused'), {codeName: 'migration_005_live_refused'});
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (url.hostname !== '127.0.0.1' || !/^ae14_b_j1_[a-f0-9]+$/.test(name)) {
    throw Object.assign(new Error('migration_005_live_refused'), {codeName: 'migration_005_live_refused'});
  }
  if (!repo) throw Object.assign(new Error('migration_source_required'), {codeName: 'migration_source_required'});
  const resolved = git(repo, ['rev-parse', `${SUCCESSOR_NEO}^{commit}`]).trim();
  if (resolved !== SUCCESSOR_NEO) {
    throw Object.assign(new Error('neo_commit_refused'), {codeName: 'neo_commit_refused'});
  }
  assertIdent(earnedSchema);
  const sql = git(repo, ['show', `${SUCCESSOR_NEO}:${MIGRATION_005}`]);
  await client.query(`SET search_path TO ${earnedSchema}`);
  await client.query(sql);
  return assertEarnedWorkShape(client, {earnedSchema});
}

export async function assertNativeSchemaShape(client) {
  const fields = await client.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='hosted_wallet_market' AND table_name IN ('consumer_enrollment','native_debt_dispositions')`);
  const required={consumer_enrollment:['host_source_sha256','earned_schema','rpc_endpoint_sha256','registry_sha256','profile_sha256'],
    native_debt_dispositions:['obligation_family','claim_id','submission_id','verdict_id','block_hash','authority_receipt_sha256','request_sha256']};
  for(const [table,names] of Object.entries(required)){
    const present=fields.rows.filter(row=>row.table_name===table).map(row=>row.column_name);
    if(present.length && names.some(name=>!present.includes(name))) throw Object.assign(new Error('native_schema_incompatible'),{codeName:'native_schema_incompatible'});
  }
}

// Compatibility before additive migration is deliberately weaker than runtime
// readiness. A 006-008 store is a valid migration input, but cannot serve this
// package's native/account-native reads or preservation seals yet.
export async function inspectRuntimeSchema(client, {earnedSchema = 'cj227_earned_work'} = {}) {
  assertIdent(earnedSchema);
  const fields = await client.query(`SELECT table_name,column_name,udt_name FROM information_schema.columns
    WHERE table_schema='hosted_wallet_market' AND table_name IN
      ('consumer_enrollment','native_debt_dispositions','source_binding_anchor','source_binding_succession')`);
  const required = {
    consumer_enrollment: {host_source_sha256:'text',earned_schema:'text',rpc_endpoint_sha256:'text',registry_sha256:'text',profile_sha256:'text'},
    native_debt_dispositions: {proof_kind:'text',reward_asset:'jsonb',fee_evidence:'jsonb',obligation_family:'text',claim_id:'text',submission_id:'text',verdict_id:'text',block_hash:'text',authority_receipt_sha256:'text',request_sha256:'text'},
    source_binding_anchor: {preservation_sha256:'text',principal_id:'text'},
    source_binding_succession: {preservation_sha256:'text',principal_id:'text'},
  };
  const missing = [];
  for (const [table, columns] of Object.entries(required)) for (const [name,type] of Object.entries(columns)) {
    if (!fields.rows.some(row=>row.table_name===table&&row.column_name===name&&row.udt_name===type)) missing.push(`${table}.${name}`);
  }
  const expected = readFileSync(join(here,'../schema/010_account_native_discharge.sql'),'utf8')
    .replaceAll('cj227_earned_work',earnedSchema).split('AS $$')[1].split('$$;')[0].trim();
  const fn = (await client.query(`SELECT p.prosrc, p.proconfig, l.lanname,
      p.prorettype='trigger'::regtype AS returns_trigger,
      EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('hosted_wallet_market.native_debt_dispositions')
        AND t.tgname='native_debt_dispositions_match' AND t.tgfoid=p.oid AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal) AS attached,
      EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('hosted_wallet_market.native_debt_native_effect')
        AND i.indrelid=to_regclass('hosted_wallet_market.native_debt_dispositions') AND i.indisunique AND i.indisvalid) AS native_unique
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=to_regprocedure('hosted_wallet_market.native_debt_matches_obligation()')`)).rows[0];
  if (!fn || fn.prosrc.trim()!==expected || fn.lanname!=='plpgsql' || !fn.returns_trigger ||
      JSON.stringify(fn.proconfig)!==JSON.stringify(['search_path=hosted_wallet_market, pg_temp'])) missing.push('native_debt_matches_obligation@010');
  if (!fn?.attached) missing.push('native_debt_dispositions_match');
  if (!fn?.native_unique) missing.push('native_debt_native_effect');
  return {ready:missing.length===0, requiredAdditiveThrough:'010', missing,
    matchingFunctionSha256:createHash('sha256').update(expected).digest('hex')};
}

export async function assertRuntimeSchema(client, options) {
  const shape = await inspectRuntimeSchema(client,options);
  if (!shape.ready) throw Object.assign(new Error('runtime_schema_unready'), {http:503,codeName:'runtime_schema_unready'});
  return shape;
}
export async function applyAdditiveSchema(client, {earnedSchema = 'cj227_earned_work'} = {}) {
  assertIdent(earnedSchema);
  await assertNativeSchemaShape(client);
  let sql = readFileSync(join(here, '../schema/006_hosted_wallet_market.sql'), 'utf8');
  if (sql.includes(REFUSED_MIGRATION) || /preserved_config|additive_config/.test(sql)) {
    throw Object.assign(new Error('schema_refused'), {codeName: 'schema_refused'});
  }
  sql = sql.replaceAll('cj227_earned_work', earnedSchema);
  await client.query(sql);
  await client.query(readFileSync(join(here, '../schema/007_machine_market.sql'), 'utf8'));
  await client.query(readFileSync(join(here, '../schema/008_source_binding_succession.sql'), 'utf8'));
  await client.query(readFileSync(join(here, '../schema/009_native_coin_discharge.sql'), 'utf8').replaceAll('cj227_earned_work',earnedSchema));
  await client.query(readFileSync(join(here, '../schema/010_account_native_discharge.sql'), 'utf8').replaceAll('cj227_earned_work',earnedSchema));
}

async function legacyTriggerPresent(client, earnedSchema) {
  const trigger = await client.query(
    `SELECT t.tgname FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = 'earned_work_obligations'
       AND t.tgname = 'earned_work_obligations_preserve_legacy' AND NOT t.tgisinternal`,
    [earnedSchema],
  );
  return trigger.rows.length === 1;
}

/**
 * The seal distinguishes an explicit empty copy from a copy that was never done.
 * Every obligation id must be listed, including hosted-capture products.
 * The server does not write the seal. Capture appends the new obligation id.
 */
export async function evaluateObligationGuard(client, {earnedSchema = 'cj227_earned_work'} = {}) {
  assertIdent(earnedSchema);
  const seal = await client.query(
    'SELECT sealed_at FROM hosted_wallet_market_guard.obligation_guard_seal WHERE id IS TRUE',
  );
  if (!seal.rows.length) return {guardSealed: false, guardComplete: false, missingCount: null};
  const missing = await client.query(
    `SELECT o.id
     FROM (SELECT id FROM ${earnedSchema}.earned_work_obligations
       UNION SELECT id FROM ${earnedSchema}.opportunity_obligations) o
     WHERE NOT EXISTS (
       SELECT 1 FROM hosted_wallet_market_guard.preserved_obligation_ids p WHERE p.id = o.id
     )`,
  );
  return {
    guardSealed: true,
    guardComplete: missing.rows.length === 0,
    missingCount: missing.rows.length,
    sealedAt: seal.rows[0].sealed_at,
  };
}

export async function assertObligationGuard(client, options) {
  const guard = await evaluateObligationGuard(client, options);
  if (!guard.guardSealed) throw Object.assign(new Error('guard_unsealed'), {codeName: 'guard_unsealed'});
  if (!guard.guardComplete) throw Object.assign(new Error('guard_incomplete'), {codeName: 'guard_incomplete'});
  return guard;
}

async function keptRowCounts(client, earnedSchema) {
  const obligations = await client.query(`SELECT count(*)::int AS n FROM ${earnedSchema}.earned_work_obligations`);
  const accounts = await client.query(`SELECT count(*)::int AS n FROM ${earnedSchema}.journey_accounts`);
  const tasks = await client.query(`SELECT count(*)::int AS n FROM ${earnedSchema}.earned_work_tasks`);
  return {
    obligations: obligations.rows[0].n,
    accounts: accounts.rows[0].n,
    tasks: tasks.rows[0].n,
  };
}

/**
 * Production rollback keeps the adapter schema. Disabling the process is
 * operational. This check refuses to continue when a durable table is missing
 * or when an earned_work or journey_accounts count changes.
 */
export async function rollbackAdapter(client, {earnedSchema = 'cj227_earned_work'} = {}) {
  assertIdent(earnedSchema);
  const native=await client.query(`SELECT count(*)::int AS count FROM ${earnedSchema}.opportunity_obligations o JOIN ${earnedSchema}.opportunity_rounds r ON r.id=o.round_id WHERE r.terms_document->'rewardAsset' IS NOT NULL`);
  if(native.rows[0].count>0)throw Object.assign(new Error('native_reward_downgrade_refused'),{codeName:'native_reward_downgrade_refused'});
  const before = await keptRowCounts(client, earnedSchema);
  const durable = await client.query(
    `SELECT to_regclass('hosted_wallet_market.proofs') AS proofs,
            to_regclass('hosted_wallet_market.quotes') AS quotes,
            to_regclass('hosted_wallet_market.funding_intents') AS funding_intents,
            to_regclass('hosted_wallet_market.native_debt_dispositions') AS dispositions,
            to_regclass('hosted_wallet_market.consumer_enrollment') AS enrollment,
            to_regclass('hosted_wallet_market.installation') AS installation,
            to_regclass('hosted_wallet_market_guard.preserved_obligation_ids') AS ids,
            to_regclass('hosted_wallet_market_guard.obligation_guard_seal') AS seal`,
  );
  const row = durable.rows[0] || {};
  if (!row.proofs || !row.quotes || !row.funding_intents || !row.dispositions || !row.enrollment || !row.installation || !row.ids || !row.seal) {
    throw Object.assign(new Error('rollback_refused'), {codeName: 'rollback_refused'});
  }
  const after = await keptRowCounts(client, earnedSchema);
  if (before.obligations !== after.obligations || before.accounts !== after.accounts || before.tasks !== after.tasks) {
    throw Object.assign(new Error('rollback_refused'), {codeName: 'rollback_refused'});
  }
  if (!await legacyTriggerPresent(client, earnedSchema)) {
    throw Object.assign(new Error('guard_missing'), {codeName: 'guard_missing'});
  }
  return {before, after, legacyTrigger: true, adapterSchemaDropped: false, durableRetained: true};
}

/**
 * Explicit disposable teardown. Not the production rollback command.
 * Drops only schema hosted_wallet_market. The guard schema and the legacy trigger stay.
 */
export async function disposeAdapterSchema(client, {earnedSchema = 'cj227_earned_work', disposable = false} = {}) {
  if (disposable !== true) throw Object.assign(new Error('rollback_refused'), {codeName: 'rollback_refused'});
  assertIdent(earnedSchema);
  const before = await keptRowCounts(client, earnedSchema);
  await client.query('DROP SCHEMA IF EXISTS hosted_wallet_market CASCADE');
  const after = await keptRowCounts(client, earnedSchema);
  if (before.obligations !== after.obligations || before.accounts !== after.accounts || before.tasks !== after.tasks) {
    throw Object.assign(new Error('rollback_refused'), {codeName: 'rollback_refused'});
  }
  if (!await legacyTriggerPresent(client, earnedSchema)) {
    throw Object.assign(new Error('guard_missing'), {codeName: 'guard_missing'});
  }
  const guard = await client.query(
    `SELECT to_regclass('hosted_wallet_market_guard.preserved_obligation_ids') AS ids,
            to_regclass('hosted_wallet_market_guard.obligation_guard_seal') AS seal,
            to_regclass('hosted_wallet_market.installation') AS installation`,
  );
  if (!guard.rows[0]?.ids || !guard.rows[0]?.seal || guard.rows[0]?.installation) {
    throw Object.assign(new Error('guard_missing'), {codeName: 'guard_missing'});
  }
  return {before, after, legacyTrigger: true, adapterSchemaDropped: true, disposable: true};
}

export async function inspectInstallation(client, {earnedSchema = 'cj227_earned_work'} = {}) {
  assertIdent(earnedSchema);
  const base = await assertEarnedWorkShape(client, {earnedSchema});
  await assertNativeSchemaShape(client);
  const checks = await client.query(
    `SELECT conname, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype = 'c'`,
    [`${earnedSchema}.earned_work_obligations`],
  );
  const copied = await client.query(
    `SELECT to_regclass('hosted_wallet_market.preserved_config') AS preserved,
            to_regclass('hosted_wallet_market.additive_config') AS additive`,
  );
  let guard = {guardSealed: false, guardComplete: false, missingCount: null};
  try {
    guard = await evaluateObligationGuard(client, {earnedSchema});
  } catch (error) {
    if (error.code !== '42P01') throw error;
  }
  return {
    ...base,
    runtimeSchema: await inspectRuntimeSchema(client,{earnedSchema}),
    payoutChecks: checks.rows,
    legacyTrigger: await legacyTriggerPresent(client, earnedSchema),
    configValuesCopied: copied.rows[0]?.preserved !== null || copied.rows[0]?.additive !== null,
    guardSealed: guard.guardSealed,
    guardComplete: guard.guardComplete,
    guardMissingCount: guard.missingCount,
  };
}
