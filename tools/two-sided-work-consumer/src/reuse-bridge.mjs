import { exportReuse } from "../../result-reuse/src/export.mjs";
import { PUBLIC_PROOF_SCHEMA, capabilityStamp } from "./constants.mjs";
import { containsPrivateAtom, privateAtoms, publicArtifact } from "./public.mjs";

export function rewardFreeRecord(journey) {
  const task = journey.task;
  const artifact = publicArtifact(journey.delivery?.artifact) || {};
  return {
    ok: true,
    status: "success",
    networkUsed: false,
    records: [
      {
        status: "success",
        fields: {
          taskId: task.taskId,
          title: task.title,
          summary: task.summary,
          heading: artifact.heading,
          headingDigest: artifact.headingDigest,
          sourceLabel: artifact.sourceLabel,
          evidenceOutcome: journey.acceptance?.evidenceOutcome,
        },
      },
    ],
    invalidRecords: [],
  };
}

export function proveReuse(journey, options) {
  const record = rewardFreeRecord(journey);
  const atoms = privateAtoms(journey);
  if (containsPrivateAtom(record, atoms)) {
    return { ok: false, reason: "public_reward_disclosure_refused", ...capabilityStamp() };
  }
  const exported = exportReuse(record, {
    optIn: true,
    taskId: journey.task.taskId,
    subject: options.subject,
    sequence: options.sequence,
    clock: options.clock,
  });
  if (!exported.ok) {
    return {
      ok: false,
      reason: "reuse_refused",
      message: exported.message,
      ...capabilityStamp(),
    };
  }
  const proof = {
    schema: PUBLIC_PROOF_SCHEMA,
    rewardDisclosed: false,
    publicShowcase: true,
    marketLiquidity: false,
    outsideUse: "not_observed",
    paymentEvidence: "none",
    taskId: journey.task.taskId,
    subject: options.subject,
    sequence: options.sequence,
    evidenceOutcome: journey.acceptance?.evidenceOutcome,
    reuseMode: exported.mode,
    kind: exported.kind,
    observation: exported.observation,
    provedAt: options.clock,
    ledger: false,
    signer: false,
    paymentCommand: false,
  };
  if (containsPrivateAtom(proof, atoms) || containsPrivateAtom(exported, atoms)) {
    return { ok: false, reason: "public_reward_disclosure_refused", ...capabilityStamp() };
  }
  return { ok: true, proof, record, ...capabilityStamp() };
}
