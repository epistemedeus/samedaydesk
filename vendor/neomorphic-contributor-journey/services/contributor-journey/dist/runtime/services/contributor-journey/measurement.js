import { hashRequest } from '../earned-work/src/crypto.js';
import { EVENT_SCHEMA, POLICY_SCHEMA, QUERY_SCHEMA, STAGES, emptyState, ingest, project } from '../../experiments/contributor-network-measurement-227900/src/index.mjs';
/** Private read-only source receiving. No aggregate counter is expanded into a fact.
 * Coverage stays partial: this reader does not capture every failed attempt or a
 * qualified canonical settlement. Historical/unbound rounds are never enrolled. */
export async function readInstalledMeasurement(input) {
    await input.installed.admission.checkReady();
    const live = input.installed.profile === 'live', provenance = live ? 'production' : 'test', actorRelation = live ? 'unknown' : 'owner_qa';
    const producer = live ? 'installed229500-live' : 'installed227800', namespace = live ? 'journey-durable-accounts' : 'cj227-private-accounts', populationId = live ? 'journey-live-unclassified' : 'cj227-staging-owner-qa';
    const policy = { schema: POLICY_SCHEMA, producers: [{ id: producer, sourceVersion: 'opportunity-composition-v1',
                stages: ['discovery', 'signup', 'claim', 'submission', 'review'], namespaces: [namespace], provenances: [provenance] }] };
    const events = [];
    const fact = (stage, id) => `${stage}_${hashRequest(id)}`;
    const parent = (stage, id) => ({ producerId: producer, factId: fact(stage, id) });
    const emit = (stage, id, accountId, at, outcome, refs, parents, attribution = { observed: null, declared: null }) => {
        events.push({ schema: EVENT_SCHEMA, producerId: producer, sourceVersion: 'opportunity-composition-v1', eventId: fact(stage, id), factId: fact(stage, id), revision: 1, supersedes: null,
            stage, outcome, occurredAt: at, observedAt: at, populationId, namespace, actorId: accountId, actorRelation, provenance, evidence: 'observed', channel: 'http', attribution, refs, parents });
    };
    const accounts = await input.kernel.withOpportunityClient(client => client.query(`SELECT id,created_at FROM journey_accounts ORDER BY created_at,id LIMIT 201`), 'read');
    for (const row of accounts.rows.slice(0, 200)) {
        const arrival = await input.kernel.withOpportunityClient(async (client) => (await client.query(`SELECT e.record FROM journey_visitors v JOIN journey_source_events e ON e.event_id=v.arrival_event_id
      WHERE v.account_id=$1 AND e.record->>'stage'='observed_link_arrival' ORDER BY e.created_at LIMIT 1`, [row.id])).rows[0]?.record ?? null, 'read');
        const parents = [];
        if (arrival) {
            emit('discovery', arrival.eventId, row.id, arrival.occurredAt, 'visited', {}, [], { observed: 'another_agent', declared: null });
            parents.push(parent('discovery', arrival.eventId));
        }
        emit('signup', row.id, row.id, row.created_at.toISOString(), 'created', {}, parents);
    }
    const accountIds = new Set(accounts.rows.slice(0, 200).map((row) => row.id));
    const claims = await input.kernel.withOpportunityClient(client => client.query(`SELECT c.id,b.account_id FROM opportunity_claims c
    JOIN opportunity_rounds r ON r.id=c.round_id JOIN journey_account_kernel_bindings b ON b.principal_id=c.contributor_token_id
    WHERE r.round_key=ANY($1::text[]) AND r.provenance=$2 ORDER BY c.created_at,c.id LIMIT 201`, [input.rounds.filter(r => r.provenance === provenance).map(r => r.roundKey), provenance]), 'read');
    for (const claim of claims.rows.slice(0, 200)) {
        if (!accountIds.has(claim.account_id))
            continue;
        const row = await input.installed.adapters.load(claim.id);
        if (!row)
            continue;
        // These are private measurement references, never aliases or public handles.
        const refs = { taskId: row.id, workId: 'mwork_' + hashRequest(claim.id), reservationId: claim.id, termsId: row.claim.terms_version };
        emit('claim', claim.id, row.owner, new Date(row.claim.created_at).toISOString(), 'claimed', refs, [parent('signup', row.owner)]);
        if (!row.submission || !row.record?.frozen)
            continue;
        const delivered = { ...refs, artifactId: row.record.frozen.artifactId };
        emit('submission', row.submission.id, row.owner, new Date(row.submission.created_at).toISOString(), 'submitted', delivered, [parent('claim', claim.id)]);
        const reviewed = await input.installed.adapters.review.read({ taskId: row.id, reservationId: claim.id });
        if (row.obligation && reviewed?.aggregate.verdict?.outcome === 'pass') {
            emit('review', row.obligation.id, row.owner, new Date(row.obligation.created_at).toISOString(), 'accepted_unknown', delivered, [parent('submission', row.submission.id)]);
        }
    }
    const capped = accounts.rows.length > 200 || claims.rows.length > 200;
    const query = { schema: QUERY_SCHEMA, window: input.window, retentionSeconds: 86400, populations: [{ id: populationId, namespace, actorRelation, provenance, window: input.window,
                membership: 'unknown', members: null, coverage: Object.fromEntries(STAGES.map(stage => [stage, { state: ['discovery', 'signup', 'claim', 'submission', 'review'].includes(stage) ? capped ? 'capped' : 'partial' : 'unknown',
                        producerIds: ['discovery', 'signup', 'claim', 'submission', 'review'].includes(stage) ? [producer] : [] }])) }] };
    const received = ingest(emptyState(), events, policy);
    return { privateOnly: true, policy, events, query, receipt: received.receipt, aggregate: project(received.state, query, policy),
        limitations: ['failure_attempts_not_captured', 'qualified_settlement_not_configured', 'publication_and_referral_require_qualified_fulfillment', 'usefulness_not_inferred_from_schema_pass', 'population_unknown'] };
}
//# sourceMappingURL=measurement.js.map