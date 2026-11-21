import { ERROR_CODES, NULL_PAYOUT_ADAPTER, OBLIGATION_ADAPTER, OBLIGATION_KIND, TERMS_VERSION_RE, } from "./constants.js";
import { deskError } from "./errors.js";
import { isPlainObject } from "./honesty.js";
function moneyFlag(value) {
    if (value === true)
        return true;
    if (value === false)
        return false;
    return undefined;
}
function rejectPaidSettled(source, path) {
    if (!isPlainObject(source))
        return;
    if (moneyFlag(source.paid) === true || moneyFlag(source.settled) === true) {
        throw deskError(ERROR_CODES.PAID_SETTLED_PROJECTION_REJECTED, "desk must not project paid or settled from F01 accept; owed is an IOU on the null rail", { path, paid: source.paid, settled: source.settled });
    }
    if (source.paying === true || source.sale === true) {
        throw deskError(ERROR_CODES.PAID_SETTLED_PROJECTION_REJECTED, "desk must not project a paying rail or sale from F01 accept", { path });
    }
}
function requireObligationTermsVersion(value) {
    if (typeof value === "number") {
        throw deskError(ERROR_CODES.INTEGER_TERMS_VERSION, "integer obligation.termsVersion is rejected; current I01 contract uses sha256:<64 lowercase hex>", { termsVersion: value });
    }
    if (typeof value !== "string" || !TERMS_VERSION_RE.test(value)) {
        throw deskError(ERROR_CODES.INVALID_INPUT, "current obligation contract requires termsVersion sha256:<64 lowercase hex>", { termsVersion: value });
    }
    return value;
}
function nonemptyState(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
/**
 * Payout documents must carry an explicit payoutState. Missing, blank, or
 * object-only bodies are unknown. They are never owed.
 */
export function readExplicitPayoutState(payoutBody) {
    if (!isPlainObject(payoutBody)) {
        throw deskError(ERROR_CODES.EMPTY_PAYOUT_NOT_OWED, "empty payout projection cannot mean owed", { payoutBody });
    }
    const recon = isPlainObject(payoutBody.reconciliation) ? payoutBody.reconciliation : null;
    const state = nonemptyState(payoutBody.payoutState) ?? nonemptyState(recon?.payoutState);
    if (state == null) {
        throw deskError(ERROR_CODES.EMPTY_PAYOUT_NOT_OWED, "empty payout projection cannot mean owed", { payoutState: payoutBody.payoutState });
    }
    return state;
}
/**
 * F02 INTEROP + current I01 Obligation: accept creates owed_record with
 * termsVersion. Paid/settled claims are refused. Empty payout is handled by
 * readExplicitPayoutState, not by this accept projector.
 */
export function projectAccept(acceptBody) {
    if (!isPlainObject(acceptBody)) {
        throw deskError(ERROR_CODES.INVALID_INPUT, "F01 accept body must be an object");
    }
    rejectPaidSettled(acceptBody, "accept");
    const obligation = acceptBody.obligation;
    if (!isPlainObject(obligation)) {
        throw deskError(ERROR_CODES.INVALID_INPUT, "F01 accept must include obligation");
    }
    rejectPaidSettled(obligation, "accept.obligation");
    if (obligation.kind !== OBLIGATION_KIND) {
        throw deskError(ERROR_CODES.INVALID_INPUT, "obligation.kind must be owed_record", {
            kind: obligation.kind,
        });
    }
    if (obligation.payoutState !== "owed") {
        throw deskError(ERROR_CODES.PAID_SETTLED_PROJECTION_REJECTED, "accept obligation must stay payoutState=owed", {
            payoutState: obligation.payoutState,
        });
    }
    if (obligation.transfer !== null) {
        throw deskError(ERROR_CODES.PAID_SETTLED_PROJECTION_REJECTED, "prototype rail transfer must be null", { transfer: obligation.transfer });
    }
    const obligationTermsVersion = requireObligationTermsVersion(obligation.termsVersion);
    const task = isPlainObject(acceptBody.task) ? acceptBody.task : null;
    if (task) {
        rejectPaidSettled(task, "accept.task");
        const taskTerms = nonemptyState(task.termsVersion);
        if (taskTerms) {
            const bound = requireObligationTermsVersion(taskTerms);
            if (bound !== obligationTermsVersion) {
                throw deskError(ERROR_CODES.TERMS_VERSION_MISMATCH, "obligation.termsVersion must match the I01 task termsVersion; unlike W3/disclosure hashes stay separate", { obligationTermsVersion, taskTermsVersion: bound });
            }
        }
    }
    return {
        accepted: true,
        paid: false,
        settled: false,
        transfer: null,
        payoutState: "owed",
        obligationKind: OBLIGATION_KIND,
        obligationAdapter: typeof obligation.adapter === "string" ? obligation.adapter : OBLIGATION_ADAPTER,
        obligationId: typeof obligation.id === "string" ? obligation.id : null,
        obligationTermsVersion,
        payoutAdapter: NULL_PAYOUT_ADAPTER,
        nextAction: "wait_owed",
    };
}
export function projectPayout(payoutBody) {
    if (!isPlainObject(payoutBody)) {
        throw deskError(ERROR_CODES.EMPTY_PAYOUT_NOT_OWED, "empty payout projection cannot mean owed");
    }
    rejectPaidSettled(payoutBody, "payout");
    const recon = isPlainObject(payoutBody.reconciliation) ? payoutBody.reconciliation : payoutBody;
    rejectPaidSettled(recon, "payout.reconciliation");
    if (recon.transfer !== undefined && recon.transfer !== null) {
        throw deskError(ERROR_CODES.PAID_SETTLED_PROJECTION_REJECTED, "payout transfer must be null");
    }
    const payoutState = readExplicitPayoutState(payoutBody);
    return {
        paid: false,
        settled: false,
        transfer: null,
        paying: false,
        payoutState,
    };
}
export function refuseLlmVerdictAsPayout(verdict) {
    throw deskError(ERROR_CODES.LLM_VERDICT_NOT_PAYOUT_AUTHORITY, "LLM/verifier verdict is not payout authority; only requester owner-bearer POST /accept creates owed", { verdict });
}
//# sourceMappingURL=projection.js.map