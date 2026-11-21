import { ApiError } from '../../earned-work/src/errors.js';
import { hashRequest } from '../../earned-work/src/crypto.js';
import { claimInput, waitlistInput, record, exactObject, opaque, key, idempotency, taskParts, verifiedTerms, corrupt, invalid } from './validation.js';
// Old sponsored email terms are not migrated by enabling this adapter.
const legacyRounds = new Set(['agent-opportunity-221400-v1', 'contributor-reuse-trial-100198']);
const scoped = { requireScopedPrincipal: true };
const statuses = ['reserved', 'submitted', 'accepted', 'owed', 'released', 'expired'];
export class ContributorClaimsService {
    options;
    rounds;
    now;
    constructor(options) {
        this.options = options;
        this.now = options.now ?? (() => new Date());
        if (options.futureRounds.length > 16 || options.futureRounds.some(round => !key(round.roundKey) || legacyRounds.has(round.roundKey) ||
            !['test', 'fixture', 'production'].includes(round.provenance)) ||
            new Set(options.futureRounds.map(round => round.roundKey)).size !== options.futureRounds.length) {
            throw new Error('futureRounds must be a bounded unique allowlist excluding legacy rounds');
        }
        this.rounds = options.futureRounds.map(round => ({ ...round }));
    }
    list(context) {
        return this.run(async () => {
            const account = await this.account(context);
            const tasks = [];
            for (const config of this.rounds) {
                const round = await this.options.opportunity.readRound(config.roundKey, config.provenance);
                tasks.push(...this.tasks(round));
            }
            return { accountId: account.accountId, tasks };
        });
    }
    terms(context, input) {
        return this.run(async () => {
            const account = await this.account(context);
            const data = exactObject(input, ['taskId']);
            const [roundKey, offerKey] = taskParts(data.taskId);
            const config = this.config(roundKey);
            this.admitTask(data.taskId);
            const round = await this.options.opportunity.readRound(roundKey, config.provenance);
            const document = verifiedTerms(round);
            if (document.accountNative && account.accountId !== document.accountNative.requesterAccountId) {
                const principal = await this.options.resolvePrincipal(account.accountId, config.roundKey, config.provenance);
                const own = principal ? await this.options.opportunity.readOwnClaims(config.roundKey, config.provenance, principal) : [];
                if (!own.some(row => record(row) && row.offerKey === offerKey && record(row.claim) && row.claim.kind === 'owner_assigned'))
                    throw new ApiError(404, 'not_found', 'task not found');
            }
            const task = this.tasks(round).find(task => task.offerKey === offerKey);
            if (!task)
                throw new ApiError(404, 'not_found', 'task not found');
            return { task, termsId: task.termsId, termsVersion: round.termsVersion, document };
        });
    }
    claim(context, input, operationKey) {
        return this.run(async () => {
            const account = await this.account(context);
            const data = claimInput(input);
            this.admitTask(data.taskId);
            const rawKey = idempotency(operationKey);
            const [roundKey, offerKey] = taskParts(data.taskId);
            const config = this.config(roundKey);
            // The kernel checks exact terms and capacity again under its round lock.
            if (data.termsId !== this.termsId(config))
                throw new ApiError(409, 'terms_changed', 'terms reference differs');
            const principal = await this.principal(account, config);
            const receipt = await this.mutation(() => this.options.opportunity.claim(roundKey, {
                provenance: config.provenance, offerKey, termsVersion: data.termsVersion, publicLabel: 'Contributor',
            }, principal, this.operationKey(account, 'claim', rawKey), '/contribute/tasks/claims', scoped));
            return this.claimOutcome(account, config, principal, receipt.body, receipt.replayed, data.taskId);
        });
    }
    lookupClaim(context, input) {
        return this.run(async () => {
            const account = await this.account(context);
            const data = exactObject(input, ['taskId', 'reservationId']);
            const [roundKey] = taskParts(data.taskId);
            if (!opaque(data.reservationId))
                invalid();
            const config = this.config(roundKey);
            const principal = await this.principal(account, config);
            const current = await this.options.opportunity.readClaim(roundKey, data.reservationId, config.provenance, principal, false, scoped);
            const view = this.claimView(account, config, current);
            if (view.taskId !== data.taskId)
                throw new ApiError(404, 'not_found', 'claim not found for task');
            return view;
        });
    }
    mine(context) {
        return this.run(async () => {
            const account = await this.account(context);
            const claims = [];
            for (const config of this.rounds) {
                // Accounts without a round binding have no claim in that round.
                const principal = await this.options.resolvePrincipal(account.accountId, config.roundKey, config.provenance);
                if (!principal)
                    continue;
                this.checkPrincipal(principal, config);
                const current = await this.options.opportunity.readOwnClaims(config.roundKey, config.provenance, principal);
                claims.push(...current.filter(body => !this.options.taskIds || record(body) && this.options.taskIds.includes(`${config.roundKey}:${body.offerKey}`))
                    .map(body => this.claimView(account, config, body)));
            }
            return { claims };
        });
    }
    joinWaitlist(context, input, operationKey) {
        return this.run(async () => {
            const account = await this.account(context);
            const data = waitlistInput(input);
            const rawKey = idempotency(operationKey);
            const config = this.config(data.roundKey);
            const principal = await this.principal(account, config);
            await this.mutation(() => this.options.opportunity.joinWaitlist(config.roundKey, {
                provenance: config.provenance, publicLabel: 'Contributor', reason: data.reason,
            }, principal, this.operationKey(account, 'waitlist', rawKey), scoped));
            return this.waitlistView(config, principal);
        });
    }
    waitlist(context, input) {
        return this.run(async () => {
            const account = await this.account(context);
            const data = exactObject(input, ['roundKey']);
            if (!key(data.roundKey))
                invalid();
            const config = this.config(data.roundKey);
            return this.waitlistView(config, await this.principal(account, config));
        });
    }
    readOperation(context, input) {
        return this.run(async () => {
            const account = await this.account(context);
            const data = exactObject(input, ['roundKey', 'action', 'idempotencyKey']);
            if (!key(data.roundKey) || (data.action !== 'claim' && data.action !== 'waitlist'))
                invalid();
            const rawKey = idempotency(data.idempotencyKey);
            const config = this.config(data.roundKey);
            const principal = await this.principal(account, config);
            const stored = await this.options.opportunity.readClaimOperation(config.roundKey, config.provenance, principal, data.action, this.operationKey(account, data.action, rawKey));
            if (!stored)
                return { state: 'not_found' };
            if (data.action === 'waitlist')
                return { state: 'recorded', action: 'waitlist', waitlist: await this.waitlistView(config, principal) };
            return { state: 'recorded', action: 'claim', outcome: await this.claimOutcome(account, config, principal, stored.currentClaim ?? stored.body, true) };
        });
    }
    async account(context) {
        if (!this.options.enabled)
            throw new ApiError(503, 'disabled', 'journey is disabled');
        if (this.options.checkAdmission)
            await this.options.checkAdmission();
        const account = await this.options.resolveAccount(context);
        const now = this.now().getTime();
        if (!account || !opaque(account.accountId) || !opaque(account.sessionId) ||
            !Number.isFinite(Date.parse(account.authTime)) || Date.parse(account.authTime) > now ||
            !Number.isFinite(Date.parse(account.expiresAt)) || Date.parse(account.expiresAt) <= now ||
            Date.parse(account.authTime) >= Date.parse(account.expiresAt)) {
            throw new ApiError(401, 'unauthorized', 'authenticated account required');
        }
        return { accountId: account.accountId, sessionId: account.sessionId, authTime: account.authTime, expiresAt: account.expiresAt };
    }
    config(roundKey) {
        const config = this.rounds.find(round => round.roundKey === roundKey);
        if (!config)
            throw new ApiError(404, 'not_found', 'future round not found');
        return config;
    }
    admitTask(taskId) {
        if (this.options.taskIds && !this.options.taskIds.includes(String(taskId)))
            throw new ApiError(404, 'not_found', 'task is not enrolled');
    }
    termsId(config) { return `opportunity:${config.provenance}:${config.roundKey}`; }
    operationKey(account, action, raw) {
        return hashRequest({ accountId: account.accountId, action, key: raw });
    }
    async principal(account, config) {
        const principal = await this.options.resolvePrincipal(account.accountId, config.roundKey, config.provenance);
        if (!principal)
            throw new ApiError(403, 'forbidden', 'private round binding required');
        this.checkPrincipal(principal, config);
        return principal;
    }
    checkPrincipal(principal, config) {
        if (!opaque(principal.id) || principal.provenance !== config.provenance || !principal.taskScope ||
            !principal.taskScope.startsWith('opportunity:') ||
            (principal.expiresAt !== null && (!Number.isFinite(Date.parse(principal.expiresAt)) || Date.parse(principal.expiresAt) <= this.now().getTime()))) {
            throw new ApiError(403, 'forbidden', 'private round binding unavailable');
        }
    }
    tasks(round) {
        const terms = verifiedTerms(round);
        const config = this.config(round.roundKey);
        if (round.provenance !== config.provenance || (round.provenance === 'production' && !round.productionAdmission))
            corrupt();
        return terms.offers.filter(offer => !this.options.taskIds || this.options.taskIds.includes(`${round.roundKey}:${offer.offerKey}`)).map(offer => {
            const capacity = round.offers.find(item => item.offerKey === offer.offerKey);
            const closed = round.status !== 'open' || Date.parse(round.submissionDeadline) <= this.now().getTime();
            const slots = closed || !offer.publicClaimable || BigInt(round.availableAtomic) < BigInt(offer.rewardAtomic) ? 0 : capacity.unreservedPublicSlots;
            return { taskId: `${round.roundKey}:${offer.offerKey}`, roundKey: round.roundKey, offerKey: offer.offerKey,
                title: offer.title, summary: offer.summary, termsId: this.termsId(config), termsVersion: round.termsVersion,
                rewardAtomic: String(offer.rewardAtomic), asset: terms.asset, network: terms.network, maxEffortSeconds: offer.maxEffortSeconds,
                acceptance: offer.acceptance, evidenceKind: offer.evidenceKind, availableSlots: slots,
                availability: closed ? 'closed' : !offer.publicClaimable ? 'owner_assigned' : slots > 0 ? 'available' : 'full',
                submissionDeadline: round.submissionDeadline, rewardReserved: false };
        });
    }
    claimView(account, config, body) {
        if (!record(body) || !record(body.claim) || !key(body.offerKey))
            corrupt();
        this.admitTask(`${config.roundKey}:${body.offerKey}`);
        const claim = body.claim;
        if (!opaque(claim.id) || typeof claim.termsVersion !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(claim.termsVersion) ||
            typeof claim.status !== 'string' || !statuses.includes(claim.status) || typeof claim.expiresAt !== 'string' ||
            !Number.isFinite(Date.parse(claim.expiresAt)) || typeof claim.deferStart !== 'boolean')
            corrupt();
        const canStart = claim.status === 'reserved' && !claim.deferStart && Date.parse(claim.expiresAt) > this.now().getTime();
        return { accountId: account.accountId, taskId: `${config.roundKey}:${body.offerKey}`, roundKey: config.roundKey,
            reservationId: claim.id, termsId: this.termsId(config), termsVersion: claim.termsVersion,
            status: claim.status, expiresAt: claim.expiresAt, canStart,
            nextAction: canStart ? 'deliver' : claim.status === 'owed' ? 'await_fulfillment' :
                ['submitted', 'accepted'].includes(claim.status) ? 'await_review' : 'discover_tasks' };
    }
    async claimOutcome(account, config, principal, body, replayed, expectedTaskId) {
        if (!record(body))
            corrupt();
        if (record(body.claim)) {
            const initial = this.claimView(account, config, body);
            if (expectedTaskId && initial.taskId !== expectedTaskId)
                corrupt();
            const current = await this.options.opportunity.readClaim(config.roundKey, initial.reservationId, config.provenance, principal, false, scoped);
            const view = this.claimView(account, config, current);
            if (view.taskId !== initial.taskId || view.termsVersion !== initial.termsVersion)
                corrupt();
            return { kind: 'claimed', replayed, claim: view };
        }
        if (!record(body.error) || typeof body.error.code !== 'string' ||
            !['terms_changed', 'offer_mismatch', 'late_submission', 'round_closed', 'offer_full', 'oversubscribed'].includes(body.error.code))
            corrupt();
        return { kind: 'continuation', replayed, reason: body.error.code, waitlist: await this.waitlistView(config, principal) };
    }
    async waitlistView(config, principal) {
        const entry = await this.options.opportunity.readWaitlist(config.roundKey, config.provenance, principal);
        const round = await this.options.opportunity.readRound(config.roundKey, config.provenance);
        const terms = verifiedTerms(round);
        return { roundKey: config.roundKey, waitlistId: entry?.id ?? null, joinedAt: entry?.joinedAt ?? null,
            reason: entry?.reason ?? null, fundedReservation: false, nextAction: 'check_tasks',
            availableTasks: this.tasks(round).filter(task => task.availability === 'available'),
            alternatives: terms.alternatives.map(item => ({ alternativeKey: item.alternativeKey, title: item.title, summary: item.summary, funded: false })) };
    }
    async mutation(write) {
        try {
            return await write();
        }
        catch (error) {
            if (error instanceof ApiError)
                throw error;
            throw new ApiError(503, 'outcome_unknown', 'read back the same operation');
        }
    }
    async run(operation) {
        try {
            return { ok: true, value: await operation() };
        }
        catch (error) {
            const known = ['disabled', 'unauthorized', 'invalid_input', 'not_found', 'forbidden',
                'terms_changed', 'idempotency_conflict', 'invalid_storage', 'outcome_unknown'];
            if (error instanceof ApiError && known.includes(error.code)) {
                return { ok: false, error: { code: error.code, status: error.status } };
            }
            return { ok: false, error: { code: 'unavailable', status: 503 } };
        }
    }
}
export function createContributorClaimsService(options) {
    return new ContributorClaimsService(options);
}
//# sourceMappingURL=service.js.map