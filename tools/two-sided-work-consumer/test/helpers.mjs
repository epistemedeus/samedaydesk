import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acceptWork,
  claimWork,
  deliverWork,
  postWork,
  projectFeeWork,
  proveWork,
  selectWork,
} from "../src/commands.mjs";

export const CLOCK = "2026-11-06T12:00:00.000Z";

export function tempJourney() {
  return join(mkdtempSync(join(tmpdir(), "two-sided-")), "journey.json");
}

export function fittingPost(overrides = {}) {
  return {
    taskId: "heading-extract",
    title: "Extract public heading",
    summary: "Collect the public heading text into a bounded structured extract.",
    requesterId: "requester-1",
    criteria: ["public-heading"],
    objectiveCriteria: {
      "public-heading": {
        check: "digest_match",
        observe: "headingDigest",
        expected: "heading-accepted",
      },
    },
    payableKinds: ["usable"],
    publicationConsent: true,
    provenance: "synthetic",
    terms: { feeBps: 500, feeBasis: "new_job_gross" },
    grossAtomic: "2000000",
    railCostAtomic: "0",
    termsDigest: "terms-heading-extract",
    rightsDigest: "rights-heading-extract",
    requesterNote: "Synthetic consented work. Not market liquidity.",
    costLines: [
      { kind: "rail", status: "measured", atomic: "0" },
      { kind: "review", status: "unknown" },
      { kind: "support", status: "unknown" },
      { kind: "contributor", status: "unknown" },
    ],
    ...overrides,
  };
}

export const MEETS_ARTIFACT = {
  schema: "pilot.task-bundle-economics.structured-extract.v1",
  artifactClass: "bounded_structured_extract",
  heading: "Example Domain",
  headingDigest: "heading-accepted",
  sourceLabel: "synthetic-page",
};

export const REFUSED_ARTIFACT = {
  ...MEETS_ARTIFACT,
  heading: "Example Domain Tampered",
  headingDigest: "heading-tampered",
};

export function citation(digest) {
  return [{ source: "synthetic-page", locator: "headingDigest", digest }];
}

export function env(journeyPath) {
  return { journeyPath, clock: CLOCK };
}

export function postClaimDeliver(journeyPath, artifact, digest, postOverrides = {}) {
  const posted = postWork(fittingPost(postOverrides), env(journeyPath));
  const claimed = claimWork({ taskId: "heading-extract", holderId: "agent-a" }, env(journeyPath));
  const delivered = deliverWork({
    taskId: "heading-extract",
    holderId: "agent-a",
    expectedRevision: 0,
    artifact,
    citedEvidence: citation(digest),
  }, env(journeyPath));
  return { posted, claimed, delivered };
}

export function acceptDecision(journeyPath, decision) {
  return acceptWork({
    taskId: "heading-extract",
    requesterId: "requester-1",
    decision,
  }, env(journeyPath));
}

export function project(journeyPath) {
  return projectFeeWork({ taskId: "heading-extract", requesterId: "requester-1" }, env(journeyPath));
}

export function prove(journeyPath) {
  return proveWork({
    taskId: "heading-extract",
    requesterId: "requester-1",
    subject: "heading-extract-proof",
    sequence: 1,
    optIn: true,
  }, env(journeyPath));
}

export function selectAgent(journeyPath, holderId) {
  return selectWork({
    taskId: "heading-extract",
    requesterId: "requester-1",
    holderId,
  }, env(journeyPath));
}
