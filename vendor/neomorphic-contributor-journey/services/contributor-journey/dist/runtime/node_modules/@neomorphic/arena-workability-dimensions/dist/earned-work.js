import { SCHEMA_CARD_A3 } from "./constants.js";
/**
 * Map an F01 earned-work task to an A3 job card.
 * Reserved local budget is not escrowed. Walletless owed is an IOU.
 * claimAuthority stays none / auth_required — never agent from a GET 200.
 */
export function cardFromEarnedWorkTask(task) {
    const reserved = task.fundingState === "reserved";
    const occupied = task.reservation != null &&
        (task.reservation.status === "active" || task.reservation.status === "submitted");
    return {
        schema: SCHEMA_CARD_A3,
        fixtureKind: task.provenance === "production" ? undefined : task.provenance || "fixture",
        source: {
            name: "neomorphic.earned-work",
            adapter: "earned-work",
            publicGetStatus: 200,
            claimRouteUrl: `/v1/tasks/${task.id}/claims`,
            claimRouteStatus: null,
            presentedAsJobApi: true,
        },
        listing: {
            id: task.id,
            title: task.title,
            status: task.lifecycle === "open" ? "OPEN" : String(task.lifecycle || "").toUpperCase(),
            funded: reserved,
            fundingClass: reserved ? "promised" : "unfunded",
            escrowTxHash: null,
            payoutStatus: task.payoutState ?? "none",
            slotsAvailable: task.constraints?.slotLimit ?? 1,
            agentAccess: "AUTH_CLAIM",
        },
        claim: {
            available: task.lifecycle === "open" && reserved && !occupied,
            method: "POST",
            endpoint: `/v1/tasks/${task.id}/claims`,
            identityRequired: true,
            agentAccess: "AUTH_CLAIM",
        },
        assignment: {
            reserved: occupied,
            assigned: occupied,
        },
        walletlessIou: true,
    };
}
