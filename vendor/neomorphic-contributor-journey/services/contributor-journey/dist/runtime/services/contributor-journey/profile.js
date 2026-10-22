import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hashRequest } from '../earned-work/src/crypto.js';
import { readCanonicalRoundTerms } from '../earned-work/src/opportunity/terms.js';
/** One durable deployment binding in the existing account schema, never an identity/task/money ledger. */
export class JourneyAdmission {
    config;
    kernel;
    constructor(config, kernel) {
        this.config = config;
        this.kernel = kernel;
        if (!config.installed || !config.storage || config.mode === 'disabled')
            throw new Error('installed profile required');
    }
    async migrate() {
        const sql = await readFile(new URL('./migrations/002_profile.sql', import.meta.url), 'utf8');
        await this.kernel.withOpportunityClient(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended('journey-profile-migrate',229500))");
            await client.query(sql);
        }, 'idempotent');
    }
    async fingerprint() {
        const { storage, installed } = this.config;
        const database = await this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT current_database() AS name')).rows[0].name, 'read');
        const digest = (value) => createHash('sha256').update(value).digest('hex');
        return hashRequest({ profile: this.config.mode, database, storeId: installed.storeId ?? 'synthetic-staging',
            earnedWorkSchema: storage.earnedWorkSchema, correspondenceSchema: storage.correspondenceSchema, origin: installed.origin,
            keys: [installed.replayKey, installed.integrityKey, installed.cursorKey, storage.ownerToken, storage.correspondenceAdminToken].map(digest) });
    }
    /** Explicit controller enrollment; never a serving-time production fallback. */
    async enroll() {
        const fingerprint = await this.fingerprint();
        await this.kernel.withOpportunityClient(async (client) => {
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended('journey-profile-enroll',229500))");
            const prior = (await client.query('SELECT * FROM journey_deployment WHERE singleton=TRUE')).rows[0];
            if (prior) {
                if (prior.profile !== this.config.mode || prior.binding_sha256 !== fingerprint)
                    throw new Error('durable deployment binding differs; restore the enrolled store, origin and keys');
                return;
            }
            // Unmarked/staging accounts have no production admission. Do not relabel or import them.
            if (this.config.mode === 'live' && (await client.query('SELECT 1 FROM journey_accounts LIMIT 1')).rows.length)
                throw new Error('unqualified existing account store cannot be enrolled live');
            await client.query('INSERT INTO journey_deployment(singleton,profile,binding_sha256) VALUES(TRUE,$1,$2)', [this.config.mode, fingerprint]);
        }, 'idempotent');
    }
    async assertProfile() {
        const fingerprint = await this.fingerprint();
        const prior = await this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT * FROM journey_deployment WHERE singleton=TRUE')).rows[0], 'read');
        if (!prior || prior.profile !== this.config.mode || prior.binding_sha256 !== fingerprint)
            throw new Error('deployment is not enrolled for these exact store, origin and stable keys');
    }
    async round(roundKey) {
        const pin = this.config.installed.futureRounds.find(round => round.roundKey === roundKey);
        if (!pin)
            throw new Error('round is outside the selected profile');
        const source = await this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT * FROM opportunity_rounds WHERE round_key=$1 AND provenance=$2', [roundKey, pin.provenance])).rows[0], 'read');
        if (!source)
            throw new Error('selected canonical round is absent');
        readCanonicalRoundTerms(source.terms_document, source.terms_version);
        if (this.config.mode === 'live') {
            const live = pin;
            if (pin.provenance !== 'production' || source.provenance !== 'production' || source.production_admission !== true ||
                source.id !== live.roundId || source.terms_version !== live.termsVersion)
                throw new Error('selected source is not the exact admitted production round');
        }
        else if (!['test', 'fixture'].includes(source.provenance))
            throw new Error('production source cannot enter staging');
        return source;
    }
    async taskSource(taskId) {
        const parts = taskId.split(':');
        if (parts.length !== 2)
            throw new Error('exact opportunity task ID required');
        const [roundKey, offerKey] = parts;
        const round = await this.round(roundKey), pin = this.config.installed.futureRounds.find(value => value.roundKey === roundKey);
        const configured = pin.provenance === 'production' ? pin.tasks.find(task => task.offerKey === offerKey) : undefined;
        if (this.config.mode === 'live' && !configured)
            throw new Error('task is outside the selected durable bindings');
        const offer = await this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT id FROM opportunity_offers WHERE round_id=$1 AND offer_key=$2', [round.id, offerKey])).rows[0], 'read');
        if (!offer)
            throw new Error('canonical offer is absent');
        return { round, offer, configured };
    }
    async task(taskId) {
        await this.assertProfile();
        const { round, offer, configured } = await this.taskSource(taskId);
        const link = await this.kernel.withOpportunityClient(async (client) => (await client.query('SELECT l.*,a.id AS actual_requester FROM journey_task_links l JOIN journey_accounts a ON a.id=l.requester_account_id WHERE l.task_id=$1', [taskId])).rows[0], 'read');
        if (!link || link.round_key !== round.round_key || link.opportunity_round_id !== round.id || link.opportunity_offer_id !== offer.id ||
            link.terms_version !== round.terms_version || configured && (link.requester_account_id !== configured.requesterAccountId ||
            link.public_discussion !== configured.publicDiscussion))
            throw new Error('exact task/requester binding is not enrolled');
        return link;
    }
    async checkReady() {
        await this.assertProfile();
        if (this.config.mode !== 'live')
            return;
        const pins = this.config.installed.futureRounds;
        if (pins.some(pin => pin.provenance !== 'production'))
            throw new Error('live fixture refused');
        const live = pins;
        // One bounded read for the configured inventory, rather than one DB round-trip
        // per task per module health check. No cache makes revoked/changed authority live.
        const rows = await this.kernel.withOpportunityClient(async (client) => (await client.query(`
      SELECT r.id AS round_id,r.round_key,r.terms_version,r.terms_document,r.production_admission,
        f.id AS offer_id,f.offer_key,l.task_id,l.opportunity_round_id,l.opportunity_offer_id,
        l.terms_version AS linked_terms,l.requester_account_id,l.public_discussion,a.id AS actual_requester
      FROM opportunity_rounds r JOIN opportunity_offers f ON f.round_id=r.id
      LEFT JOIN journey_task_links l ON l.task_id=r.round_key || ':' || f.offer_key
      LEFT JOIN journey_accounts a ON a.id=l.requester_account_id
      WHERE r.id=ANY($1::text[]) AND r.provenance='production'`, [live.map(pin => pin.roundId)])).rows, 'read');
        for (const pin of live) {
            const source = rows.find(row => row.round_id === pin.roundId);
            if (!source)
                throw new Error('selected canonical round is absent');
            readCanonicalRoundTerms(source.terms_document, source.terms_version);
            if (source.round_key !== pin.roundKey || source.terms_version !== pin.termsVersion || source.production_admission !== true)
                throw new Error('selected source is not the exact admitted production round');
            for (const task of pin.tasks) {
                const row = rows.find(row => row.round_id === pin.roundId && row.offer_key === task.offerKey);
                if (!row || row.task_id !== `${pin.roundKey}:${task.offerKey}` || row.opportunity_round_id !== pin.roundId ||
                    row.opportunity_offer_id !== row.offer_id || row.linked_terms !== pin.termsVersion || row.requester_account_id !== task.requesterAccountId ||
                    row.actual_requester !== task.requesterAccountId || row.public_discussion !== task.publicDiscussion)
                    throw new Error('exact task/requester binding is not enrolled');
            }
        }
    }
}
//# sourceMappingURL=profile.js.map