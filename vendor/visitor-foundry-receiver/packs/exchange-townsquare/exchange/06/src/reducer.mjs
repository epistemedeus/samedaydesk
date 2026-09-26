import {
  PROPOSAL_STATUS,
  RESULT_DISPOSITION,
  SCHEMA,
  TASK_STATUS,
  EVENT_TYPE,
} from "./constants.mjs";
import { ERROR_CODES } from "./constants.mjs";
import { lifecycleError, validateEvent } from "./validate.mjs";

function emptyState(taskId = null) {
  return {
    schema: SCHEMA,
    taskId,
    status: TASK_STATUS.OPEN,
    boundProposalId: null,
    cancelledAt: null,
    cancelReason: null,
    proposals: {},
    results: [],
    resultIds: {},
    history: [],
    paymentActions: [],
  };
}

/**
 * Portable event reducer for cancellation, withdrawals, and late results.
 * Does not make or refund payments. Bound proposal/task identity is enforced.
 */
export function reduceLifecycle(events, { initial = null } = {}) {
  if (!Array.isArray(events)) {
    throw lifecycleError(ERROR_CODES.INVALID_INPUT, "events must be an array");
  }
  let state = initial ? structuredClone(initial) : emptyState();
  if (!state.schema) state.schema = SCHEMA;
  if (!state.proposals) state.proposals = {};
  if (!state.results) state.results = [];
  if (!state.resultIds) state.resultIds = {};
  if (!state.history) state.history = [];
  if (!state.paymentActions) state.paymentActions = [];
  if (state.boundProposalId === undefined) state.boundProposalId = null;

  for (let i = 0; i < events.length; i += 1) {
    const event = validateEvent(events[i], i);
    state = applyEvent(state, event);
    state.history = [
      ...state.history,
      { type: event.type, at: event.at, proposalId: event.proposalId, resultId: event.resultId },
    ];
  }

  return {
    ...state,
    note: "Lifecycle reducer only. No payment, refund, escrow release, or claim authority side effects.",
    consumerInstructions: [
      "1. Feed ordered lifecycle events into reduceLifecycle(events).",
      "2. Requester cancel sets task cancelled; later results → late_after_cancel.",
      "3. Only the bound proposal may produce an accepted applied result.",
      "4. payment/refund fields on events are forbidden.",
      "5. paymentActions stays empty.",
    ].join("\n"),
  };
}

function assertSameTask(state, event) {
  if (event.taskId != null && state.taskId != null && event.taskId !== state.taskId) {
    throw lifecycleError(ERROR_CODES.INVALID_INPUT, "foreign taskId rejected", {
      stateTaskId: state.taskId,
      eventTaskId: event.taskId,
    });
  }
}

