import { CLOCK_ISO, CODE, I01_TERMS_VERSION_RE, SESSION_SCHEMA } from "./constants.mjs";
import { DeskError } from "./errors.mjs";
import {
  inspectContributorPayoutKey,
  inspectFieldText,
  inspectPayoutDestination,
  inspectWalletless,
} from "./authority.mjs";
import { publicTaskView } from "./public-view.mjs";
import { owedVersusPaid } from "./owed-versus-paid.mjs";
import { isIntegerTermsVersion } from "./terms-version.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireTask(tasks, taskId) {
  const task = tasks.get(taskId);
  if (!task) {
    throw new DeskError({
      code: CODE.NOT_FOUND,
      message: `task not found: ${taskId}`,
      status: 404,
    });
  }
  return task;
}

const SETTLEMENT_EVIDENCE_KEYS = ["paid", "settled", "transfer"];

function rejectForgedSettlementEvidence(input) {
  if (!input || typeof input !== "object") return;
  const fields = SETTLEMENT_EVIDENCE_KEYS.filter((key) => Object.hasOwn(input, key));
  if (fields.length === 0) return;
  throw new DeskError({
    code: CODE.FORGED_SETTLEMENT_EVIDENCE,
    message:
      "Forged settlement evidence is rejected. paid=false, settled=false, and transfer=null are not normalized into a desk result.",
    status: 400,
    rejected: true,
    details: { fields, persisted: false },
  });
}

function claimTtlSeconds(task) {
  const ttl = task.terms?.claimTtlSeconds ?? task.constraints?.claimTtlSeconds;
  if (!Number.isInteger(ttl) || ttl < 0) {
    throw new DeskError({
      code: CODE.INVALID_INPUT,
      message: "Task is missing a claim TTL on the public projection.",
      status: 400,
      rejected: true,
    });
  }
  return ttl;
}

function assertTermsVersion(value, expected) {
  if (isIntegerTermsVersion(value)) {
    throw new DeskError({
      code: CODE.INTEGER_TERMS_VERSION_REJECTED,
      message: "Integer termsVersion is not a start-work key. I01 requires sha256: + 64 hex.",
      status: 400,
      rejected: true,
    });
  }
  if (typeof value !== "string" || !I01_TERMS_VERSION_RE.test(value)) {
    throw new DeskError({
      code: CODE.INVALID_TERMS_VERSION,
      message: "termsVersion must be sha256: + 64 lowercase hex.",
      status: 400,
      rejected: true,
    });
  }
  if (expected && value !== expected) {
    throw new DeskError({
      code: CODE.TERMS_CHANGED,
      message: "termsVersion does not match the public task.",
      status: 409,
    });
  }
}

function scanContributor(input) {
  const payout = inspectContributorPayoutKey({
    contributor: input,
    flags: input,
  });
  if (!payout.ok) throw payout.error;

  const dest = inspectPayoutDestination(input.payoutDestination);
  if (!dest.ok) {
    if (dest.error) throw dest.error;
    throw new DeskError({
      code: dest.code || CODE.INVALID_INPUT,
      message: dest.message || "invalid payout destination",
      status: 400,
      rejected: true,
    });
  }

  const walletless = inspectWalletless(input);
  if (!walletless.ok) {
    throw new DeskError({
      code: CODE.NOT_WALLETLESS,
      message: "This desk is walletless. Do not supply a wallet, signature, or chain account to claim.",
      status: 400,
      rejected: true,
      details: { hits: walletless.hits },
    });
  }

  for (const value of Object.values(input)) {
    const field = inspectFieldText(value);
    if (!field.ok) throw field.error;
  }

  return dest.destination;
}

/**
 * In-memory public/contributor machine. No owner routes.
 * @param {object} options
 * @param {object} options.seed
 * @param {() => string} [options.now]
 * @param {() => string} [options.randomId]
 */
