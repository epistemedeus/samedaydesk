/**
 * Portable conformance adapter for the earned-work kernel contract.
 * Reads the kernel's nonpaying payout terms. Does not boot a database,
 * sign, transfer, or flip the null adapter on.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function loadKernelContract(repoRoot = join(here, "../../..")) {
  const path = join(repoRoot, "services/earned-work/contract/kernel-v1.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

export function conformToKernel({ projection, reader, kernel }) {
  const payout = kernel?.payout;
  if (!payout || payout.adapter !== "null_nonpaying_v0" || payout.paid !== false || payout.settled !== false || payout.transfer !== null) {
    throw new Error("earned kernel payout contract is not the null nonpaying adapter");
  }
  if (kernel.journey?.owedIsNotPaid !== true) {
    throw new Error("earned kernel contract no longer says owed is not paid");
  }
  const kind = reader?.kind ?? projection?.role?.kind ?? "public";
  const base = {
    schema: "neomorphic.reward-receiving.kernel-conformance.v1",
    kernelContractId: kernel.id,
    payoutTurnedOn: false,
    kernelAdapter: payout.adapter,
    kernelPaid: false,
    kernelSettled: false,
    kernelTransfer: null,
    sale: false,
    database: null,
    owedIsNotPaid: true,
    claimableFalseIsNotAClaim: kernel.journey.claimableFalseIsNotAClaim === true,
    publicIdIsNotPrincipal: kernel.journey.publicIdIsNotPrincipal === true,
    emptyProjectionIsNotOwed: payout.emptyProjectionIsNotOwed === true,
    paymentAuthority: "none",
    fundedTrialMarked: false,
  };

  const authenticated = kind === "authorized_original_claim"
    && reader?.grantSha256
    && projection?.input?.subject?.grantSha256
    && reader.grantSha256 === projection.input.subject.grantSha256;

  if (!authenticated) {
    return {
      ...base,
      readback: "none",
      authenticatedClaimant: false,
      reviewerIsClaimant: false,
      payoutRedirected: false,
      publicAcceptanceAuthenticatesClaimant: false,
      nextAction: "do_not_claim",
      note: "Public acceptance is not a contributor obligation. accepted, empty, or a reviewer role is readback none for this reader. Kernel owed is not paid.",
    };
  }

  if (projection.machineStatus === "already_paid" && projection.settlement?.verified === true) {
    return {
      ...base,
      readback: "external_already_paid",
      authenticatedClaimant: true,
      reviewerIsClaimant: false,
      payoutRedirected: false,
      furtherWorkRequired: false,
      doNotPayAgain: true,
      nextAction: "closed_already_paid",
      note: "External public receipt closes this bound obligation. The kernel adapter stays nonpaying and is not instructed to transfer.",
    };
  }

  if (projection.machineStatus === "accepted_obligation") {
    return {
      ...base,
      readback: "owed",
      authenticatedClaimant: true,
      reviewerIsClaimant: false,
      payoutRedirected: false,
      kernelWouldTransfer: false,
      furtherWorkRequired: projection.furtherWorkRequired === true,
      nextAction: "no_further_work",
      note: "Kernel owed is an IOU bound to the original claim. It is not paid, not settled, and not a transfer.",
    };
  }

  return {
    ...base,
    readback: "none",
    authenticatedClaimant: false,
    payoutRedirected: false,
    nextAction: "do_not_claim",
    note: "No bound accepted obligation for this grant.",
  };
}