function applyEvent(state, event) {
  assertSameTask(state, event);

  switch (event.type) {
    case EVENT_TYPE.TASK_OPENED:
      // Non-reviving: cancel stays cancelled.
      if (state.status === TASK_STATUS.CANCELLED) {
        return state;
      }
      if (state.taskId && event.taskId && state.taskId !== event.taskId) {
        throw lifecycleError(ERROR_CODES.INVALID_INPUT, "task_opened foreign taskId");
      }
      return {
        ...state,
        taskId: event.taskId ?? state.taskId,
        status: state.status === TASK_STATUS.OPEN ? TASK_STATUS.OPEN : state.status,
      };

    case EVENT_TYPE.PROPOSAL_SUBMITTED: {
      if (!event.proposalId) {
        throw lifecycleError(ERROR_CODES.INVALID_INPUT, "proposal_submitted requires proposalId");
      }
      if (state.status === TASK_STATUS.CANCELLED) {
        return {
          ...state,
          proposals: {
            ...state.proposals,
            [event.proposalId]: {
              id: event.proposalId,
              status: PROPOSAL_STATUS.STALE,
              submittedAt: event.at,
              withdrawnAt: null,
              staleReason: "submitted_after_cancel",
            },
          },
        };
      }
      const existing = state.proposals[event.proposalId];
      // Terminal withdrawal: withdrawn OR already-stale-from-withdraw never revive to active.
      if (
        existing?.status === PROPOSAL_STATUS.WITHDRAWN ||
        (existing?.status === PROPOSAL_STATUS.STALE &&
          (existing.staleReason === "resubmit_after_withdraw_requires_new_id" ||
            existing.withdrawnAt != null ||
            existing.terminalWithdraw === true))
      ) {
        return {
          ...state,
          proposals: {
            ...state.proposals,
            [event.proposalId]: {
              ...existing,
              status: PROPOSAL_STATUS.STALE,
              staleReason: "resubmit_after_withdraw_requires_new_id",
              terminalWithdraw: true,
              withdrawnAt: existing.withdrawnAt ?? existing.submittedAt ?? event.at,
              submittedAt: event.at,
            },
          },
        };
      }
      const nextStatus =
        state.status === TASK_STATUS.OPEN || state.status === TASK_STATUS.PROPOSAL_PENDING
          ? TASK_STATUS.PROPOSAL_PENDING
          : state.status;
      return {
        ...state,
        status: nextStatus,
        proposals: {
          ...state.proposals,
          [event.proposalId]: {
            id: event.proposalId,
            status: PROPOSAL_STATUS.ACTIVE,
            submittedAt: event.at,
            withdrawnAt: null,
            staleReason: null,
          },
        },
      };
    }

    case EVENT_TYPE.PROPOSAL_WITHDRAWN: {
      if (!event.proposalId || !state.proposals[event.proposalId]) {
        throw lifecycleError(ERROR_CODES.INVALID_INPUT, "proposal_withdrawn requires known proposalId");
      }
      const prev = state.proposals[event.proposalId];
      return {
        ...state,
        boundProposalId: state.boundProposalId === event.proposalId ? null : state.boundProposalId,
        proposals: {
          ...state.proposals,
          [event.proposalId]: {
            ...prev,
            status: PROPOSAL_STATUS.WITHDRAWN,
            withdrawnAt: event.at,
            terminalWithdraw: true,
          },
        },
      };
    }

    case EVENT_TYPE.REQUESTER_CANCELLED:
      return {
        ...state,
        status: TASK_STATUS.CANCELLED,
        cancelledAt: event.at,
        cancelReason: event.note || "requester_cancelled",
        boundProposalId: null,
        proposals: Object.fromEntries(
          Object.entries(state.proposals).map(([id, p]) => [
            id,
            p.status === PROPOSAL_STATUS.ACTIVE
              ? { ...p, status: PROPOSAL_STATUS.STALE, staleReason: "task_cancelled" }
              : p,
          ]),
        ),
      };

    case EVENT_TYPE.AGREEMENT_BOUND: {
      if (state.status === TASK_STATUS.CANCELLED) {
        return state;
      }
      if (!event.proposalId || !state.proposals[event.proposalId]) {
        throw lifecycleError(ERROR_CODES.INVALID_INPUT, "agreement_bound requires known proposalId");
      }
      const prop = state.proposals[event.proposalId];
      if (prop.status !== PROPOSAL_STATUS.ACTIVE) {
        throw lifecycleError(ERROR_CODES.INVALID_INPUT, "agreement_bound requires active proposal", {
          proposalStatus: prop.status,
        });
      }
      return {
        ...state,
        status: TASK_STATUS.AGREED,
        boundProposalId: event.proposalId,
      };
    }

    case EVENT_TYPE.RESULT_SUBMITTED: {
      const resultId = event.resultId ?? `res_${state.results.length + 1}`;
      const proposal = event.proposalId ? state.proposals[event.proposalId] : null;

      // Identity before dedup: foreign/unknown results do not poison resultId for the bound proposal.
      let earlyDisposition = null;
      if (state.status === TASK_STATUS.CANCELLED) {
        earlyDisposition = RESULT_DISPOSITION.LATE_AFTER_CANCEL;
      } else if (proposal?.status === PROPOSAL_STATUS.WITHDRAWN) {
        earlyDisposition = RESULT_DISPOSITION.LATE_AFTER_WITHDRAW;
      } else if (proposal?.status === PROPOSAL_STATUS.STALE) {
        earlyDisposition = RESULT_DISPOSITION.LATE_AFTER_CANCEL;
      } else if (!event.proposalId || !proposal) {
        earlyDisposition = RESULT_DISPOSITION.REJECTED_UNBOUND;
      } else if (state.boundProposalId && event.proposalId !== state.boundProposalId) {
        earlyDisposition = RESULT_DISPOSITION.REJECTED_UNBOUND;
      }

      if (earlyDisposition) {
        return {
          ...state,
          results: [
            ...state.results,
            {
              resultId,
              proposalId: event.proposalId,
              at: event.at,
              disposition: earlyDisposition,
              applied: false,
              dedupKey: null,
            },
          ],
          paymentActions: [],
        };
      }

      const dedupKey = `${event.proposalId}::${resultId}`;
      if (state.resultIds[dedupKey] || state.resultIds[resultId]) {
        // Deduplicate only for the same proposal identity.
        if (state.resultIds[dedupKey]) return state;
      }
      let disposition = RESULT_DISPOSITION.ACCEPTED;
      let applied = false;
      if (state.status === TASK_STATUS.AGREED && event.proposalId === state.boundProposalId) {
        disposition = RESULT_DISPOSITION.ACCEPTED;
        applied = true;
      } else {
        disposition = RESULT_DISPOSITION.ACCEPTED;
        applied = false;
      }

      let status = state.status;
      if (applied && disposition === RESULT_DISPOSITION.ACCEPTED && state.status === TASK_STATUS.AGREED) {
        status = TASK_STATUS.COMPLETED;
      }

      return {
        ...state,
        status,
        resultIds: { ...state.resultIds, [dedupKey]: true, [resultId]: true },
        results: [
          ...state.results,
          {
            resultId,
            proposalId: event.proposalId,
            at: event.at,
            disposition,
            applied,
            dedupKey,
          },
        ],
        paymentActions: [],
      };
    }

    default:
      throw lifecycleError(ERROR_CODES.UNKNOWN_EVENT, `unhandled event ${event.type}`);
  }
}

export function reduceLifecycleDemo(fixtureEvents) {
  return reduceLifecycle(fixtureEvents);
}
