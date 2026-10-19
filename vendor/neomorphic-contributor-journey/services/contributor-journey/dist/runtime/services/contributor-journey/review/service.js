import { hashRequest } from "../../earned-work/src/crypto.js";
import { projectAccept } from "../../../packs/requester-decision-desk/src/projection.js";
import { fail, id, key, object, ReviewError, same, source, sourceOf, handoffOf, target, text, validateEntries } from "./validation.js";
const safeCodes = new Set(["already_accepted", "artifact_changed", "terms_changed", "verdict_required", "review_evidence_required", "superseded_verdict", "idempotency_conflict", "version_conflict", "conflict", "not_found"]);
export class ReviewService {
    ports;
    clock;
    policy;
    constructor(ports) {
        this.ports = ports;
        this.clock = ports.clock ?? (() => new Date());
        this.policy = ports.policy ?? { maxRounds: 1, responseWindowSeconds: 86_400 };
        if (!Number.isInteger(this.policy.maxRounds) || this.policy.maxRounds < 1 || this.policy.maxRounds > 3 || !Number.isInteger(this.policy.responseWindowSeconds) || this.policy.responseWindowSeconds < 60 || this.policy.responseWindowSeconds > 604_800)
            throw new Error("Review clarification policy is out of bounds");
    }
    async result(run) {
        try {
            return { ok: true, value: await run() };
        }
        catch (error) {
            if (error instanceof ReviewError)
                return { ok: false, status: error.status, code: error.code, message: error.message };
            // Provider/SQL/auth exception text may contain private state or credentials.
            const e = error;
            if (safeCodes.has(e?.code ?? ""))
                return { ok: false, status: e.status === 404 ? 404 : 409, code: e.code, message: "The review changed. Reload its authoritative status." };
            return { ok: false, status: 503, code: "unavailable", message: "Review status is unavailable. Retry with the same reference and key." };
        }
    }
    async load(context, expected, presented) {
        const account = await this.ports.authenticate(context), now = this.clock().getTime();
        if (!account || typeof account.accountId !== "string" || !account.accountId || typeof account.sessionId !== "string" || !account.sessionId || !Number.isFinite(Date.parse(account.authTime)) || Date.parse(account.authTime) > now || !Number.isFinite(Date.parse(account.expiresAt)) || Date.parse(account.expiresAt) <= now)
            fail(401, "unauthorized", "Sign in again to read this work.");
        const access = await this.ports.binding(account, expected);
        if (!access || typeof access.requesterAccountId !== "string" || !access.requesterAccountId || (access.contributorAccountId === null ? access.receiving !== "root_mediated_external_report_v1" : typeof access.contributorAccountId !== "string" || !access.contributorAccountId) || typeof access.contributorPrincipalId !== "string" || !access.contributorPrincipalId || ![access.requesterAccountId, access.contributorAccountId].includes(account.accountId))
            fail(403, "forbidden", "This work is private to its contributor and requester.");
        const viewer = account.accountId === access.requesterAccountId && account.accountId !== access.contributorAccountId ? "requester" : "contributor";
        const record = await this.ports.kernel.read(expected);
        if (!record)
            fail(404, "not_found", "Submitted work was not found.");
        const bound = sourceOf(record, expected);
        if (presented && !same(presented, bound))
            fail(409, "stale_source", "Reload the exact submitted artifact and terms before reviewing.");
        if (record.aggregate.reservation?.status === "released") {
            try {
                text(record.rejection?.reason);
                if (!Number.isFinite(Date.parse(record.rejection?.decidedAt ?? "")))
                    throw new Error();
            }
            catch {
                fail(503, "decision_unknown", "The rejection needs an authoritative decision readback.");
            }
        }
        const handoff = handoffOf(record, bound);
        if (handoff) {
            // Reuse the existing requester-decision projection. Never infer paid from accept.
            try {
                if (record.authority?.family !== 'opportunity')
                    projectAccept({ obligation: record.aggregate.obligation });
            }
            catch {
                fail(503, "obligation_unknown", "The earned obligation could not be verified.");
            }
        }
        const entries = await this.ports.clarification.read(bound);
        validateEntries(entries, bound, access, this.policy.maxRounds);
        return { account, access, viewer, record, bound, entries, handoff };
    }
    requester(l) { if (l.viewer !== "requester")
        fail(403, "requester_required", "Only the bound requester can decide this work."); }
    open(l) {
        if (l.handoff || l.record.aggregate.reservation?.status !== "submitted" || l.record.aggregate.task.lifecycle === "rejected")
            fail(409, "review_closed", "This work already has a final decision.");
    }
    async view(l) {
        const question = [...l.entries].reverse().find(e => e.kind === "request") ?? null;
        const last = l.entries.at(-1), response = last && last.kind !== "request" ? last : null;
        const expired = !!question && !response && Date.parse(question.deadline) <= this.clock().getTime();
        const rejected = l.record.aggregate.reservation?.status === "released";
        const roundsUsed = l.entries.filter(e => e.kind === "request").length;
        let fulfillment = { state: "none", paid: false };
        if (l.handoff) {
            try {
                const observed = await this.ports.fulfillment(l.handoff);
                const joined = { taskId: observed.taskId, reservationId: observed.reservationId, workId: observed.workId, obligationId: observed.obligationId, termsVersion: observed.termsVersion, verdictId: observed.verdictId };
                if (!same(joined, l.handoff) || !["not_observed", "pending", "verified_paid", "failed", "unknown"].includes(observed.state) || typeof observed.verifierVersion !== "string" || !observed.verifierVersion.trim())
                    fail(503, "fulfillment_invalid", "Fulfillment evidence does not match this obligation.");
                const transfer = observed.transactionHash === undefined ? {} : { transactionHash: observed.transactionHash, logIndex: observed.logIndex, receiptId: observed.receiptId };
                if (observed.transactionHash !== undefined && (observed.state !== "verified_paid" || !/^0x[a-f0-9]{64}$/.test(observed.transactionHash) || !Number.isSafeInteger(observed.logIndex) || observed.logIndex < 0 || !/^[a-f0-9]{64}$/.test(observed.receiptId ?? '')))
                    fail(503, "fulfillment_invalid", "Fulfillment evidence does not match this obligation.");
                fulfillment = { state: observed.state, paid: observed.state === "verified_paid", ...transfer };
            }
            catch (error) {
                if (error instanceof ReviewError)
                    throw error;
                fulfillment = { state: "unknown", paid: false };
            }
        }
        const closed = !!l.handoff || rejected;
        return {
            source: l.bound, viewer: l.viewer,
            state: l.handoff ? "accepted" : rejected ? "rejected" : expired ? "clarification_expired" : response?.kind === "refuse" ? "clarification_refused" : response ? "clarification_answered" : question ? "clarification_requested" : "awaiting_review",
            verdict: l.record.aggregate.verdict ? { id: l.record.aggregate.verdict.id, outcome: l.record.aggregate.verdict.outcome } : null,
            decision: l.handoff ? { outcome: "accept", reason: null, decidedAt: l.record.aggregate.obligation.createdAt } : rejected ? { outcome: "reject", reason: l.record.rejection.reason, decidedAt: l.record.rejection.decidedAt } : null,
            clarification: { roundsUsed, maxRounds: this.policy.maxRounds, question: question ? { id: question.questionId, text: question.text, deadline: question.deadline } : null, response: response ? { kind: response.kind, text: response.text } : null, canRequest: !!l.access.contributorAccountId && !closed && l.viewer === "requester" && roundsUsed < this.policy.maxRounds && (!question || !!response) && response?.kind !== "refuse", canRespond: !closed && l.viewer === "contributor" && !!question && !response && !expired },
            fulfillment, handoff: l.handoff,
            nextAction: l.handoff ? "view_fulfillment" : rejected ? "choose_task" : !closed && l.viewer === "contributor" && question && !response && !expired ? "answer_clarification" : l.viewer === "requester" ? "requester_review" : "await_requester",
        };
    }
    read(context, input) {
        return this.result(async () => this.view(await this.load(context, target(input))));
    }
    verdict(context, input) {
        return this.result(async () => {
            const v = object(input, ["source", "outcome", "idempotencyKey", "reviewEvidenceRef"]), bound = source(v.source), clientKey = key(v.idempotencyKey);
            if (typeof v.outcome !== "string" || !["pass", "fail", "needs_review"].includes(v.outcome))
                fail(400, "invalid_input", "Choose a supported verdict.");
            const l = await this.load(context, bound, bound);
            this.requester(l);
            this.open(l);
            const reviewEvidenceRef = v.reviewEvidenceRef === undefined ? undefined : text(v.reviewEvidenceRef, 300);
            if (l.access.receiving && !reviewEvidenceRef)
                fail(400, "review_evidence_required", "Record the explicit report quality review reference.");
            const k = hashRequest({ accountId: l.account.accountId, action: "verdict", clientKey });
            let written;
            try {
                written = await this.ports.kernel.verdict(bound, v.outcome, k, reviewEvidenceRef);
            }
            catch (e) {
                if (safeCodes.has(e?.code ?? ""))
                    throw e;
                fail(503, "outcome_unknown", "Read status, then retry this verdict with the same key.");
            }
            const after = await this.load(context, bound, bound);
            if (after.record.aggregate.verdict?.id !== written.verdictId)
                fail(409, "superseded_verdict", "A later verdict exists. Reload before deciding.");
            return { outcome: "recorded", view: await this.view(after) };
        });
    }
    decide(context, input) {
        return this.result(async () => {
            const v = object(input, ["source", "decision", "verdictId", "reason", "idempotencyKey"]), bound = source(v.source), clientKey = key(v.idempotencyKey);
            if (v.decision !== "accept" && v.decision !== "reject")
                fail(400, "invalid_input", "Choose accept or reject.");
            if (v.decision === "accept" && v.reason !== undefined || v.decision === "reject" && v.verdictId !== undefined)
                fail(400, "invalid_input", "Supply only the fields for this decision.");
            const verdictId = v.decision === "accept" ? id(v.verdictId) : null;
            const reason = v.decision === "reject" ? text(v.reason) : null;
            const l = await this.load(context, bound, bound);
            this.requester(l);
            if (l.handoff) {
                if (v.decision !== "accept" || verdictId !== l.handoff.verdictId)
                    fail(409, "already_accepted", "This earned obligation is already bound to its original decision.");
                return { outcome: "already_accepted", view: await this.view(l) };
            }
            if (v.decision === "reject" && l.record.aggregate.reservation?.status === "released") {
                if (reason !== l.record.rejection?.reason)
                    fail(409, "already_rejected", "The original rejection reason is already recorded.");
                return { outcome: "already_rejected", view: await this.view(l) };
            }
            this.open(l);
            if (verdictId && (l.record.aggregate.verdict?.id !== verdictId || l.record.aggregate.verdict?.outcome !== "pass"))
                fail(409, "verdict_required", "Acceptance requires the latest pass verdict on this exact artifact.");
            const k = hashRequest({ accountId: l.account.accountId, action: "decision", clientKey });
            let uncertain = false;
            try {
                if (verdictId)
                    await this.ports.kernel.accept(bound, verdictId, k);
                else
                    await this.ports.kernel.reject(bound, reason, k);
            }
            catch (e) {
                if (safeCodes.has(e?.code ?? "") && e.code !== "already_accepted")
                    throw e;
                uncertain = true;
            }
            // Authoritative readback, including after an exception. No second mutation here.
            let after;
            try {
                after = await this.load(context, bound, bound);
            }
            catch (e) {
                if (e instanceof ReviewError && [401, 403].includes(e.status))
                    throw e;
                fail(503, "outcome_unknown", "Read status before retrying this decision with the same key.");
            }
            const confirmed = verdictId ? after.handoff?.verdictId === verdictId : !after.handoff && after.record.aggregate.reservation?.status === "released";
            if (!confirmed)
                fail(503, "outcome_unknown", "The decision is not confirmed. Read status before retrying with the same key.");
            return { outcome: uncertain ? "recovered" : verdictId ? "accepted" : "rejected", view: await this.view(after) };
        });
    }
    requestClarification(context, input) {
        return this.clarify(context, input, true);
    }
    respond(context, input) {
        return this.clarify(context, input, false);
    }
    clarify(context, input, request) {
        return this.result(async () => {
            const v = object(input, request ? ["source", "text", "idempotencyKey"] : ["source", "text", "questionId", "response", "idempotencyKey"]), bound = source(v.source), clientKey = key(v.idempotencyKey), body = text(v.text);
            if (!request && v.response !== "reply" && v.response !== "refuse")
                fail(400, "invalid_input", "Choose reply or refuse.");
            const l = await this.load(context, bound, bound);
            if (request)
                this.requester(l);
            else if (l.viewer !== "contributor")
                fail(403, "contributor_required", "Only the bound contributor can answer this clarification.");
            const commandHash = hashRequest({ source: bound, accountId: l.account.accountId, kind: request ? "request" : v.response, text: body, questionId: request ? null : id(v.questionId), clientKey });
            const existing = l.entries.find(e => e.clientKey === clientKey);
            if (existing) {
                if (existing.commandHash !== commandHash)
                    fail(409, "idempotency_conflict", "This key already identifies a different clarification.");
                return { outcome: "recovered", view: await this.view(l) };
            }
            this.open(l);
            const view = await this.view(l), lastQuestion = view.clarification.question;
            if (request && !view.clarification.canRequest)
                fail(409, "clarification_limit", "Finish the current clarification or proceed to a decision.");
            if (!request && (!view.clarification.canRespond || lastQuestion?.id !== v.questionId))
                fail(409, "clarification_closed", "This clarification is expired, answered, or belongs to another source.");
            const createdAt = this.clock().toISOString();
            const entry = {
                schema: "neomorphic.review-clarification.v1", source: bound, ordinal: l.entries.length + 1, accountId: l.account.accountId,
                kind: request ? "request" : v.response, questionId: request ? `q_${commandHash.slice(0, 32)}` : lastQuestion.id,
                text: body, createdAt, deadline: request ? new Date(Date.parse(createdAt) + this.policy.responseWindowSeconds * 1000).toISOString() : lastQuestion.deadline,
                clientKey, commandHash,
            };
            let uncertain = false;
            try {
                await this.ports.clarification.append(entry);
            }
            catch (e) {
                if (safeCodes.has(e?.code ?? ""))
                    throw e;
                uncertain = true;
            }
            let after;
            try {
                after = await this.load(context, bound, bound);
            }
            catch {
                fail(503, "outcome_unknown", "Read clarification status, then retry with the same key.");
            }
            if (!after.entries.some(e => e.clientKey === clientKey && e.commandHash === commandHash))
                fail(503, "outcome_unknown", "The clarification is not confirmed. Retry with the same key after readback.");
            return { outcome: uncertain ? "recovered" : "recorded", view: await this.view(after) };
        });
    }
}
//# sourceMappingURL=service.js.map