export function createMachine({ seed, now, randomId } = {}) {
  const state = clone(seed);
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  let killed = null;
  const clock = typeof now === "function" ? now : () => state.clock || CLOCK_ISO;
  const id = typeof randomId === "function" ? randomId : () => `id_${Math.random().toString(16).slice(2, 10)}`;

  function haltIfKilled() {
    if (killed) throw killed;
  }

  function markKilled(error) {
    killed = error;
    throw error;
  }

  function guardedContributor(input) {
    haltIfKilled();
    try {
      return scanContributor(input);
    } catch (error) {
      if (error instanceof DeskError && error.killed) markKilled(error);
      throw error;
    }
  }

  return {
    get killed() {
      return killed;
    },

    browse() {
      haltIfKilled();
      const observedAt = clock();
      return {
        schema: "neomorphic.contributor_desk.browse.v1",
        walletless: true,
        provenance: state.provenance,
        adapter: "fixture",
        tasks: [...tasks.values()].map((task) => publicTaskView(task, { now: observedAt })),
        observedAt,
      };
    },

    claim(input = {}) {
      rejectForgedSettlementEvidence(input);
      const destination = guardedContributor(input);
      const taskId = String(input.taskId ?? "").trim();
      const contributorPublicId = String(input.contributorPublicId ?? "").trim();
      if (!taskId || !contributorPublicId) {
        throw new DeskError({
          code: CODE.INVALID_INPUT,
          message: "claim requires taskId and contributorPublicId",
          status: 400,
        });
      }

      const task = requireTask(tasks, taskId);
      const termsVersion = input.termsVersion ?? task.termsVersion;
      assertTermsVersion(termsVersion, task.termsVersion);

      if (task.fundingState === "unfunded") {
        throw new DeskError({
          code: CODE.UNFUNDED,
          message: "Task is visible but unfunded. A public listing is not a reservation.",
          status: 409,
          rejected: true,
        });
      }

      if (task.reservation && task.reservation.contributorPublicId !== contributorPublicId) {
        throw new DeskError({
          code: CODE.RESERVED_ELSEWHERE,
          message: "Reservation is held by another contributor.",
          status: 409,
        });
      }

      if (task.reservation && task.reservation.contributorPublicId === contributorPublicId) {
        const observedAt = clock();
        return {
          schema: "neomorphic.contributor_desk.claim.v1",
          replayed: true,
          walletless: true,
          task: publicTaskView(task, { now: observedAt }),
          reservation: task.reservation,
          contributorSession: {
            schema: SESSION_SCHEMA,
            publicId: contributorPublicId,
            grantKind: "contributor_session",
            notOwner: true,
            holdsPayoutKey: false,
            walletless: true,
            payoutDestination: destination,
          },
          observedAt,
        };
      }

      if (task.lifecycle !== "open" || task.fundingState !== "reserved" || task.claimable !== true) {
        throw new DeskError({
          code: CODE.NOT_CLAIMABLE,
          message: "Task is not claimable on the public desk.",
          status: 409,
        });
      }

      const observedAt = clock();
      const reservation = {
        id: `rsv_${task.id}_${contributorPublicId}`,
        taskId: task.id,
        termsVersion: task.termsVersion,
        contributorPublicId,
        status: "active",
        expiresAt: new Date(Date.parse(observedAt) + claimTtlSeconds(task) * 1000).toISOString(),
        createdAt: observedAt,
      };
      task.reservation = reservation;
      task.lifecycle = "claimed";
      task.claimable = false;
      task.updatedAt = observedAt;
      if (destination) {
        task.lateAddress = destination;
      }

      return {
        schema: "neomorphic.contributor_desk.claim.v1",
        replayed: false,
        walletless: true,
        task: publicTaskView(task, { now: observedAt }),
        reservation,
        contributorSession: {
          schema: SESSION_SCHEMA,
          publicId: contributorPublicId,
          grantKind: "contributor_session",
          notOwner: true,
          holdsPayoutKey: false,
          walletless: true,
          payoutDestination: destination,
        },
        observedAt,
      };
    },

    status(input = {}) {
      haltIfKilled();
      rejectForgedSettlementEvidence(input);
      const task = requireTask(tasks, String(input.taskId ?? "").trim());
      const observedAt = clock();
      return {
        schema: "neomorphic.contributor_desk.status.v1",
        walletless: true,
        task: publicTaskView(task, { now: observedAt }),
        lifecycle: task.lifecycle,
        fundingState: task.fundingState,
        payoutState: task.payoutState,
        paid: false,
        settled: false,
        transfer: null,
        observedAt,
      };
    },

    appeal(input = {}) {
      rejectForgedSettlementEvidence(input);
      guardedContributor(input);
      const taskId = String(input.taskId ?? "").trim();
      const contributorPublicId = String(input.contributorPublicId ?? "").trim();
      const reason = String(input.reason ?? "").trim();
      if (!taskId || !contributorPublicId || reason.length < 8) {
        throw new DeskError({
          code: CODE.INVALID_INPUT,
          message: "appeal requires taskId, contributorPublicId, and a reason of at least 8 characters",
          status: 400,
        });
      }

      const field = inspectFieldText(reason);
      if (!field.ok) throw field.error;

      const task = requireTask(tasks, taskId);
      if (task.lifecycle !== "rejected" || task.verdict?.outcome !== "fail") {
        throw new DeskError({
          code: CODE.APPEAL_NOT_AVAILABLE,
          message: "Appeal is only available after a fail verdict. Appeal is not owner accept.",
          status: 409,
          rejected: true,
        });
      }
      if (task.reservation?.contributorPublicId !== contributorPublicId) {
        throw new DeskError({
          code: CODE.APPEAL_NOT_AVAILABLE,
          message: "Appeal is limited to the contributor who held the reservation.",
          status: 403,
          rejected: true,
        });
      }

      const observedAt = clock();
      if (task.appeal) {
        return {
          schema: "neomorphic.contributor_desk.appeal.v1",
          replayed: true,
          appeal: task.appeal,
          task: publicTaskView(task, { now: observedAt }),
          payoutStateUnchanged: true,
          notAnAccept: true,
          observedAt,
        };
      }

      const appeal = {
        id: `apl_${task.id}_${id()}`,
        taskId: task.id,
        reservationId: task.reservation.id,
        contributorPublicId,
        reason,
        status: "filed",
        payoutStateUnchanged: true,
        notAnAccept: true,
        notSettlement: true,
        createdAt: observedAt,
      };
      task.appeal = appeal;
      task.updatedAt = observedAt;

      return {
        schema: "neomorphic.contributor_desk.appeal.v1",
        replayed: false,
        appeal,
        task: publicTaskView(task, { now: observedAt }),
        payoutStateUnchanged: true,
        notAnAccept: true,
        observedAt,
      };
    },

    owedVersusPaid(input = {}) {
      haltIfKilled();
      rejectForgedSettlementEvidence(input);
      const task = requireTask(tasks, String(input.taskId ?? "").trim());
      return owedVersusPaid(task, { now: clock() });
    },

    snapshot() {
      return {
        killed: killed ? killed.toJSON() : null,
        tasks: [...tasks.values()].map((task) => publicTaskView(task, { now: clock() })),
      };
    },
  };
}
