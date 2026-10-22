/**
 * Machine projection for the public trial and bounty schedule.
 * Clones caller records. Does not mutate human-page source objects.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectActionability } from "./actionability.mjs";
import { conformToKernel, loadKernelContract } from "./earned-kernel-adapter.mjs";
import {
  H15_ACCEPTED_AT,
  H15_AMOUNT,
  H15_BLOCK_NUMBER,
  H15_KNOWN_TX,
  H15_OPERATOR_SENT_AT,
  H15_PUBLIC_RECEIPT,
  H15_TRANSFER_AT,
  H15_TX_HASH,
} from "./evidence.mjs";
import { projectLifecycle, publicView } from "./lifecycle.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function kernel() {
  return loadKernelContract(join(here, "../../.."));
}

function withReceiver(projection) {
  const receiver = conformToKernel({
    projection,
    reader: { kind: "public" },
    kernel: kernel(),
  });
  const view = publicView(projection);
  view.receiver = receiver;
  return view;
}

function cardActionability(card) {
  return {
    id: card.id,
    ...projectActionability({
      availability: card.currentAvailability,
      jobType: card.code,
      code: card.code,
      label: card.label,
      open: false,
      acceptsSubmissions: false,
    }),
    preservedLabel: card.label,
    preservedCode: card.code,
    currentBuyerJob: false,
  };
}

export function projectH15(offer, reader = { kind: "public" }, extras = {}) {
  const slotB = offer.slots.find((slot) => slot.id === "B");
  const slotA = offer.slots.find((slot) => slot.id === "A");
  const projection = projectLifecycle({
    subject: {
      taskId: offer.id,
      slotId: "B",
      evidenceClass: "sponsored",
      state: offer.state,
      availability: "sponsored_evaluation",
      jobType: "sponsored_evaluation",
      reserved: true,
      accepted: true,
      acceptedByRole: "reviewer",
      choose: slotB.evaluationChoose,
      useful: true,
      declineEarnsIdenticalReward: offer.reward?.declineEarnsIdenticalReward !== false,
      submittedAt: slotB.submittedAt,
      acceptedAt: H15_ACCEPTED_AT,
      publishedAcceptedAt: slotB.acceptedAt,
      expiresAt: slotB.expiresAt,
      termsVersion: offer.termsVersion,
      amount: slotB.rewardUsdc,
      asset: offer.reward.asset,
      network: offer.reward.network,
      open: false,
      acceptsSubmissions: false,
      grantSha256: null,
    },
    reader,
    receipt: extras.receipt === undefined ? H15_PUBLIC_RECEIPT : extras.receipt,
    expected: {
      transactionHash: H15_TX_HASH,
      blockNumber: H15_BLOCK_NUMBER,
      timestamp: H15_TRANSFER_AT,
    },
    operatorSentAt: H15_OPERATOR_SENT_AT,
    now: extras.now ?? "2026-10-01T00:00:00Z",
    knownTx: H15_KNOWN_TX,
    fees: { kind: "unknown" },
    funding: { kind: "unknown" },
    effort: { kind: "unknown" },
  });
  const view = withReceiver(projection);
  view.slots = {
    A: {
      id: "A",
      machineStatus: "not_a_buyer_job",
      accepted: false,
      paid: false,
      paidAmount: "0",
      expired: true,
      nextAction: "do_not_claim",
      reservedFrom: slotA.reservedFrom,
      expiresAt: slotA.expiresAt,
    },
    B: {
      id: "B",
      machineStatus: view.machineStatus,
      nextAction: view.nextAction,
      closedSlotNextAction: "do_not_claim",
      accepted: true,
      acceptedAt: H15_ACCEPTED_AT,
      publishedAcceptedAt: slotB.acceptedAt,
      submittedAt: slotB.submittedAt,
      choose: slotB.evaluationChoose,
      paid: view.machineStatus === "already_paid",
      stillOwed: view.stillOwed,
      paidAmount: view.paidAmount,
      expiresAt: slotB.expiresAt,
      expiryCancelsAccepted: false,
    },
  };
  view.evaluationCards = (offer.assets?.evaluationCards ?? []).map(cardActionability);
  view.positiveExpectedValueDoesNotCreateAJob = true;
  return view;
}

function machineBoundary(offer, lifecycle) {
  const label = offer.assets?.evaluationCards?.[0]?.label ?? "not a current buyer job";
  return [
    `Machine status ${lifecycle.machineStatus}.`,
    `Slot B decline_all submitted ${lifecycle.submittedAt} was accepted ${H15_ACCEPTED_AT} and is already paid ${H15_AMOUNT} ${offer.reward.asset} net on ${offer.reward.network}.`,
    `Public transfer block ${H15_BLOCK_NUMBER} at ${H15_TRANSFER_AT}, transaction ${H15_TX_HASH}.`,
    `Operator sent confirmation ${H15_OPERATOR_SENT_AT} is not itself the chain receipt.`,
    "Chain settlement is verified from the public receipt and logs.",
    "Slot A expired with no acceptance and is not paid.",
    "No unreserved slot is open.",
    `Terms ${offer.termsVersion} unchanged. Current commit ${offer.reward.currentCommit}.`,
    "Automated payout is off. Public acceptance does not authenticate a claimant. Reviewer is not the claimant.",
    "Expiry does not cancel accepted work. A useful decline_all earned its reward with no further work.",
    `Card 02 expected profit and card 04 OPEN referral are ${label}.`,
    "Positive modeled EV does not make a job available.",
    "This 0.20 sample does not fund the 0.10 trial and does not prove a minimum or API-funded arbitrage.",
    "The example response is format only. Scenarios, not jobs. Budget is an internal commitment, not escrow.",
  ].join(" ");
}

function overlaySlotB(slot) {
  return {
    ...slot,
    acceptedAt: H15_ACCEPTED_AT,
    publishedAcceptedAt: slot.acceptedAt,
    paid: true,
    paidUsdc: H15_AMOUNT,
    payoutIssued: true,
    transferPerformed: true,
    stillOwed: false,
    reopened: false,
    repriced: false,
  };
}

export function publishTrialOffer({ offer, exampleResponse, trialUrl, buyerJobLabel }) {
  const lifecycle = projectH15(offer);
  const next = structuredClone(offer);
  next.trialUrl = trialUrl;
  next.envelopeSchema = "neomorphic.bounty-economics-evaluation.claim.v1";
  next.exampleResponse = exampleResponse;
  next.machineStatus = lifecycle.machineStatus;
  next.nextAction = lifecycle.nextAction;
  next.lifecycle = lifecycle;
  next.payoutIssued = false;
  next.reward = {
    ...next.reward,
    paidUsdc: H15_AMOUNT,
    payoutIssued: false,
    automated: false,
  };
  next.slots = next.slots.map((slot) => (slot.id === "B" ? overlaySlotB(slot) : slot));
  if (next.holder) {
    next.holder = {
      ...next.holder,
      slots: next.holder.slots.map((slot) => (slot.id === "B" ? overlaySlotB(slot) : slot)),
      acceptance: {
        ...next.holder.acceptance,
        verifiedSentAt: H15_ACCEPTED_AT,
        publishedVerifiedSentAt: next.holder.acceptance.verifiedSentAt,
        paid: true,
        payoutIssued: true,
        transferPerformed: true,
        stillOwed: false,
        payoutAddressPublished: false,
      },
    };
  }
  next.boundary = machineBoundary(offer, lifecycle);
  if (buyerJobLabel && !next.boundary.includes(buyerJobLabel)) {
    next.boundary = `${next.boundary} ${buyerJobLabel}.`;
  }
  return next;
}

function scheduleLifecycle(bounty) {
  if (bounty.id === "H15-BEE") {
    return projectH15({
      id: bounty.id,
      state: bounty.state,
      termsVersion: "2026-09-13-price2",
      slots: bounty.holder.slots,
      reward: {
        asset: "USDC",
        network: "base",
        currentCommit: "0.40",
        declineEarnsIdenticalReward: true,
      },
      assets: { evaluationCards: [] },
    });
  }
  const open = bounty.state === "open" && bounty.acceptsSubmissions !== false;
  const sponsored = bounty.evidenceClass === "sponsored";
  const projection = projectLifecycle({
    subject: {
      taskId: bounty.id,
      evidenceClass: bounty.evidenceClass,
      state: bounty.state,
      availability: sponsored ? "sponsored_evaluation" : "not_current",
      jobType: sponsored ? "sponsored_evaluation" : "not_a_current_buyer_job",
      open: bounty.state === "open",
      acceptsSubmissions: open && sponsored,
      reserved: false,
      accepted: false,
      amount: bounty.id === "N-BTY-003" ? "0.10" : null,
      asset: bounty.id === "N-BTY-003" ? "USDC" : null,
      network: bounty.id === "N-BTY-003" ? "base" : null,
    },
    reader: { kind: "public" },
    receipt: null,
    knownTx: H15_KNOWN_TX,
    funding: { kind: "unknown" },
    fees: { kind: "unknown" },
    effort: { kind: "unknown" },
  });
  const view = withReceiver(projection);
  view.funded = false;
  view.payoutEnabled = false;
  view.markedFundedBySample = false;
  view.statedConsiderationIsNotFundingProof = true;
  return view;
}

function h15ScheduleCopy(bounty, lifecycle) {
  const slotA = bounty.holder.slots.find((slot) => slot.id === "A");
  const slotB = bounty.holder.slots.find((slot) => slot.id === "B");
  const scope = [
    `Slot A is expired for new work from ${slotA.reservedFrom} until ${slotA.expiresAt} and stays closed.`,
    `Slot B was reserved from ${slotB.reservedFrom} until ${slotB.expiresAt}.`,
    `The useful decline_all submitted ${slotB.submittedAt} was accepted ${H15_ACCEPTED_AT} and is already paid.`,
    "No unreserved slot is open. Public new submissions stay closed.",
    "The closed slot next action is do_not_claim.",
  ].join(" ");
  const consideration = [
    `Neomorphic-sponsored ${H15_AMOUNT} USDC net on Base for accepted slot B.`,
    "Terms 2026-09-13-price2 unchanged.",
    "Current commit 0.40.",
    `Slot B is already paid: public Base USDC transfer ${H15_AMOUNT} at block ${H15_BLOCK_NUMBER}, ${H15_TRANSFER_AT}, transaction ${H15_TX_HASH}.`,
    `Operator sent confirmation ${H15_OPERATOR_SENT_AT} follows the transfer and is not the receipt.`,
    "Chain settlement verified from the public receipt.",
    "Slot A has no acceptance and is not paid.",
    "Not customer revenue. Not escrow. Automated payout is off.",
    "Public acceptance does not authenticate a claimant. Reviewer is not the claimant.",
    "Expiry does not cancel the accepted work.",
    "A useful decline_all earned the reward with no further work.",
    "This 0.20 sample does not fund N-BTY-003 and does not prove a 0.10 minimum.",
  ].join(" ");
  return {
    ...bounty,
    scope,
    consideration,
    machineStatus: lifecycle.machineStatus,
    nextAction: lifecycle.nextAction,
    lifecycle,
    holder: {
      ...bounty.holder,
      slots: bounty.holder.slots.map((slot) => (slot.id === "B" ? overlaySlotB(slot) : { ...slot })),
      acceptance: {
        ...bounty.holder.acceptance,
        verifiedSentAt: H15_ACCEPTED_AT,
        publishedVerifiedSentAt: bounty.holder.acceptance.verifiedSentAt,
        paid: true,
        payoutIssued: true,
        transferPerformed: true,
        stillOwed: false,
        payoutAddressPublished: false,
      },
    },
  };
}

export function publishSchedule(schedule) {
  return {
    ...schedule,
    lifecycleSchema: "neomorphic.reward-receiving.lifecycle.v1",
    boundary: `${schedule.boundary} Machine lifecycle is authoritative for actionability. A positive modeled EV does not create an open buyer job. Listed sponsorship is not a funded payout.`,
    bounties: schedule.bounties.map((bounty) => {
      const lifecycle = scheduleLifecycle(bounty);
      if (bounty.id === "H15-BEE") return h15ScheduleCopy(bounty, lifecycle);
      return {
        ...bounty,
        machineStatus: lifecycle.machineStatus,
        nextAction: lifecycle.nextAction,
        lifecycle,
      };
    }),
  };
}

export function kernelContractSha256(repoRoot = join(here, "../../..")) {
  const path = join(repoRoot, "services/earned-work/contract/kernel-v1.json");
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
