import { hashRequest } from '../earned-work/src/crypto.js';
import { EVENT_SCHEMA, POLICY_SCHEMA, QUERY_SCHEMA, STAGES, emptyState, ingest, project } from '../../experiments/contributor-network-measurement-227900/src/index.mjs';
/** Private read-only receiving from committed sources. The caller may retain
 * returned state in the existing bounded measurement FileStore. Revisions never
 * change the product's authority. Missing populations/results remain unknown. */
export async function readInstalledMeasurement(input) {
    await input.installed.admission.checkReady();
    const installed = input.installed, live = installed.profile === 'live', provenance = live ? 'production' : 'test';
    const producer = 'installed230100-relationships', version = 'opportunity-relationship-v2';
    const namespace = live ? 'journey-durable-accounts' : 'cj227-private-accounts';
    const supported = STAGES.filter(stage => stage !== 'customer_revenue');
    const policy = { schema: POLICY_SCHEMA, producers: [{ id: producer, sourceVersion: version,
                stages: [...supported], namespaces: [namespace], provenances: [provenance] }] };
    const previous = input.state ?? emptyState(), events = [];
    const defaults = live ? 'unknown' : 'owner_qa';
    const population = (relation) => 'journey-' + relation;
    const fact = (stage, id, relation) => `${stage}_${hashRequest({ id, relation })}`;
    const parent = (stage, id, relation = defaults) => ({ producerId: producer, factId: fact(stage, id, relation) });
    const emit = (stage, id, accountId, at, outcome, refs, parents, extra = {}, relation = defaults) => {
        at = new Date(at).toISOString();
        const factId = fact(stage, id, relation), prior = previous.events.filter(e => e.producerId === producer && e.factId === factId).at(-1);
        const row = { schema: EVENT_SCHEMA, producerId: producer, sourceVersion: version, eventId: factId, factId, revision: 1, supersedes: null,
            stage, outcome, occurredAt: prior?.occurredAt ?? at, observedAt: at, populationId: population(relation), namespace, actorId: accountId,
            actorRelation: relation, provenance, evidence: 'observed', channel: 'http', attribution: { observed: null, declared: null }, refs, parents, ...extra };
        if (prior) {
            const comparable = (e) => { const { eventId, revision, supersedes, observedAt, ...rest } = e; return rest; };
            if (hashRequest(comparable(prior)) === hashRequest(comparable(row))) {
                events.push(prior);
                return prior;
            }
            row.revision = prior.revision + 1;
            row.supersedes = prior.eventId;
            row.eventId = factId + '_r' + row.revision;
            row.observedAt = input.window.asOf;
        }
        events.push(row);
        return row;
    };
    const accounts = await input.kernel.withOpportunityClient(client => client.query('SELECT id,created_at FROM journey_accounts ORDER BY created_at,id LIMIT 201'), 'read');
    const accountRows = new Map(accounts.rows.slice(0, 200).map((row) => [row.id, row]));
    const signups = new Set();
    let sourceCapped = false;
    const signup = async (id, relation = defaults) => {
        const key = id + ':' + relation;
        if (signups.has(key))
            return;
        signups.add(key);
        const row = accountRows.get(id);
        if (!row)
            return;
        const sources = await input.kernel.withOpportunityClient(client => client.query(`SELECT e.record FROM journey_visitors v JOIN journey_source_events e
      ON e.record->>'visitorRef'=v.visitor_ref WHERE v.account_id=$1 AND e.record->>'stage'=ANY($2::text[])
      ORDER BY e.created_at,e.event_id LIMIT 101`, [id, ['observed_link_arrival', 'declared_source']]), 'read');
        if (sources.rows.length > 100)
            sourceCapped = true;
        const arrival = sources.rows.map(r => r.record).find(r => r.stage === 'observed_link_arrival');
        const declaration = sources.rows.map(r => r.record).find(r => r.stage === 'declared_source');
        const declared = declaration?.declaredChannel === 'shared_link' ? 'other' : declaration?.declaredChannel === 'listing' ? 'other' : declaration ? 'unknown' : null;
        const parents = [];
        if (arrival) {
            emit('discovery', arrival.eventId, id, arrival.occurredAt, 'visited', {}, [], { attribution: { observed: 'other', declared: null } }, relation);
            parents.push(parent('discovery', arrival.eventId, relation));
        }
        emit('signup', id, id, row.created_at.toISOString(), 'created', {}, parents, { attribution: { observed: arrival ? 'other' : null, declared } }, relation);
    };
    for (const id of accountRows.keys())
        await signup(id);
    const taskIds = live ? installed.admission.config.installed.futureRounds.flatMap(pin => pin.provenance === 'production' ? pin.tasks.map(task => `${pin.roundKey}:${task.offerKey}`) : []) : null;
    const claims = await input.kernel.withOpportunityClient(client => client.query(`SELECT c.id,b.account_id FROM opportunity_claims c
    JOIN opportunity_rounds r ON r.id=c.round_id JOIN opportunity_offers f ON f.id=c.offer_id AND f.round_id=r.id
    JOIN journey_account_kernel_bindings b ON b.principal_id=c.contributor_token_id
    WHERE r.round_key=ANY($1::text[]) AND r.provenance=$2
      AND ($3::text[] IS NULL OR r.round_key || ':' || f.offer_key=ANY($3::text[]))
    ORDER BY c.created_at,c.id LIMIT 201`, [input.rounds.filter(r => r.provenance === provenance && installed.admission.config.installed.futureRounds.some(pin => pin.roundKey === r.roundKey)).map(r => r.roundKey), provenance, taskIds]), 'read');
    const useful = [];
    const publications = new Map();
    const reports = [];
    for (const claim of claims.rows.slice(0, 200)) {
        if (!accountRows.has(claim.account_id))
            continue;
        const row = await installed.adapters.load(claim.id);
        if (!row?.owner)
            continue;
        const link = await input.kernel.withOpportunityClient(async (client) => (await client.query('SELECT work_id FROM journey_work_links WHERE reservation_id=$1', [claim.id])).rows[0] ?? null, 'read');
        const work = link && await installed.works.read(link.work_id);
        let canonical = null;
        try {
            canonical = work && await installed.canonical.read(work);
        }
        catch { /* Unavailable qualification stays unknown. */ }
        const relation = live ? canonical?.actorRelation ?? defaults : defaults;
        await signup(row.owner, relation);
        const refs = { taskId: row.id, workId: 'mwork_' + hashRequest(claim.id), reservationId: claim.id, termsId: row.claim.terms_version };
        const origin = { sourceId: 'opportunity-service', sourceRevision: 'terms-' + row.claim.terms_version.slice(7, 23), sourceDigest: hashRequest({ roundId: row.round.id, claimId: claim.id, terms: row.claim.terms_version }) };
        emit('claim', claim.id, row.owner, new Date(row.claim.created_at).toISOString(), 'claimed', refs, [parent('signup', row.owner, relation)], { origin }, relation);
        if (!row.submission || !row.record?.frozen)
            continue;
        const delivered = { ...refs, artifactId: row.record.frozen.artifactId };
        const deliveredOrigin = { ...origin, sourceDigest: hashRequest({ origin, submission: row.submission.id, artifact: row.record.frozen.artifactId, digest: row.submission.artifact_digest_sha256 }) };
        emit('submission', row.submission.id, row.owner, new Date(row.submission.created_at).toISOString(), 'submitted', delivered, [parent('claim', claim.id, relation)], { origin: deliveredOrigin }, relation);
        const reviewed = await installed.adapters.review.read({ taskId: row.id, reservationId: claim.id });
        if (!row.obligation || reviewed?.aggregate.verdict?.outcome !== 'pass')
            continue;
        const acceptedAt = new Date(row.obligation.created_at).toISOString();
        emit('review', row.obligation.id, row.owner, acceptedAt, 'accepted_unknown', delivered, [parent('submission', row.submission.id, relation)], { origin: deliveredOrigin }, relation);
        if (!work)
            continue;
        const observations = await installed.relationships.current(work), latest = new Map(observations.map(o => [o.role, o]));
        // Statements remain self-reported even though their authenticated capture is observed.
        for (const [role, report] of latest) {
            const first = observations.find(o => o.role === role);
            const stage = role === 'requester' ? 'review' : 'submission';
            const record = emit(stage, 'report:' + row.obligation.id + ':' + role, row.owner, first.reportedAt, role === 'requester' && report.useful === 'useful' ? 'accepted_useful' : role === 'requester' ? 'accepted_unknown' : 'submitted', delivered, [parent(role === 'requester' ? 'submission' : 'claim', role === 'requester' ? row.submission.id : claim.id, relation)], { evidence: 'self_report', observedAt: report.reportedAt, origin: { sourceId: 'authenticated-' + role, sourceRevision: 'report-' + report.revision, sourceDigest: report.sourceDigest },
                reported: { role, useful: report.useful, effortSeconds: report.effortSeconds, recordRef: report.eventId } }, relation);
            reports.push({ ...report, origin: record.origin });
            if (role === 'requester' && report.useful === 'useful')
                useful.push({ workId: work.binding.workId, taskId: row.id, actor: row.owner, relation,
                    at: report.reportedAt, acceptedAt, refs: delivered, factId: record.factId, sourceDigest: report.sourceDigest });
        }
        if (installed.canonical.configured) {
            const qualified = await installed.canonical.reference(work), settlement = qualified.record?.settlement;
            const qualifying = qualified.result.qualified && !!qualified.receiptRef && !!settlement;
            emit('qualified_fulfillment', row.obligation.id, row.owner, settlement?.timestamp ?? acceptedAt, qualifying ? 'qualified' : !qualified.result.qualified && ['missing_settlement', 'unavailable'].includes(qualified.result.reason) ? 'unknown' : 'unqualified', { ...delivered, obligationId: row.obligation.id, ...(qualified.receiptRef ? { receiptId: qualified.receiptRef } : {}) }, [parent('review', row.obligation.id, relation)], { origin: canonical ? { sourceId: canonical.source.sourceId, sourceRevision: canonical.source.sourceRevision, sourceDigest: canonical.source.sourceSha256 } : deliveredOrigin }, relation);
        }
        const consent = await installed.consents.read(work.binding.workId);
        if (consent) {
            const stored = await input.kernel.withOpportunityClient(async (client) => (await client.query('SELECT updated_at FROM contributor_showcase_consents WHERE work_id=$1', [work.binding.workId])).rows[0], 'read');
            const published = await installed.showcase.readPublished(work.binding.workId);
            const at = stored.updated_at.toISOString();
            const pub = emit('consented_publication', work.binding.workId, row.owner, at, published.ok ? 'published' : 'withdrawn', { ...delivered, consentId: 'consent_' + hashRequest({ workId: work.binding.workId, version: consent.version }) }, [parent('review', row.obligation.id, relation)], { origin: { sourceId: 'showcase-consent', sourceRevision: 'consent-' + consent.version, sourceDigest: hashRequest(consent) } }, relation);
            publications.set(work.binding.workId, { event: pub, relation, refs: delivered });
        }
    }
    const shares = await input.kernel.withOpportunityClient(client => client.query(`SELECT s.record FROM journey_referral_shares s
    JOIN journey_work_links w ON COALESCE(s.record->>'acceptedWorkRef',CASE WHEN s.record->'source'->>'kind'='showcase' THEN s.record->'source'->>'id' END)=w.work_id JOIN journey_task_links t ON t.task_id=w.task_id
    WHERE t.round_key=ANY($1::text[]) AND ($2::text[] IS NULL OR t.task_id=ANY($2::text[])) ORDER BY s.share_ref LIMIT 201`, [input.rounds.filter(r => installed.admission.config.installed.futureRounds.some(pin => pin.roundKey === r.roundKey)).map(r => r.roundKey), taskIds]), 'read');
    for (const { record: share } of shares.rows.slice(0, 200)) {
        const publication = publications.get(share.acceptedWorkRef ?? share.source.id);
        if (!publication)
            continue;
        const view = await installed.referral.readPublic(share.shareRef);
        emit('referral', share.shareRef, share.ownerAccountId, share.createdAt, view.ok ? 'shared' : 'withdrawn', { ...publication.refs, referralId: share.shareRef }, [{ producerId: producer, factId: publication.event.factId }], { origin: { sourceId: 'voluntary-share', sourceRevision: 'share-' + share.revision, sourceDigest: hashRequest(share) } }, publication.relation);
    }
    // Explicit useful statements on distinct accepted tasks create reported repeat
    // lineage only. Sponsored/QA work is never promoted into repeat outside demand.
    useful.sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt) || a.workId.localeCompare(b.workId));
    const repeatLineage = [];
    for (const later of useful) {
        if (['owner_qa', 'sponsored'].includes(later.relation))
            continue;
        const prior = useful.find(candidate => candidate.actor === later.actor && candidate.relation === later.relation &&
            candidate.taskId !== later.taskId && candidate.workId !== later.workId && candidate.acceptedAt < later.acceptedAt);
        if (!prior)
            continue;
        emit('repeat_useful_work', later.workId, later.actor, [prior.at, later.at].sort().at(-1), 'useful', later.refs, [prior, later].map(work => ({ producerId: producer, factId: work.factId })), { evidence: 'self_report', origin: { sourceId: 'requester-usefulness-lineage', sourceRevision: 'v1', sourceDigest: hashRequest({ prior, later }) } }, later.relation);
        repeatLineage.push({ priorWorkId: prior.workId, laterWorkId: later.workId, accountId: later.actor, evidence: 'self_report', actorRelation: later.relation });
    }
    // An absent/currently refused source cannot leave a previously active derivative
    // in a retained consumer cut. Keep its immutable history and correct its head.
    const currentFacts = new Set(events.map(e => e.factId));
    const heads = new Map(previous.events.filter(e => e.producerId === producer).map(e => [e.factId, e]));
    for (const prior of heads.values()) {
        if (currentFacts.has(prior.factId))
            continue;
        const outcome = prior.stage === 'qualified_fulfillment' ? 'unknown' :
            ['consented_publication', 'referral', 'repeat_useful_work'].includes(prior.stage) ? 'withdrawn' :
                prior.stage === 'review' && prior.evidence === 'self_report' ? 'withdrawn' : null;
        if (!outcome)
            continue;
        if (prior.outcome === outcome) {
            events.push(prior);
            continue;
        }
        events.push({ ...prior, eventId: prior.factId + '_r' + (prior.revision + 1), revision: prior.revision + 1, supersedes: prior.eventId,
            outcome, observedAt: input.window.asOf });
    }
    const capped = sourceCapped || accounts.rows.length > 200 || claims.rows.length > 200 || shares.rows.length > 200;
    const relations = [...new Set([defaults, ...events.map(e => e.actorRelation)])];
    const coverage = (stage) => stage === 'customer_revenue' || stage === 'qualified_fulfillment' && !installed.canonical.configured ? 'unknown' : capped ? 'capped' : 'partial';
    const query = { schema: QUERY_SCHEMA, window: input.window, retentionSeconds: 86400, populations: relations.map(relation => ({ id: population(relation), namespace,
            actorRelation: relation, provenance, window: input.window, membership: 'unknown', members: null,
            coverage: Object.fromEntries(STAGES.map(stage => [stage, { state: coverage(stage), producerIds: coverage(stage) === 'unknown' ? [] : [producer] }])) })) };
    const received = ingest(previous, events, policy);
    const currentCut = { ...received.state, events: received.state.events.filter(event => currentFacts.has(event.factId) || events.some(current => current.factId === event.factId)) };
    return { privateOnly: true, policy, events, state: received.state, query, receipt: received.receipt, aggregate: project(currentCut, query, policy),
        relationship: { reports, repeatLineage, usefulnessEvidence: 'authenticated_requester_self_report', effortEvidence: 'self_report' },
        limitations: ['failure_attempts_not_captured', 'population_unknown', 'reported_usefulness_is_not_observed_reuse',
            'reported_effort_is_not_measured_savings', 'no_customer_revenue_inference'] };
}
//# sourceMappingURL=measurement.js.map