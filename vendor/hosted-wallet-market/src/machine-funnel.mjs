// Read-only counts from the existing account and market records.
// Cohort stays unknown. Discovery rows are listing events, not unique visitors.
import {createHash} from 'node:crypto';
import {assertIdent} from './profile.mjs';

const TENANT = /^[a-z][a-z0-9_-]{2,63}$/;
const ACCOUNT = /^acc_[A-Za-z0-9_-]{16}$/;
const TASK = /^market-[0-9a-f]{64}$/;
const OPERATION = /^[A-Za-z0-9][A-Za-z0-9_.:#-]{7,160}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const refuse = code => { throw Object.assign(new Error(code), {code, codeName: code, http: 409}); };

function ids(value, pattern, code) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64 || value.some(item => typeof item !== 'string' || !pattern.test(item))) refuse(code);
  return [...new Set(value)];
}

function operations(value) {
  const listed = ids(value, OPERATION, 'funnel_exclusion_refused');
  return [...new Set(listed.flatMap(id => [id, `machine-${sha(id)}`]))];
}

/**
 * Operator snapshot. Exclusions are applied in this read and are not stored.
 * paidWork follows existing funding rows. Unfunded mode has none.
 */
export async function unfundedFunnelSnapshot(client, {earnedSchema, tenant, exclude = {}} = {}) {
  const schema = assertIdent(earnedSchema);
  if (!TENANT.test(tenant || '')) refuse('funnel_tenant_refused');
  if (!exclude || typeof exclude !== 'object' || Array.isArray(exclude)) refuse('funnel_exclusion_refused');
  if (Object.keys(exclude).some(key => !['accountIds', 'taskIds', 'operationIds'].includes(key))) refuse('funnel_exclusion_refused');
  const accounts = ids(exclude.accountIds, ACCOUNT, 'funnel_exclusion_refused');
  const tasks = ids(exclude.taskIds, TASK, 'funnel_exclusion_refused');
  const operationIds = operations(exclude.operationIds);
  const q = async (sql, params) => (await client.query(sql, params)).rows[0].n;
  const taskTable = `"${schema}".ae14_market_tasks`;
  const interestTable = `"${schema}".ae14_market_interests`;
  const measureTable = `"${schema}".ae14_market_measures`;
  const fundingTable = `"${schema}".ae14_market_funding`;
  const quoteTable = `"${schema}".ae14_market_quotes`;
  const signupTable = `"${schema}".journey_account_operations`;
  const signups = await q(
    `SELECT count(*)::int AS n FROM ${signupTable}
     WHERE operation = 'signup' AND NOT (account_id = ANY($1::text[])) AND NOT (idempotency_key = ANY($2::text[]))`,
    [accounts, operationIds],
  );
  const requesterSignupsWithoutListing = await q(
    `SELECT count(*)::int AS n FROM ${signupTable} o
     JOIN hosted_wallet_market.roles r ON r.account_id = o.account_id
     WHERE o.operation = 'signup' AND r.role = 'requester'
       AND NOT (o.account_id = ANY($1::text[])) AND NOT (o.idempotency_key = ANY($2::text[]))
       AND NOT EXISTS (
         SELECT 1 FROM ${taskTable} t
         WHERE t.tenant_id = $3 AND t.requester_id = o.account_id AND NOT (t.id = ANY($4::text[]))
       )`,
    [accounts, operationIds, tenant, tasks],
  );
  const unfundedListings = await q(
    `SELECT count(*)::int AS n FROM ${taskTable} t
     WHERE t.tenant_id = $1 AND NOT (t.id = ANY($2::text[]))
       AND NOT EXISTS (
         SELECT 1 FROM ${fundingTable} f
         JOIN ${quoteTable} q ON q.allocation_id = f.allocation_id AND q.tenant_id = f.tenant_id
         WHERE q.tenant_id = t.tenant_id AND q.task_id = t.id
       )`,
    [tenant, tasks],
  );
  const interests = await q(
    `SELECT count(*)::int AS n FROM ${interestTable}
     WHERE tenant_id = $1 AND NOT (task_id = ANY($2::text[])) AND NOT (actor_id = ANY($3::text[]))`,
    [tenant, tasks, accounts],
  );
  const discoveryImpressions = await q(
    `SELECT count(*)::int AS n FROM ${measureTable}
     WHERE tenant_id = $1 AND kind = 'discovery' AND NOT (task_id = ANY($2::text[]))`,
    [tenant, tasks],
  );
  const funding = await q(
    `SELECT count(*)::int AS n FROM ${fundingTable} f
     JOIN ${quoteTable} q ON q.tenant_id = f.tenant_id AND q.allocation_id = f.allocation_id
     WHERE q.tenant_id = $1 AND NOT (q.task_id = ANY($2::text[]))`,
    [tenant, tasks],
  );
  return {
    schema: 'pilot.machine-market.funnel.v1',
    cohort: 'unknown',
    signups,
    requesterSignupsWithoutListing,
    unfundedListings,
    interests,
    discoveryImpressions,
    impressionIdentity: 'listing_event',
    funding,
    paidWork: funding !== 0,
    excluded: {accounts: accounts.length, tasks: tasks.length, operations: exclude.operationIds?.length ?? 0},
  };
}
