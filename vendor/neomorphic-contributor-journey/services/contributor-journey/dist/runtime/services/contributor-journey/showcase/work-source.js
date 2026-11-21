import { createHash } from "node:crypto";
import { DECIMAL_RE } from "../../earned-work/src/decimal.js";
import { parsePgSchema, quoteIdent } from "../../earned-work/src/config.js";
import { bindingValid, digestText, isRecord, sha256, timestamp } from "./validation.js";
/** An adapter over the existing kernel, with a separately resolved private principal directory. */
export function createEarnedWorkEvidencePort(deps) {
    return {
        async read(workId) {
            const binding = await deps.bindings.read(workId);
            if (!binding || !bindingValid(binding) || binding.workId !== workId)
                return null;
            const aggregate = await deps.kernel.getTask(binding.taskId);
            const claimPrincipal = await deps.claims.read(binding.taskId, binding.reservationId);
            return aggregate && claimPrincipal ? { binding, aggregate, claimPrincipal } : null;
        },
    };
}
/** Read-only FK adapter for the existing earned-work tables, with the existing schema validator. */
export function createPostgresClaimPrincipalPort(pool, schema = "public") {
    const quoted = quoteIdent(parsePgSchema(schema));
    return {
        async read(taskId, reservationId) {
            const result = await pool.query(`SELECT r.task_id, r.id AS reservation_id, r.contributor_token_id,
        r.contributor_public_id, c.public_id, c.provenance
        FROM ${quoted}.earned_work_reservations r
        JOIN ${quoted}.earned_work_contributor_tokens c ON c.id = r.contributor_token_id
        WHERE r.task_id = $1 AND r.id = $2`, [taskId, reservationId]);
            const row = result.rows[0];
            if (!row || row.contributor_public_id !== row.public_id)
                return null;
            if (typeof row.task_id !== "string" || typeof row.reservation_id !== "string" ||
                typeof row.contributor_token_id !== "string" || typeof row.public_id !== "string" ||
                !["production", "fixture", "test"].includes(String(row.provenance)))
                return null;
            return { taskId: row.task_id, reservationId: row.reservation_id, contributorPrincipalId: row.contributor_token_id,
                contributorPublicId: row.public_id, provenance: row.provenance };
        },
    };
}
/** Validate at the receiving boundary, even if an adapter is typed. No payout/paid flags qualify work. */
export function acceptedWorkValid(value, requestedWorkId) {
    if (!isRecord(value) || !bindingValid(value.binding) || value.binding.workId !== requestedWorkId || !isRecord(value.aggregate))
        return false;
    const b = value.binding;
    const a = value.aggregate;
    const p = value.claimPrincipal;
    if (!isRecord(p) || p.taskId !== b.taskId || p.reservationId !== b.reservationId ||
        p.contributorPrincipalId !== b.contributorPrincipalId || p.contributorPublicId !== b.contributorPublicId)
        return false;
    const { task: t, reservation: r, submission: s, verdict: v, obligation: o } = a;
    if (![t, r, s, v, o].every(isRecord))
        return false;
    if (!isRecord(t) || !isRecord(r) || !isRecord(s) || !isRecord(v) || !isRecord(o) || !isRecord(s.artifact) || !isRecord(o.reward))
        return false;
    if (value.authorityFamily === 'opportunity' && o.adapter !== 'null_nonpaying_v0')
        return false;
    if (t.id !== b.taskId || t.lifecycle !== "accepted" || !["production", "test", "fixture"].includes(String(t.provenance)) || p.provenance !== t.provenance ||
        r.id !== b.reservationId || r.taskId !== b.taskId || r.status !== "completed" || r.contributorPublicId !== b.contributorPublicId ||
        s.id !== b.submissionId || s.taskId !== b.taskId || s.reservationId !== b.reservationId ||
        v.id !== b.verdictId || v.taskId !== b.taskId || v.reservationId !== b.reservationId || v.submissionId !== b.submissionId || v.outcome !== "pass" ||
        o.id !== b.obligationId || o.kind !== "owed_record" || o.taskId !== b.taskId || o.reservationId !== b.reservationId ||
        o.submissionId !== b.submissionId || o.verdictId !== b.verdictId || o.contributorPublicId !== b.contributorPublicId)
        return false;
    if ([r, s, v, o].some(row => row.termsVersion !== b.termsVersion) ||
        s.artifact.digestSha256 !== b.artifactDigestSha256 || v.artifactDigestSha256 !== b.artifactDigestSha256 ||
        !sha256(s.artifact.digestSha256) || !Number.isSafeInteger(s.artifact.bytes) || Number(s.artifact.bytes) < 1)
        return false;
    if (a.submissionEvidenceBytes !== null && (!Buffer.isBuffer(a.submissionEvidenceBytes) ||
        a.submissionEvidenceBytes.byteLength !== s.artifact.bytes || createHash("sha256").update(a.submissionEvidenceBytes).digest("hex") !== s.artifact.digestSha256))
        return false;
    if (![s.createdAt, v.createdAt, o.createdAt].every(timestamp) ||
        Date.parse(String(v.createdAt)) < Date.parse(String(s.createdAt)) || Date.parse(String(o.createdAt)) < Date.parse(String(v.createdAt)))
        return false;
    if (typeof o.reward.amount !== "string" || o.reward.amount.length > 40 || !DECIMAL_RE.test(o.reward.amount) ||
        typeof o.reward.asset !== "string" || typeof o.reward.network !== "string")
        return false;
    // If the kernel stores a destination, the directory cannot silently substitute another one.
    if (o.payoutDestination !== null && (typeof o.payoutDestination !== "string" ||
        !/^0x[0-9a-f]{40}$/i.test(o.payoutDestination) || digestText(o.payoutDestination.toLowerCase()) !== b.authorizedDestinationSha256))
        return false;
    return true;
}
//# sourceMappingURL=work-source.js.map