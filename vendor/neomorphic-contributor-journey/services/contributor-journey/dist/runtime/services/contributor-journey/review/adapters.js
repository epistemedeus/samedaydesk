import { hashRequest } from "../../earned-work/src/crypto.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fail, same, sourceOf } from "./validation.js";
/** No kernel table writes: all decisions pass through the existing store. */
export function createEarnedWorkReviewPort(options) {
    const { store } = options;
    const read = async (target) => {
        const aggregate = await store.getTask(target.taskId);
        if (!aggregate?.submission)
            return null;
        let rejection = null;
        if (aggregate.reservation?.status === "released") {
            const result = await store.withOpportunityClient(client => client.query("SELECT payload, created_at FROM earned_work_events WHERE task_id = $1 AND kind = 'reject' AND payload->>'reservationId' = $2 ORDER BY sequence DESC LIMIT 1", [target.taskId, target.reservationId]), "read");
            const row = result.rows[0];
            if (row)
                rejection = { reason: row.payload.reason, decidedAt: row.created_at.toISOString() };
        }
        const artifact = await options.artifact(aggregate.submission);
        const { state, ...provided } = artifact;
        const record = { aggregate, artifactId: artifact.artifactId, rejection };
        if (state !== "submitted" || !same(provided, sourceOf(record, target)))
            fail(503, "source_invalid", "The stored artifact does not match the kernel submission.");
        return record;
    };
    const check = async (bound) => {
        const record = await read(bound);
        if (!record || !same(sourceOf(record, bound), bound))
            fail(409, "stale_source", "Reload the exact source before reviewing.");
        return record;
    };
    return {
        read,
        async verdict(bound, outcome, key) {
            await check(bound);
            const result = await store.createVerdict({ taskId: bound.taskId, reservationId: bound.reservationId, artifactDigestSha256: bound.digestSha256, outcome, verifierVersion: "neomorphic.requester-review/1", reasons: ["authenticated requester explicit verdict"], idempotencyKey: key, requestHash: hashRequest({ source: bound, outcome }) });
            return { verdictId: result.body.verdict.id };
        },
        async accept(bound, verdictId, key) {
            await check(bound);
            await store.accept({ taskId: bound.taskId, reservationId: bound.reservationId, artifactDigestSha256: bound.digestSha256, verdictId, idempotencyKey: key, requestHash: hashRequest({ source: bound, verdictId }) });
        },
        async reject(bound, reason, key) {
            const record = await check(bound);
            if (record.aggregate.reservation?.status !== "submitted")
                fail(409, "review_closed", "Only a submitted reservation can be rejected.");
            // At the pinned kernel, submission is immutable and submitted reservations
            // occupy the task, fencing terms changes. reject locks task+reservation and
            // refuses released/completed rows; a concurrent release cannot reject later work.
            await store.reject({ taskId: bound.taskId, reservationId: bound.reservationId, reason, idempotencyKey: key, requestHash: hashRequest({ source: bound, reason }) });
        },
    };
}
export const reviewProjectSummary = (source) => `review:${hashRequest(source)}`;
/** Dedicated private correspondence project per exact source. No public writer grants. */
export function createCorrespondenceReviewPort(options) {
    if (typeof options.integrityKey !== "string" || Buffer.byteLength(options.integrityKey) < 32 || Buffer.byteLength(options.integrityKey) > 1024)
        throw new Error("Review correspondence needs a stable backend integrity key");
    const signature = (entry) => createHmac("sha256", options.integrityKey).update(hashRequest(entry)).digest("hex");
    const locate = async (source) => {
        const projectId = await options.projectId(source);
        const project = await options.store.getProject(projectId);
        if (!project || project.summary !== reviewProjectSummary(source))
            fail(503, "clarification_invalid", "The private review thread does not match this source.");
        return projectId;
    };
    const read = async (source) => {
        const projectId = await locate(source);
        const rows = await options.store.listEvents({ projectId, afterSequence: 0, limit: 7 });
        if (rows.events.length > 6)
            fail(503, "clarification_invalid", "Review history exceeds its bound.");
        return rows.events.map((row, index) => {
            if (row.sequence !== index + 1 || row.projectId !== projectId || row.kind !== "correction" || !row.text || row.text.length > 8000)
                fail(503, "clarification_invalid", "Review history could not be verified.");
            try {
                const envelope = JSON.parse(row.text);
                const entry = envelope.entry;
                if (typeof envelope.signature !== "string" || !/^[a-f0-9]{64}$/.test(envelope.signature) || !timingSafeEqual(Buffer.from(envelope.signature, "hex"), Buffer.from(signature(entry), "hex")))
                    throw new Error("integrity");
                if (entry.schema !== "neomorphic.review-clarification.v1" || entry.ordinal !== row.sequence || !same(entry.source, source))
                    throw new Error("binding");
                return entry;
            }
            catch {
                fail(503, "clarification_invalid", "Review history could not be verified.");
            }
        });
    };
    return {
        read,
        async append(entry) {
            const projectId = await locate(entry.source), entries = await read(entry.source);
            const previous = entries[entry.ordinal - 1];
            if (previous && previous.commandHash !== entry.commandHash)
                fail(409, "idempotency_conflict", "This clarification round already has another command.");
            if (!previous && (entry.ordinal !== entries.length + 1 || entry.ordinal > 6))
                fail(409, "conflict", "Reload clarification status before continuing.");
            // Correspondence ordinary events do not increment project.version. The
            // existing transaction/idempotency fence on this deterministic ordinal key
            // provides the atomic single winner, across processes and after restart.
            await options.store.createEvent({ projectId, kind: "correction", text: JSON.stringify({ entry, signature: signature(entry) }), idempotencyKey: `review-${hashRequest(entry.source)}-${entry.ordinal}`, requestHash: entry.commandHash });
        },
    };
}
//# sourceMappingURL=adapters.js.map