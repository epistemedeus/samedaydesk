import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_CARD_A3, S282_OBSERVATION_DATE } from "./constants.ts";
import { externalJobIntakeRoot } from "./paths.ts";
import type { JobCard } from "./types.ts";

type IntakeJob = {
  source?: { adapter?: string; uri?: string; authBoundary?: string };
  identity?: { externalId?: string; title?: string };
  timing?: { deadlineAt?: string | null; deadlineExpired?: boolean };
  economics?: {
    grossBudget?: string | null;
    currency?: string;
    claimAuthority?: string;
    fundingEvidence?: { present?: boolean; escrowTxHash?: string | null };
  };
  status?: { lifecycle?: string; raw?: string };
  fetch?: { httpStatus?: number };
};

/**
 * Map a packs/external-job-intake normalized job onto an A3 card.
 * Does not rewrite the intake pack.
 */
export function cardFromIntakeJob(job: IntakeJob, extras: Partial<JobCard> = {}): JobCard {
  const funded = job.economics?.fundingEvidence?.present === true;
  return {
    schema: SCHEMA_CARD_A3,
    dataLabel: "intake",
    observationDate: S282_OBSERVATION_DATE,
    source: {
      name: job.source?.adapter,
      adapter: job.source?.adapter,
      url: job.source?.uri,
      publicGetUrl: job.source?.uri,
      publicGetStatus: job.fetch?.httpStatus ?? 200,
      authBoundary: job.source?.authBoundary,
      sourceKind: "job_api",
    },
    listing: {
      id: job.identity?.externalId,
      title: job.identity?.title,
      status: job.status?.lifecycle || job.status?.raw,
      funded,
      fundingClass: funded ? "escrow" : "unknown",
      escrowTxHash: job.economics?.fundingEvidence?.escrowTxHash || null,
      deadlineAt: job.timing?.deadlineAt ?? null,
      agentAccess: "AGENT_ALLOWED",
    },
    reward: {
      gross: job.economics?.grossBudget ?? null,
      asset: job.economics?.currency || null,
    },
    claim: { available: false, identityRequired: true },
    assignment: { reserved: false, assigned: false },
    ...extras,
  };
}

export function loadIntakeSample(name: "escrow-job" | "proof-job" | "github-comment"): JobCard | null {
  const root = externalJobIntakeRoot();
  if (!root) return null;
  const path = join(root, "samples", name, "normalized_job.json");
  const job = JSON.parse(readFileSync(path, "utf8")) as IntakeJob;
  return cardFromIntakeJob(job, { fixtureKind: `intake-${name}` });
}
