import { redactDeep } from "./redact.mjs";

function termField(task, key) {
  if (task.terms && Object.hasOwn(task.terms, key)) return task.terms[key];
  if (task.constraints && Object.hasOwn(task.constraints, key)) return task.constraints[key];
  return undefined;
}

export function publicTaskView(task, { now } = {}) {
  const claimable =
    task.claimable === true &&
    task.lifecycle === "open" &&
    task.fundingState === "reserved" &&
    !task.reservation;
  const media = termField(task, "allowedMediaTypes");

  return {
    schema: "neomorphic.contributor_desk.public_task.v1",
    id: task.id,
    title: task.title,
    summary: task.summary,
    provenance: task.provenance,
    lifecycle: task.lifecycle,
    fundingState: task.fundingState,
    termsVersion: task.termsVersion,
    reward: task.reward,
    constraints: {
      claimTtlSeconds: termField(task, "claimTtlSeconds"),
      maxArtifactBytes: termField(task, "maxArtifactBytes"),
      allowedMediaTypes: Array.isArray(media) ? [...media] : [],
      slotLimit: termField(task, "slotLimit"),
    },
    claimable,
    appealable: task.lifecycle === "rejected" && task.verdict?.outcome === "fail",
    reservation: task.reservation
      ? {
          id: task.reservation.id,
          status: task.reservation.status,
          contributorPublicId: task.reservation.contributorPublicId,
          expiresAt: task.reservation.expiresAt,
        }
      : null,
    verdict: task.verdict ? { outcome: task.verdict.outcome, reasons: task.verdict.reasons } : null,
    appeal: task.appeal
      ? {
          id: task.appeal.id,
          status: task.appeal.status,
          notAnAccept: true,
        }
      : null,
    observedAt: now ?? task.updatedAt,
  };
}

export function publicCatalog(seed) {
  return {
    schema: "neomorphic.contributor_desk.catalog.v1",
    provenance: seed.provenance,
    walletless: true,
    earnedWork: seed.earnedWork,
    clock: seed.clock,
    tasks: seed.tasks.map((task) => publicTaskView(task, { now: seed.clock })),
  };
}

/** Browser HTML may embed this projection only. Internal budget never crosses it. */
export function publicBrowserProjection(seed) {
  return redactDeep(publicCatalog(seed));
}
