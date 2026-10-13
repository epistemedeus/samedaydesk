import { CONSENT_VERSION, VERIFIER_VERSION } from "./types.js";
import { consentRecordValid, digestText, exactKeys, isRecord, nonnegative, operationValid, privateId, profileValid, publicId, sha256, summaryDigest, summaryValid, timestamp } from "./validation.js";
import { acceptedWorkValid } from "./work-source.js";
const fail = (code) => ({ ok: false, code });
const success = (value) => ({ ok: true, value });
const readback = (record) => ({
    version: record?.version ?? 0, visibility: record?.visibility ?? "private", includePaidBadge: record?.includePaidBadge ?? false,
});
export function createShowcaseService(deps) {
    const now = deps.clock ?? (() => new Date());
    const production = deps.mode === "production";
    const publicEnabled = production ? deps.publicEnabled === true : deps.stagingReadEnabled === true;
    function authenticated(account) {
        if (!isRecord(account) || !privateId(account.accountId) || !privateId(account.sessionId) ||
            !timestamp(account.authTime) || !timestamp(account.expiresAt))
            return false;
        const time = now().getTime();
        return Number.isFinite(time) && Date.parse(account.authTime) <= time && Date.parse(account.expiresAt) > time &&
            Date.parse(account.expiresAt) > Date.parse(account.authTime);
    }
    async function readConsent(workId) {
        const record = await deps.consents.read(workId);
        if (record !== null && (!consentRecordValid(record) || record.workId !== workId))
            throw new Error("invalid consent storage");
        return record;
    }
    async function material(workId, accountId) {
        const work = await deps.works.read(workId);
        if (!work || work.binding?.workId !== workId || (accountId !== undefined && work.binding?.accountId !== accountId))
            return fail("not_found");
        if (!acceptedWorkValid(work, workId))
            return fail("not_accepted");
        if (production && work.aggregate.task.provenance !== "production")
            return fail("not_accepted");
        const summary = await deps.summaries.read(workId);
        if (!summary || !summaryValid(summary, work))
            return fail("content_unavailable");
        const profile = await deps.profiles.read(work.binding.profileId);
        if (!profile || !profileValid(profile, work))
            return fail("profile_not_visible");
        return success({ work, summary, profile, digest: summaryDigest(summary, profile) });
    }
    function consentMatches(record, m) {
        return !!record && record.visibility === "visible" && record.accountId === m.work.binding.accountId &&
            record.profileId === m.profile.profileId && record.profileConsentVersion === m.profile.consentVersion && record.summaryDigest === m.digest;
    }
    async function project(m, includePaidBadge) {
        const qualification = includePaidBadge ? await deps.settlements.qualify(m.work) : null;
        // Synthetic observations can exercise the private verifier, never a public paid badge.
        const qualified = qualification?.qualified === true && qualification.source === "configured_base_rpc" && production && m.work.binding.evidenceClass !== "owner_qa";
        return {
            workId: m.work.binding.workId, profileId: m.profile.profileId, displayName: m.profile.displayName,
            summary: m.summary.summary, evidenceDescription: m.summary.evidenceDescription,
            paid: qualified, provenance: m.work.aggregate.task.provenance, evidenceClass: m.work.binding.evidenceClass,
            verification: {
                verifier: "Neomorphic", version: VERIFIER_VERSION, workSource: m.work.authorityFamily === 'opportunity' ? 'opportunity_service' : "earned_work_kernel",
                settlementSource: !includePaidBadge ? "not_disclosed" : qualification?.qualified &&
                    (!production || qualification.source === 'configured_base_rpc') ? qualification.source : "not_qualified",
                independentVerification: false,
            },
        };
    }
    function proofFence(view, observed, current) {
        return observed.canonicalRevision === current.canonicalRevision ? view : { ...view, paid: false,
            evidenceClass: current.binding.evidenceClass, verification: { ...view.verification, settlementSource: 'not_qualified' } };
    }
    async function outcome(account, workId, key, expectedHash, recovered = false) {
        const operation = await deps.consents.readOperation(account.accountId, workId, key);
        if (!operation)
            return fail("unknown_outcome");
        if (!operationValid(operation) || operation.workId !== workId || operation.accountId !== account.accountId || operation.idempotencyKey !== key)
            return fail("unavailable");
        if (expectedHash && operation.requestHash !== expectedHash)
            return fail("idempotency_conflict");
        const record = await readConsent(workId);
        if (!record || record.accountId !== account.accountId || record.version < operation.resultVersion)
            return fail("unavailable");
        return success({ replayed: true, recovered, operationVersion: operation.resultVersion, current: readback(record) });
    }
    async function apply(account, record, key, expectedVersion, requestHash) {
        try {
            const result = await deps.consents.apply({ record, idempotencyKey: key, expectedVersion, requestHash });
            if (result.kind === "forbidden")
                return fail("not_found");
            if (result.kind === "conflict" || result.kind === "idempotency_conflict")
                return fail(result.kind);
            const current = await readConsent(record.workId);
            if (!operationValid(result.operation) || result.operation.accountId !== account.accountId || result.operation.workId !== record.workId ||
                result.operation.idempotencyKey !== key || result.operation.requestHash !== requestHash || !current ||
                current.accountId !== account.accountId || current.version < result.operation.resultVersion)
                return fail("unknown_outcome");
            return success({ replayed: result.kind === "replayed", recovered: false, operationVersion: result.operation.resultVersion, current: readback(current) });
        }
        catch {
            // One readback, no automatic mutation replay. A lost response may already be committed.
            try {
                return await outcome(account, record.workId, key, requestHash, true);
            }
            catch {
                return fail("unknown_outcome");
            }
        }
    }
    async function replayIfKnown(account, workId, key, requestHash) {
        const operation = await deps.consents.readOperation(account.accountId, workId, key);
        return operation ? outcome(account, workId, key, requestHash) : null;
    }
    async function readPublishedSnapshot(workId) {
        if (!publicEnabled)
            return fail("disabled");
        if (!publicId(workId))
            return fail("not_found");
        try {
            const record = await readConsent(workId);
            if (!record || record.visibility !== "visible")
                return fail("not_found");
            const m = await material(workId);
            if (!m.ok || !consentMatches(record, m.value))
                return fail("not_found");
            const view = await project(m.value, record.includePaidBadge);
            // Recheck after potentially slow proof reads: concurrent withdrawal must not release a stale view.
            const latest = await material(workId);
            const current = await readConsent(workId);
            if (!current || current.version !== record.version || !latest.ok || !consentMatches(current, latest.value))
                return fail("not_found");
            return success({ view: proofFence(view, m.value.work, latest.value.work), version: record.version });
        }
        catch {
            return fail("unavailable");
        }
    }
    async function readPublished(workId) {
        const result = await readPublishedSnapshot(workId);
        return result.ok ? success(result.value.view) : result;
    }
    return {
        async preview(account, workId) {
            if (!authenticated(account))
                return fail("unauthenticated");
            if (!publicId(workId))
                return fail("invalid_input");
            try {
                const m = await material(workId, account.accountId);
                if (!m.ok)
                    return m;
                const record = await readConsent(workId);
                if (record && record.accountId !== account.accountId)
                    return fail("not_found");
                const candidate = await project(m.value, record?.includePaidBadge ?? true);
                const latest = await material(workId, account.accountId), current = await readConsent(workId);
                if (!latest.ok || latest.value.digest !== m.value.digest || (current?.version ?? 0) !== (record?.version ?? 0))
                    return fail('content_unavailable');
                return success({ consent: readback(record), summaryDigest: m.value.digest, consentVersion: CONSENT_VERSION,
                    candidate: proofFence(candidate, m.value.work, latest.value.work), publicationCurrent: consentMatches(record, m.value) });
            }
            catch {
                return fail("unavailable");
            }
        },
        async publish(account, workId, input, idempotencyKey) {
            if (!authenticated(account))
                return fail("unauthenticated");
            if (!publicId(workId) || !privateId(idempotencyKey) || !exactKeys(input, ["expectedVersion", "summaryDigest", "consentVersion", "publicationConsent", "includePaidBadge"]) ||
                !nonnegative(input.expectedVersion) || input.expectedVersion >= Number.MAX_SAFE_INTEGER || !sha256(input.summaryDigest) || input.consentVersion !== CONSENT_VERSION ||
                input.publicationConsent !== true || typeof input.includePaidBadge !== "boolean")
                return fail("invalid_input");
            const requestHash = digestText(JSON.stringify(["publish", account.accountId, workId, input.expectedVersion, input.summaryDigest, CONSENT_VERSION, input.includePaidBadge]));
            try {
                const replay = await replayIfKnown(account, workId, idempotencyKey, requestHash);
                if (replay)
                    return replay;
                const m = await material(workId, account.accountId);
                if (!m.ok)
                    return m;
                if (input.summaryDigest !== m.value.digest)
                    return fail("stale_consent");
                const record = {
                    workId, accountId: account.accountId, profileId: m.value.profile.profileId,
                    version: input.expectedVersion + 1, visibility: "visible", consentVersion: CONSENT_VERSION,
                    summaryDigest: m.value.digest, profileConsentVersion: m.value.profile.consentVersion, includePaidBadge: input.includePaidBadge,
                };
                return await apply(account, record, idempotencyKey, input.expectedVersion, requestHash);
            }
            catch {
                return fail("unavailable");
            }
        },
        async withdraw(account, workId, input, idempotencyKey) {
            if (!authenticated(account))
                return fail("unauthenticated");
            if (!publicId(workId) || !privateId(idempotencyKey) || !exactKeys(input, ["expectedVersion"]) ||
                !nonnegative(input.expectedVersion) || input.expectedVersion >= Number.MAX_SAFE_INTEGER)
                return fail("invalid_input");
            const requestHash = digestText(JSON.stringify(["withdraw", account.accountId, workId, input.expectedVersion]));
            try {
                const replay = await replayIfKnown(account, workId, idempotencyKey, requestHash);
                if (replay)
                    return replay;
                // Withdrawal works even if kernel, summary approval, profile or settlement are now unavailable.
                const record = await readConsent(workId);
                if (!record || record.accountId !== account.accountId)
                    return fail("not_found");
                return await apply(account, { ...record, version: input.expectedVersion + 1, visibility: "withdrawn", includePaidBadge: false }, idempotencyKey, input.expectedVersion, requestHash);
            }
            catch {
                return fail("unavailable");
            }
        },
        async readWriteOutcome(account, workId, idempotencyKey) {
            if (!authenticated(account))
                return fail("unauthenticated");
            if (!publicId(workId) || !privateId(idempotencyKey))
                return fail("invalid_input");
            try {
                return await outcome(account, workId, idempotencyKey);
            }
            catch {
                return fail("unknown_outcome");
            }
        },
        async readConsent(account, workId) {
            if (!authenticated(account))
                return fail("unauthenticated");
            if (!publicId(workId))
                return fail("invalid_input");
            try {
                const record = await readConsent(workId);
                if (!record || record.accountId !== account.accountId)
                    return fail("not_found");
                return success(readback(record));
            }
            catch {
                return fail("unavailable");
            }
        },
        readPublished,
        async listPublished(limit = 20) {
            if (!publicEnabled)
                return fail("disabled");
            if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 50)
                return fail("invalid_input");
            try {
                const ids = await deps.consents.listVisibleWorkIds(Number(limit));
                if (!Array.isArray(ids) || ids.length > Number(limit) || ids.some(id => !publicId(id)) || new Set(ids).size !== ids.length)
                    return fail("unavailable");
                const views = [];
                for (const id of ids) {
                    const result = await readPublishedSnapshot(id);
                    if (result.ok)
                        views.push(result.value);
                    else if (result.code === "unavailable")
                        return fail("unavailable");
                }
                // A later slow row must not keep an earlier, now-withdrawn row in the response.
                const current = await deps.consents.readMany(views.map(entry => entry.view.workId));
                if (!Array.isArray(current) || current.some(record => !consentRecordValid(record)) ||
                    new Set(current.map(record => record.workId)).size !== current.length ||
                    current.some(record => !views.some(entry => entry.view.workId === record.workId)))
                    return fail("unavailable");
                const fenced = [];
                for (const entry of views) {
                    const record = current.find(record => record.workId === entry.view.workId && record.version === entry.version && record.visibility === 'visible');
                    if (!record)
                        continue;
                    const latest = await material(entry.view.workId);
                    if (latest.ok && consentMatches(record, latest.value)) {
                        const fresh = await project(latest.value, record.includePaidBadge);
                        const consent = await readConsent(entry.view.workId), materialNow = await material(entry.view.workId);
                        if (consent?.version === record.version && materialNow.ok && consentMatches(consent, materialNow.value))
                            fenced.push(proofFence(fresh, latest.value.work, materialNow.value.work));
                    }
                }
                return success(fenced);
            }
            catch {
                return fail("unavailable");
            }
        },
    };
}
//# sourceMappingURL=service.js.map