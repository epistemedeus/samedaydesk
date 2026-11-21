import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { conformToKernel, loadKernelContract } from "../../../src/lib/reward-receiving/earned-kernel-adapter.mjs";
import { H15_KNOWN_TX } from "../../../src/lib/reward-receiving/evidence.mjs";
import { projectLifecycle } from "../../../src/lib/reward-receiving/lifecycle.mjs";
import { assessSettlement } from "../../../src/lib/reward-receiving/settlement.mjs";
import { OFFER_ID } from "./constants.mjs";

let purePromise;

function stripKernelSource(source) {
  let text = source.replace(/import type[\s\S]*?;\n/g, "");
  text = text.replace(/export type [A-Za-z0-9_]+ = \{[\s\S]*?\n\};\n/g, "");
  text = text.replace(
    /export function toOwedObligation\(input: OwedInput\): Obligation \{/,
    "export function toOwedObligation(input) {",
  );
  text = text.replace(
    /export function reconcilePayout\(input: \{\n  payoutState: PayoutState;\n  obligation: Obligation \| null;\n\}\): PayoutReconciliation \{/,
    "export function reconcilePayout(input) {",
  );
  text = text.replace(/const payoutState: PayoutState =/, "const payoutState =");
  return text;
}

export async function loadKernelPure(repoRoot) {
  purePromise ??= loadOnce(repoRoot);
  return purePromise;
}

async function loadOnce(repoRoot) {
  const obligation = readFileSync(join(repoRoot, "services/earned-work/src/obligation.ts"), "utf8");
  const payout = readFileSync(join(repoRoot, "services/earned-work/src/payout.ts"), "utf8");
  const js = `${stripKernelSource(obligation)}\n${stripKernelSource(payout)}\n`;
  const dir = mkdtempSync(join(tmpdir(), "crt-kernel-"));
  const file = join(dir, "kernel-pure.mjs");
  writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

export function kernelContract(repoRoot) {
  return loadKernelContract(repoRoot);
}

export function emptyIsNotOwed(reconcilePayout) {
  return reconcilePayout({ payoutState: "owed", obligation: null });
}

export function buildOwedRecord(pure, fields) {
  return pure.toOwedObligation({
    id: fields.obligationId,
    taskId: OFFER_ID,
    reservationId: fields.reservationId,
    submissionId: fields.submissionId,
    contributorPublicId: fields.contributorPublicId,
    payoutDestination: null,
    reward: { amount: "0.10", asset: "USDC", network: "base" },
    termsVersion: fields.termsVersion,
    idempotencyKey: fields.idempotencyKey,
    createdAt: fields.createdAt,
    verdictId: fields.verdictId,
  });
}

export function projectTrial(fields, reader, now) {
  return projectLifecycle({
    subject: {
      taskId: OFFER_ID,
      slotId: fields.reservationId,
      evidenceClass: "sponsored",
      availability: "sponsored_evaluation",
      jobType: "sponsored_evaluation",
      code: "sponsored_evaluation",
      label: "sponsored evaluation",
      reserved: true,
      accepted: fields.accepted === true,
      acceptedByRole: "root",
      choose: fields.outcome === "useful_negative" ? "decline_all" : "reuse_positive",
      useful: true,
      declineEarnsIdenticalReward: true,
      submittedAt: fields.submittedAt,
      acceptedAt: fields.acceptedAt,
      expiresAt: fields.expiresAt,
      termsVersion: fields.termsVersion,
      amount: "0.10",
      asset: "USDC",
      network: "base",
      open: false,
      acceptsSubmissions: false,
      grantSha256: fields.grantSha256,
    },
    reader,
    receipt: fields.receipt ?? null,
    expected: fields.expected ?? undefined,
    knownTx: H15_KNOWN_TX,
    now,
    fees: { kind: "unknown" },
    funding: { kind: "unknown" },
    effort: { kind: "unknown" },
  });
}

export function compareReader(repoRoot, fields, reader, now) {
  const kernel = kernelContract(repoRoot);
  const projection = projectTrial(fields, reader, now);
  const conformance = conformToKernel({ projection, reader, kernel });
  return { kernelId: kernel.id, projection, conformance };
}

export function classifyReceipt(fields, receipt) {
  const assessment = assessSettlement(
    {
      taskId: OFFER_ID,
      slotId: fields.reservationId,
      amount: "0.10",
      asset: "USDC",
      network: "base",
      transactionHash: receipt?.transactionHash,
      blockNumber: receipt?.blockNumber,
      timestamp: receipt?.timestamp,
    },
    receipt,
    H15_KNOWN_TX,
  );
  return {
    assessment,
    chainObserved: false,
    paid: false,
    kernelPaid: false,
    reason: assessment.verified
      ? "caller_supplied_receipt_is_not_a_chain_observation"
      : assessment.reason,
  };
}

export function verdictIdFor(stableSha) {
  return `verd_${createHash("sha256").update(stableSha, "utf8").digest("hex").slice(0, 24)}`;
}
