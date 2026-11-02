// Bind stored voluntary terms to a successor only when source succession already
// lists that predecessor. The terms document is not updated.
const refuse = code => { throw Object.assign(new Error(code), {code, codeName: code, http: 409}); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export async function bindVoluntaryPredecessor(client, {tenantId, taskId, terms, termsDigest, chain, successor, operationId}) {
  if (!chain || chain.schema !== 'pilot.native-debt.source-succession.v1' || !Array.isArray(chain.bindings) || !hash(chain.graphSha256)) refuse('voluntary_predecessor_unbound');
  if (!terms || terms.schema !== 'pilot.machine-market.voluntary-terms.v1' || terms.termsDigest === null) refuse('voluntary_terms_changed');
  if (!hash(termsDigest) || !hash(terms.sourceSha256) || !hash(terms.hostSha256)) refuse('voluntary_terms_changed');
  if (!/^[-a-zA-Z0-9_.:/]{8,160}$/.test(operationId || '')) refuse('idempotency_required');
  const current = chain.current;
  if (!current || current.sourceSha256 !== successor.sourceSha256 || current.hostSourceSha256 !== successor.hostSha256) refuse('voluntary_predecessor_unbound');
  if (terms.sourceSha256 === successor.sourceSha256 && terms.hostSha256 === successor.hostSha256) refuse('voluntary_predecessor_unbound');
  const listed = chain.bindings.some(node => node?.sourceSha256 === terms.sourceSha256 && node?.hostSourceSha256 === terms.hostSha256);
  if (!listed) refuse('voluntary_predecessor_unbound');
  const values = [tenantId, taskId, termsDigest, terms.sourceSha256, terms.hostSha256, successor.sourceSha256, successor.hostSha256, chain.graphSha256, operationId];
  await client.query(`INSERT INTO hosted_wallet_market.voluntary_predecessor_binding
    (tenant_id, task_id, terms_digest, predecessor_source_sha256, predecessor_host_sha256,
     successor_source_sha256, successor_host_sha256, succession_graph_sha256, operation_id, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp())
    ON CONFLICT (tenant_id, task_id, terms_digest) DO NOTHING`, values);
  const saved = (await client.query(`SELECT predecessor_source_sha256, predecessor_host_sha256, successor_source_sha256, successor_host_sha256, succession_graph_sha256
    FROM hosted_wallet_market.voluntary_predecessor_binding WHERE tenant_id=$1 AND task_id=$2 AND terms_digest=$3`,
    [tenantId, taskId, termsDigest])).rows[0];
  if (!saved || saved.predecessor_source_sha256 !== terms.sourceSha256 || saved.predecessor_host_sha256 !== terms.hostSha256
      || saved.successor_source_sha256 !== successor.sourceSha256 || saved.successor_host_sha256 !== successor.hostSha256
      || saved.succession_graph_sha256 !== chain.graphSha256) refuse('voluntary_predecessor_conflict');
  return {taskId, termsDigest, predecessorSourceSha256: terms.sourceSha256, predecessorHostSha256: terms.hostSha256,
    successorSourceSha256: successor.sourceSha256, successorHostSha256: successor.hostSha256, graphSha256: chain.graphSha256, termsRewritten: false};
}
