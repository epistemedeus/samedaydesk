// Read-only counts from the existing account and market records.
// Cohort stays unknown. A discovery row is one task, UTC day and source hash, not a page view.
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
 * Funding rows establish funding only. Without settlement receiving, paid work is unknown.
 */
export async function unfundedFunnelSnapshot(client, {earnedSchema, tenant, exclude = {}} = {}) {
  const schema = assertIdent(earnedSchema);
  if (!TENANT.test(tenant || '')) refuse('funnel_tenant_refused');
  if (!exclude || typeof exclude !== 'object' || Array.isArray(exclude)) refuse('funnel_exclusion_refused');
  if (Object.keys(exclude).some(key => !['accountIds', 'taskIds', 'operationIds'].includes(key))) refuse('funnel_exclusion_refused');
  const accounts = ids(exclude.accountIds, ACCOUNT, 'funnel_exclusion_refused');
  const tasks = ids(exclude.taskIds, TASK, 'funnel_exclusion_refused');
  const operationIds = operations(exclude.operationIds);
  const table = name => `"${schema}".${name}`;
  // Derive exclusions from the same retained signup and transition rows. Supplying
  // one account or operation must not leave its QA listing in the visitor funnel.
  const result = await client.query(`
    WITH excluded_accounts AS (
      SELECT unnest($1::text[]) AS id
      UNION SELECT account_id FROM ${table('journey_account_operations')}
        WHERE operation='signup' AND idempotency_key=ANY($2::text[])
    ), excluded_tasks AS (
      SELECT unnest($3::text[]) AS id
      UNION SELECT id FROM ${table('ae14_market_tasks')}
        WHERE tenant_id=$4 AND requester_id IN (SELECT id FROM excluded_accounts)
      UNION SELECT task_id FROM ${table('ae14_market_measures')}
        WHERE tenant_id=$4 AND kind='transition' AND payload->>'action'='post'
          AND payload->>'operationId'=ANY($2::text[])
    ), visible_tasks AS (
      SELECT * FROM ${table('ae14_market_tasks')}
        WHERE tenant_id=$4 AND id NOT IN (SELECT id FROM excluded_tasks)
    ), visible_transitions AS (
      SELECT m.* FROM ${table('ae14_market_measures')} m JOIN visible_tasks t ON t.id=m.task_id
        WHERE m.tenant_id=$4 AND m.kind='transition'
          AND m.actor_id NOT IN (SELECT id FROM excluded_accounts)
          AND NOT (coalesce(m.payload->>'operationId','')=ANY($2::text[]))
    )
    SELECT
      (SELECT count(*)::int FROM ${table('journey_account_operations')}
        WHERE operation='signup' AND account_id NOT IN (SELECT id FROM excluded_accounts)
          AND NOT (idempotency_key=ANY($2::text[]))) AS signups,
      (SELECT count(*)::int FROM ${table('journey_account_operations')} o
        JOIN hosted_wallet_market.roles r ON r.account_id=o.account_id
        WHERE o.operation='signup' AND r.role='requester'
          AND o.account_id NOT IN (SELECT id FROM excluded_accounts)
          AND NOT (o.idempotency_key=ANY($2::text[]))
          AND NOT EXISTS (SELECT 1 FROM ${table('ae14_market_tasks')} t WHERE t.tenant_id=$4 AND t.requester_id=o.account_id)
      ) AS abandoned,
      (SELECT count(*)::int FROM visible_tasks t WHERE NOT EXISTS (
        SELECT 1 FROM ${table('ae14_market_funding')} f JOIN ${table('ae14_market_quotes')} q
          ON q.allocation_id=f.allocation_id AND q.tenant_id=f.tenant_id
        WHERE q.tenant_id=t.tenant_id AND q.task_id=t.id)) AS listings,
      (SELECT count(*)::int FROM ${table('ae14_market_interests')} i JOIN visible_tasks t ON t.id=i.task_id
        WHERE i.tenant_id=$4 AND i.actor_id NOT IN (SELECT id FROM excluded_accounts)
          AND NOT EXISTS (SELECT 1 FROM ${table('ae14_market_measures')} m
            WHERE m.tenant_id=$4 AND m.task_id=i.task_id AND m.actor_id=i.actor_id AND m.kind='transition'
              AND m.payload->>'action'='interest' AND m.payload->>'operationId'=ANY($2::text[]))) AS interests,
      (SELECT count(*)::int FROM ${table('ae14_market_measures')} m JOIN visible_tasks t ON t.id=m.task_id
        WHERE m.tenant_id=$4 AND m.kind='discovery') AS impressions,
      (SELECT count(*)::int FROM ${table('ae14_market_funding')} f JOIN ${table('ae14_market_quotes')} q
          ON q.tenant_id=f.tenant_id AND q.allocation_id=f.allocation_id
        JOIN visible_tasks t ON t.id=q.task_id WHERE q.tenant_id=$4) AS funding,
      (SELECT count(*)::int FROM visible_transitions WHERE payload->>'action'='post') AS posts,
      (SELECT count(*)::int FROM visible_transitions WHERE payload->>'action'='interest') AS interest_transitions
  `, [accounts, operationIds, tasks, tenant]);
  const counts = result.rows[0];
  return {
    schema: 'pilot.machine-market.funnel.v1',
    cohort: 'unknown',
    signupScope: 'earned_schema',
    listingScope: 'tenant',
    acquisition: 'unknown',
    signups: counts.signups,
    requesterSignupsWithoutListing: counts.abandoned,
    unfundedListings: counts.listings,
    interests: counts.interests,
    discoveryImpressions: counts.impressions,
    impressionIdentity: 'task_utc_day_source',
    transitions: {post: counts.posts, interest: counts.interest_transitions},
    funding: counts.funding,
    fundingStarted: counts.funding !== 0,
    paidWork: counts.funding === 0 ? false : null,
    excluded: {accounts: accounts.length, tasks: tasks.length, operations: exclude.operationIds?.length ?? 0},
  };
}
