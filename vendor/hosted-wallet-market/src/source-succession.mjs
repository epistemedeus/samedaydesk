// Pair identities extend the historical package chain without rewriting it.
import {digest} from './canonical.mjs';
export const sourcePair = row => ({sourceSha256: row.source_sha256, hostSourceSha256: row.host_source_sha256});
export const sourcePairKey = pair => `${pair.sourceSha256}:${pair.hostSourceSha256}`;
const hold = () => { throw Object.assign(new Error('binding_stale'), {http:409, codeName:'binding_stale'}); };
const validPair = pair => pair && /^[a-f0-9]{64}:[a-f0-9]{64}$/.test(sourcePairKey(pair));
export async function readSourceSuccession(tx, enrollment, observationSeal, principalId) {
  // Read bounded whole tables: unreachable rows are corruption, not another
  // authorization path. SQL constraints are also checked by this reader.
  const legacy = (await tx.query(`SELECT *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS preservation_through
    FROM hosted_wallet_market.source_succession ORDER BY predecessor_source_sha256 LIMIT 65`)).rows;
  const current = (await tx.query(`SELECT *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS preservation_through
    FROM hosted_wallet_market.source_binding_succession ORDER BY predecessor_source_sha256, predecessor_host_source_sha256 LIMIT 65`)).rows;
  if (legacy.length + current.length > 64) hold();
  const nodes = [sourcePair(enrollment)], edges = [], seen = new Set([sourcePairKey(nodes[0])]);
  const legacyPackages = new Set([enrollment.source_sha256]);
  let tail = nodes[0];
  const append = edge => {
    const next = {sourceSha256:edge.successor_source_sha256,hostSourceSha256:edge.successor_host_source_sha256};
    if (!validPair(next) || seen.has(sourcePairKey(next))) hold();
    seen.add(sourcePairKey(next)); nodes.push(next); edges.push(edge); tail = next;
  };
  for (;;) {
    const candidates = legacy.filter(edge => edge.predecessor_source_sha256 === tail.sourceSha256);
    if (!candidates.length) break;
    if (candidates.length !== 1) hold();
    const edge = candidates[0];
    if (legacyPackages.has(edge.successor_source_sha256) || edge.consumer_contract_sha256 !== enrollment.consumer_contract_sha256 ||
        edge.preservation_sha256 !== await observationSeal(tx, edge.preservation_through)) hold();
    legacyPackages.add(edge.successor_source_sha256); append(edge);
  }
  if (edges.length !== legacy.length) hold();
  // Stable SQL timestamp text retains PostgreSQL microseconds in legacy seals.
  const legacyDigest = digest(legacy.map(({created_at, ...edge}) => edge));
  const anchor = (await tx.query(`SELECT *, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS preservation_through
    FROM hosted_wallet_market.source_binding_anchor WHERE id IS TRUE`)).rows[0];
  if (anchor && (anchor.legacy_chain_sha256 !== legacyDigest || anchor.legacy_edge_count !== legacy.length ||
      anchor.principal_id !== principalId || anchor.preservation_sha256 !== await observationSeal(tx, anchor.preservation_through, true))) hold();
  if (current.length && !anchor) hold();
  const legacyCount = edges.length;
  for (;;) {
    const candidates = current.filter(edge => edge.predecessor_source_sha256 === tail.sourceSha256 && edge.predecessor_host_source_sha256 === tail.hostSourceSha256);
    if (!candidates.length) break;
    if (candidates.length !== 1) hold();
    const edge = candidates[0];
    if (edge.consumer_contract_sha256 !== enrollment.consumer_contract_sha256 || edge.principal_id !== principalId ||
        edge.preservation_sha256 !== await observationSeal(tx, edge.preservation_through, true)) hold();
    append(edge);
  }
  if (edges.length !== legacy.length + current.length) hold();
  // A retained successful operation is an independent acknowledgement. Losing
  // even a terminal edge must not silently reset the chain to an earlier tail.
  const acknowledged = (await tx.query(`SELECT DISTINCT response_json->'value'->'sourceBinding' AS binding
    FROM earned_work_idempotency WHERE scope='hosted-wallet-market' AND task_id='' AND status_code=200
    AND request_hash=$1 AND response_json->'value' ? 'sourceBinding' LIMIT 66`,
    [digest({method:'POST',route:'/api/neomorphic-contributor-journey/v1/native-debt/enroll',body:{}})])).rows;
  if (acknowledged.length > 65 || acknowledged.some(row => !validPair(row.binding) || !seen.has(sourcePairKey(row.binding)))) hold();
  return {nodes, edges, tail, anchor, legacyDigest, legacyCount};
}
