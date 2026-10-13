import express from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { OpportunityService } from '../earned-work/src/opportunity/service.js';
import { hashRequest } from '../earned-work/src/crypto.js';
import { ContributorAccountService, migrateContributorAccounts } from './account/service.js';
import { createAccountRouter, readAccountSessionToken } from './account/http.js';
import { createContributorClaimsService } from './claims/service.js';
import { createContributorClaimsRouter } from './claims/routes.js';
import { createStoredOpportunityPrincipalResolver } from '../earned-work/src/opportunity/account-principal.js';
import { SubmissionService } from './submission/service.js';
import { PostgresSubmissionPersistence } from './submission/postgres.js';
import { createSubmissionRouter } from './submission/http.js';
import { ReviewService } from './review/service.js';
import { createReviewHandler } from './review/http.js';
import { createCorrespondenceReviewPort } from './review/adapters.js';
import { createDiscussionService } from './discussion/service.js';
import { createDiscussionRouter } from './discussion/http.js';
import { createCorrespondenceJournal } from './discussion/correspondence.js';
import { PostgresProjectLock } from './discussion/postgres-lock.js';
import { safeText } from './discussion/validation.js';
import { createShowcaseService } from './showcase/service.js';
import { createShowcaseHttpHandler } from './showcase/http.js';
import { createPostgresConsentedSummaryStore, migrateShowcase } from './showcase/postgres.js';
import { createReferralService } from './referral/service.js';
import { createReferralHttpHandler } from './referral/http.js';
import { createPostgresReferralPorts } from './referral/postgres.js';
import { CompositionStore } from './composition-store.js';
import { createOpportunityJourneyAdapters } from './opportunity-adapters.js';
export const RECEIVED_MODULE_COMMITS = {
    account: 'd341c93357596513b54a6952610b7550830353b4', claims: '9294ac84595a546e93233b188b9afd79c38b6dc6',
    submission: '6efdbaf1ccf36d43c374ddfbff35ddbb0a38d4bc', review: 'bff140b0c66dbb13d71dc865c150772a310bd6e9',
    showcase: 'f4db642b644b0a271f963987676d6a476d9c0de5', discussion: 'a38a0663cdb004c1ed2b22e14c25e32580f8e98d',
    referral: 'c22d481b4da6ec5a43d8e55680418601d01b2615',
    measurement: '301711b8eac39cdeda16466bc72e3d379fd91486',
};
export async function createInstalledComposition(options) {
    const { config, services, pool, lockPool } = options;
    const settings = config.installed;
    const kernel = services.earnedWork.store;
    await migrateContributorAccounts(kernel);
    const accounts = new ContributorAccountService({ database: kernel, kernel, replayKey: Buffer.from(settings.replayKey, 'hex'), enabled: true });
    const db = new CompositionStore(kernel, services.correspondence.store, settings.integrityKey);
    await db.migrate();
    const persistence = new PostgresSubmissionPersistence(pool, config.storage.earnedWorkSchema);
    await persistence.migrate();
    await migrateShowcase(pool);
    const opportunity = new OpportunityService(kernel);
    const lock = new PostgresProjectLock(lockPool);
    const fetchRequest = (req) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers))
            if (value != null && key !== 'content-length' && key !== 'host')
                headers.set(key, Array.isArray(value) ? value.join(',') : value);
        const body = ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {});
        return new globalThis.Request(new URL(req.originalUrl, settings.origin), { method: req.method, headers, body });
    };
    const token = (context) => {
        if (context instanceof globalThis.Request) {
            return readAccountSessionToken({ header: (name) => context.headers.get(name) ?? undefined }, true);
        }
        return readAccountSessionToken(context, true);
    };
    const authenticate = async (context) => {
        try {
            const result = await accounts.authenticate(token(context));
            return result.ok ? result.value : null;
        }
        catch {
            return null;
        }
    };
    const csrf = (account) => createHmac('sha256', settings.integrityKey).update(`${account.accountId}:${account.sessionId}`).digest('hex');
    const authorize = async (context) => {
        const get = (name) => context instanceof globalThis.Request ? context.headers.get(name) : context.header(name);
        if (get('origin') !== settings.origin)
            return false;
        const account = await authenticate(context);
        if (!account || get('x-cj-csrf') !== csrf(account))
            return false;
        return true;
    };
    const principal = createStoredOpportunityPrincipalResolver(kernel, async (accountId, roundKey) => {
        const round = await db.round(roundKey);
        if (!round || !settings.futureRounds.some(value => value.roundKey === roundKey && value.provenance === round.provenance))
            return null;
        return kernel.withOpportunityClient(async (client) => (await client.query('SELECT principal_id FROM journey_account_kernel_bindings WHERE account_id=$1 AND kernel_scope=$2', [accountId, `opportunity:${round.id}`])).rows[0]?.principal_id ?? null, 'read');
    });
    const resolvePrincipal = async (accountId, roundKey, provenance) => principal(accountId, roundKey, provenance);
    const adapters = createOpportunityJourneyAdapters({ store: kernel, opportunity, futureRounds: settings.futureRounds,
        principal: resolvePrincipal, accountForPrincipal: id => db.accountForPrincipal(id), persistence,
        correspondence: services.correspondence.store, decisionProject: source => db.project(source, 'decision'), integrityKey: settings.integrityKey, lock });
    const claims = createContributorClaimsService({ enabled: true, futureRounds: settings.futureRounds, opportunity,
        resolveAccount: authenticate, resolvePrincipal: async (accountId, roundKey, provenance) => {
            // The request resolver below remembers only this request's current session.
            // Durable authority still lives in accounts.resolveKernelPrincipal and its FK.
            return resolvePrincipal(accountId, roundKey, provenance);
        } });
    const submissions = new SubmissionService({ claims: adapters.claims, kernel: adapters.submission, persistence });
    const binding = async (account, target) => {
        const row = await adapters.load(target.reservationId, target.taskId), task = await db.task(target.taskId);
        if (!row || !task || ![row.owner, task.requester_account_id].includes(account.accountId))
            return null;
        return { requesterAccountId: task.requester_account_id, contributorAccountId: row.owner, contributorPrincipalId: row.claim.contributor_token_id };
    };
    const review = new ReviewService({ authenticate, binding, kernel: adapters.review,
        clarification: createCorrespondenceReviewPort({ store: services.correspondence.store, projectId: source => db.project(source, 'clarification'), integrityKey: settings.integrityKey }),
        fulfillment: async (handoff) => ({ ...handoff, state: 'not_observed', verifierVersion: 'canonical-settlement-not-configured/v1' }) });
    const works = {
        async read(workId) {
            const link = await db.work(workId);
            if (!link)
                return null;
            const source = await adapters.review.read({ taskId: link.task_id, reservationId: link.reservation_id });
            const row = await adapters.load(link.reservation_id, link.task_id);
            if (!source?.aggregate.obligation || !source.aggregate.verdict || !source.aggregate.submission || !row || row.owner !== link.account_id)
                return null;
            const profile = await db.profileForAccount(row.owner);
            if (!profile)
                return null;
            const b = { workId, accountId: row.owner, profileId: profile.profileId,
                contributorPrincipalId: row.principal.id, contributorPublicId: row.principal.publicId, taskId: row.id, reservationId: row.claim.id,
                submissionId: source.aggregate.submission.id, obligationId: source.aggregate.obligation.id, verdictId: source.aggregate.verdict.id,
                termsVersion: source.aggregate.submission.termsVersion, artifactDigestSha256: source.aggregate.submission.artifact.digestSha256,
                authorizedSourceSha256: null, authorizedDestinationSha256: null, evidenceClass: 'owner_qa' };
            return { authorityFamily: 'opportunity', binding: b, aggregate: source.aggregate,
                claimPrincipal: { taskId: row.id, reservationId: row.claim.id, contributorPrincipalId: row.principal.id,
                    contributorPublicId: row.principal.publicId, provenance: row.round.provenance } };
        },
    };
    const consents = createPostgresConsentedSummaryStore(pool);
    const summaries = { read: async (workId) => kernel.withOpportunityClient(async (client) => (await client.query('SELECT record FROM journey_approved_summaries WHERE work_id=$1', [workId])).rows[0]?.record ?? null, 'read') };
    const showcase = createShowcaseService({ works, summaries, profiles: { read: id => db.profile(id) }, consents,
        settlements: { qualify: async () => ({ qualified: false, reason: 'missing_settlement' }) }, mode: 'staging', stagingReadEnabled: true });
    const discussions = createDiscussionService({ enabled: true, authenticate,
        tasks: {
            forAccount: async (taskId, account) => {
                const task = await db.task(taskId);
                if (!task)
                    return null;
                const owned = await kernel.withOpportunityClient(async (client) => (await client.query(`SELECT c.id FROM opportunity_claims c JOIN journey_account_kernel_bindings b ON b.principal_id=c.contributor_token_id
          JOIN opportunity_offers f ON f.id=c.offer_id JOIN opportunity_rounds r ON r.id=c.round_id
          WHERE b.account_id=$1 AND r.round_key || ':' || f.offer_key=$2 LIMIT 1`, [account.accountId, taskId])).rows.length > 0, 'read');
                const requester = task.requester_account_id === account.accountId;
                return owned || requester ? { taskId, projectId: task.discussion_project_id, canRead: true, canPost: true, canModerate: requester, publicDiscussionEnabled: task.public_discussion } : null;
            },
            forPublic: async (taskId) => { const task = await db.task(taskId); return task ? { taskId, projectId: task.discussion_project_id, publicDiscussionEnabled: task.public_discussion } : null; },
        },
        profiles: { publicProfile: async (accountId) => { const result = await db.profileForAccount(accountId), p = result?.publication; return p?.visible ? { profileId: p.profileId, displayName: p.displayName, visibilityConsentVersion: String(p.consentVersion) } : null; } },
        contentPolicy: { check: async (text, audience) => safeText(text, audience) &&
                !/\b(?:acs|acr|ew-private)_[A-Za-z0-9_-]{16,}/.test(text) &&
                (audience !== 'public' || !/\b(?:acc|ses|ctr|tok|clm|sub|obl)_[A-Za-z0-9_-]{8,}|sha256:[a-f0-9]{64}/.test(text)) ? 'allow' : 'refuse' },
        journal: createCorrespondenceJournal(services.correspondence.store, lock), cursorKey: Buffer.from(settings.cursorKey, 'hex') });
    const referralStore = createPostgresReferralPorts(kernel);
    const visitorCookie = '__Host-neo_journey_visit';
    const visitorId = (context) => {
        const raw = context instanceof globalThis.Request ? context.headers.get('cookie') : context.header('cookie');
        const items = (raw ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(visitorCookie + '='));
        if (items.length !== 1)
            return null;
        const value = items[0].slice(visitorCookie.length + 1), match = /^(visit_[a-f0-9]{48})\.([a-f0-9]{64})$/.exec(value);
        if (!match)
            return null;
        const expected = createHmac('sha256', settings.integrityKey).update(match[1]).digest('hex');
        return timingSafeEqual(Buffer.from(expected), Buffer.from(match[2])) ? match[1] : null;
    };
    const resolveVisitor = async (context) => {
        const id = visitorId(context);
        if (!id)
            return null;
        const account = await authenticate(context);
        return { visitorRef: id, accountId: account?.accountId ?? null, requestRef: hashRequest({ visitor: id, method: context.method,
                path: context instanceof globalThis.Request ? new URL(context.url).pathname : context.originalUrl }) };
    };
    const publishedSource = async (source) => {
        if (source.kind === 'showcase') {
            const view = await showcase.readPublished(source.id), work = await works.read(source.id), consent = await consents.read(source.id), approved = await summaries.read(source.id);
            if (!view.ok || !work || !consent || !approved)
                return { state: 'withdrawn' };
            return { state: 'published', source: { kind: 'showcase', sourceId: source.id, version: String(consent.version), ownerAccountId: work.binding.accountId,
                    workRef: work.binding.workId, artifactDigest: work.binding.artifactDigestSha256, acceptanceRef: work.binding.obligationId,
                    consentVersion: hashRequest({ consent, profile: await db.profile(work.binding.profileId) }), publicationExpiresAt: new Date(Date.parse(approved.approvedAt) + 30 * 86400000).toISOString(),
                    title: 'Useful contributed work', summary: view.value.summary, evidence: view.value.evidenceDescription } };
        }
        // A public discussion post needs an independently accepted-work/author join.
        const tasks = await kernel.withOpportunityClient(client => client.query('SELECT task_id FROM journey_task_links WHERE public_discussion=TRUE'), 'read');
        for (const task of tasks.rows) {
            const page = await discussions.list(task.task_id, null, { limit: 100 });
            if (!page.ok)
                continue;
            const post = page.value.items.find(item => item.kind === 'post' && item.postId === source.id);
            if (!post || post.kind !== 'post' || !post.author)
                continue;
            const links = await kernel.withOpportunityClient(client => client.query(`SELECT w.work_id FROM journey_work_links w JOIN journey_accounts a ON a.id=w.account_id
        WHERE w.task_id=$1 AND a.public_profile_id=$2`, [task.task_id, post.author.profileId]), 'read');
            for (const link of links.rows) {
                const work = await works.read(link.work_id);
                if (!work)
                    continue;
                return { state: 'published', source: { kind: 'discussion', sourceId: source.id, version: String(post.version), ownerAccountId: work.binding.accountId,
                        workRef: work.binding.workId, artifactDigest: work.binding.artifactDigestSha256, acceptanceRef: work.binding.obligationId,
                        consentVersion: hashRequest({ post, profile: await db.profile(work.binding.profileId) }), publicationExpiresAt: new Date(Date.parse(post.createdAt) + 30 * 86400000).toISOString(),
                        title: 'A useful work discussion', summary: post.body, evidence: null } };
            }
        }
        return { state: 'withdrawn' };
    };
    const referral = createReferralService({ resolveAccount: context => authenticate(context), readPublishedSource: publishedSource,
        ...referralStore, resolveVisitor: context => resolveVisitor(context), classify: async () => ({ cohort: 'owner_qa', relation: 'unknown' }),
        readMilestone: async (stage, evidenceRef) => {
            if (stage !== 'qualified_signup' || !evidenceRef.startsWith('signup:'))
                return null;
            const id = evidenceRef.slice(7);
            const row = await kernel.withOpportunityClient(async (client) => (await client.query(`SELECT a.id,a.created_at,v.visitor_ref FROM journey_accounts a
        JOIN journey_visitors v ON v.account_id=a.id WHERE a.id=$1`, [id])).rows[0] ?? null, 'read');
            return row ? { stage, evidenceRef, accountId: id, visitorRef: row.visitor_ref, occurredAt: row.created_at.toISOString(), qualificationVersion: 'durable-password-account:v1', acceptedWorkRefs: [] } : null;
        } }, { enabled: true, publicOrigin: settings.origin, sharePath: '/contribute/' });
    const retainArrival = async (request, event) => {
        const visitor = await resolveVisitor(request);
        if (!visitor || visitor.visitorRef !== event.visitorRef)
            throw new Error('arrival context mismatch');
        await kernel.withOpportunityClient(async (client) => { await client.query('UPDATE journey_visitors SET arrival_event_id=$2 WHERE visitor_ref=$1', [visitor.visitorRef, event.eventId]); }, 'idempotent');
    };
    const bridge = (handler) => async (req, res, next) => {
        try {
            const answer = await handler(fetchRequest(req));
            for (const [key, value] of answer.headers)
                res.setHeader(key, value);
            res.status(answer.status).send(await answer.text());
        }
        catch (error) {
            next(error);
        }
    };
    const wrap = (id, router) => ({ id, sourceCommit: RECEIVED_MODULE_COMMITS[id], evidence: 'installed', createRouter: () => router, checkReady: () => kernel.checkReady() });
    const accountRouter = createAccountRouter(accounts, { browserOrigin: settings.origin, afterReceipt: async (req, receipt) => {
            const visitor = req.journeyVisitor;
            if (!visitor || !(req.path === '/signup' || req.path === '/readback' && req.body?.operation === 'signup'))
                return;
            await kernel.withOpportunityClient(async (client) => { await client.query('UPDATE journey_visitors SET account_id=$2 WHERE visitor_ref=$1 AND (account_id IS NULL OR account_id=$2)', [visitor, receipt.account.accountId]); }, 'idempotent');
            const row = await kernel.withOpportunityClient(async (client) => (await client.query('SELECT arrival_event_id FROM journey_visitors WHERE visitor_ref=$1', [visitor])).rows[0], 'read');
            if (row?.arrival_event_id) {
                const result = await referral.recordMilestone({ stage: 'qualified_signup', evidenceRef: `signup:${receipt.account.accountId}`, arrivalEventId: row.arrival_event_id });
                if (!result.ok)
                    throw new Error('signup source observation unavailable');
            }
        } });
    const modules = [wrap('account', accountRouter), wrap('claims', createContributorClaimsRouter(claims)),
        wrap('submission', createSubmissionRouter({ service: submissions, resolveAccount: authenticate, authorizeWrite: authorize, enabled: true })),
        wrap('review', bridge(createReviewHandler({ service: review, context: async (request) => ({ header: (name) => request.headers.get(name) ?? undefined }), enabled: true, basePath: config.mountPath + '/v1/review', allowedOrigins: [settings.origin] }))),
        wrap('showcase', bridge(createShowcaseHttpHandler({ service: showcase, authenticate, authorizeMutation: authorize, prefix: config.mountPath + '/v1/showcase' }))),
        wrap('discussion', createDiscussionRouter(discussions, { credential: req => req, authorizeWrite: authorize })),
        wrap('referral', bridge(createReferralHttpHandler(referral, { basePath: config.mountPath + '/v1/referral', authorizeMutation: authorize, retainArrival })))];
    const middleware = async (req, res, next) => {
        try {
            let visitor = visitorId(req);
            if (!visitor) {
                visitor = 'visit_' + randomBytes(24).toString('hex');
                const signature = createHmac('sha256', settings.integrityKey).update(visitor).digest('hex');
                res.append('Set-Cookie', `${visitorCookie}=${visitor}.${signature}; Path=/; Secure; HttpOnly; SameSite=Strict`);
            }
            req.journeyVisitor = visitor;
            await kernel.withOpportunityClient(async (client) => { await client.query('INSERT INTO journey_visitors(visitor_ref) VALUES($1) ON CONFLICT DO NOTHING', [visitor]); }, 'idempotent');
            const account = await authenticate(req);
            if (account)
                res.setHeader('X-CJ-CSRF', csrf(account));
            if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/v1/account/') && !await authorize(req)) {
                res.status(403).json({ error: { code: 'csrf_refused' } });
                return;
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
    const extra = express.Router();
    extra.put('/v1/profile', async (req, res, next) => {
        try {
            const actor = await authenticate(req);
            if (!actor) {
                res.sendStatus(401);
                return;
            }
            res.json({ profile: await db.publishProfile(actor.accountId, req.body, req.header('idempotency-key') ?? '') });
        }
        catch (error) {
            next(error);
        }
    });
    extra.get('/v1/profile', async (req, res, next) => { try {
        const actor = await authenticate(req);
        if (!actor) {
            res.sendStatus(401);
            return;
        }
        res.json(await db.profileForAccount(actor.accountId));
    }
    catch (error) {
        next(error);
    } });
    extra.post('/v1/claims/binding', async (req, res, next) => {
        try {
            const roundKey = z.object({ roundKey: z.string() }).strict().parse(req.body).roundKey;
            if (!settings.futureRounds.some(round => round.roundKey === roundKey)) {
                res.sendStatus(404);
                return;
            }
            const round = await db.round(roundKey);
            const result = await accounts.resolveKernelPrincipal(token(req), `opportunity:${round?.id}`);
            if (!result.ok) {
                res.status(result.error.status).json({ error: result.error });
                return;
            }
            res.json({ bound: true });
        }
        catch (error) {
            next(error);
        }
    });
    extra.get('/v1/work', async (req, res, next) => {
        try {
            const target = z.object({ taskId: z.string(), reservationId: z.string() }).strict().parse(req.query), actor = await authenticate(req);
            if (!actor || !await binding(actor, target)) {
                res.sendStatus(403);
                return;
            }
            const source = await adapters.review.read(target), row = await adapters.load(target.reservationId, target.taskId);
            if (!source?.aggregate.obligation || !row) {
                res.sendStatus(404);
                return;
            }
            res.json({ workId: await db.workId(target.taskId, target.reservationId, row.owner), source: sourceOfSafe(source, target), kernelObligationMinted: false });
        }
        catch (error) {
            next(error);
        }
    });
    extra.post('/v1/review/summary', async (req, res, next) => {
        try {
            const input = z.object({ workId: z.string(), summary: z.string().min(1).max(800), evidenceDescription: z.string().min(1).max(400) }).strict().parse(req.body);
            const actor = await authenticate(req), work = await works.read(input.workId), task = work && await db.task(work.binding.taskId);
            if (!actor || !work || task?.requester_account_id !== actor.accountId) {
                res.sendStatus(403);
                return;
            }
            if (!safeText(input.summary, 'public') || !safeText(input.evidenceDescription, 'public')) {
                res.sendStatus(422);
                return;
            }
            const { workId, taskId, reservationId, submissionId, obligationId, verdictId, termsVersion, artifactDigestSha256, accountId, profileId } = work.binding;
            const approved = { workId, taskId, reservationId, submissionId, obligationId, verdictId, termsVersion, artifactDigestSha256, accountId, profileId,
                approvalId: 'approval_' + hashRequest(input).slice(0, 32), approvalSource: 'requester_review', approvedAt: new Date().toISOString(), summary: input.summary, evidenceDescription: input.evidenceDescription };
            await kernel.withOpportunityClient(async (client) => {
                const old = (await client.query('SELECT request_hash FROM journey_approved_summaries WHERE work_id=$1', [workId])).rows[0];
                if (old && old.request_hash !== hashRequest(input))
                    throw new Error('approved summary immutable');
                await client.query('INSERT INTO journey_approved_summaries(work_id,record,request_hash,requester_account_id) VALUES($1,$2,$3,$4) ON CONFLICT(work_id) DO NOTHING', [workId, approved, hashRequest(input), actor.accountId]);
            }, 'idempotent');
            res.json({ approved: true });
        }
        catch (error) {
            next(error);
        }
    });
    const ports = { resolveAccount: async (req) => { const actor = await authenticate(req); return actor ? { ok: true, value: actor } : { ok: false, code: 'unauthenticated' }; } };
    return { modules, middleware, extra, ports, accounts, claims, submissions, review, showcase, discussions, referral, referralStore, db, adapters, opportunity, works, consents };
}
import { sourceOf as sourceOfSafe } from './review/validation.js';
//# sourceMappingURL=installed.js.map