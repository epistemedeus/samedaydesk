/**
 * Minimal adapter notes. Not a second store and not a payout mapping.
 *
 * A2A task.id is server-issued. E01 taskId and C01 room taskId are opaque
 * foreign keys of a different kernel. A local Pilot UUID is not a valid A2A
 * task id: sendMessage with a made-up taskId is TaskNotFoundError.
 *
 * E01 lifecycle is open|claimed|submitted|verified|accepted|rejected. There
 * is no canceled state. Owner POST /reject releases occupancy. That is not
 * caller-cancel of a running worker, and it is not a refund.
 *
 * C01 rooms append discussion against an opaque taskId. They do not own OS
 * processes and cannot confirm child exit.
 *
 * Mapping, if ever needed: store A2A task.id as metadata beside an existing
 * Pilot job/order id. Cancel on A2A must not call E01 reject, payout, or
 * refund unless the A2A caller is independently the E01 owner/contributor
 * for that reservation. This experiment does not wire that.
 */
export const ADAPTER = {
  a2aTaskId: "server-issued, owner-scoped by SDK InMemoryTaskStore + User.userName",
  localPilotUuid: "not interchangeable",
  e01: {
    hasCanceled: false,
    nearest: "owner reject releases occupancy; not A2A cancel",
    payout: "owed is not paid; cancel must not invent refund",
  },
  c01: {
    hasProcessCancel: false,
    nearest: "opaque taskId on a room; messages are not occupancy authority",
  },
  productionCard: "discovery only; streaming false; not used here",
};
