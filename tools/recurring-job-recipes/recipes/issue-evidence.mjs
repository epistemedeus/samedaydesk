/**
 * S62 issue-evidence recurring job recipe.
 * Extends the issue-to-work-brief contract with bounded discussion evidence.
 * Does not execute issue/comment text. Optional prior. Public API only.
 */

import { costForRecipe } from "../lib/cost.mjs";
import { inspectPaymentAuthority } from "../lib/payment-guard.mjs";
import { classifyStaleBaseline, recoveryPlan } from "../lib/recovery.mjs";
import { fetchGithubIssueEvidence } from "../lib/github-comments.mjs";
import { diffIssueEvidence, fingerprintObservation } from "../lib/issue-evidence-delta.mjs";
import { loadOptionalPrior, assertPriorImmutable, priorObservationPayload, readIssueEvidenceJson } from "../lib/issue-evidence-prior.mjs";
import { buildIssueEvidenceBrief, renderIssueEvidenceMarkdown } from "../lib/issue-evidence-brief.mjs";
import { readFileSync } from "node:fs";

export const RECIPE_ID = "issue-evidence";
export const RECIPE_SCHEMA = "samedaydesk.recurring-job-recipe-result.v1";

export const META = Object.freeze({
  recipeId: RECIPE_ID,
  userBenefit:
    "Collect bounded public issue discussion evidence, retain source retrieval status, and produce an actionable work/change brief with optional immutable prior delta.",
  operatorSupplies: [
    "issueUrl or --issue-fixture / --evidence-fixture",
    "optional priorPath",
    "scheduleHint",
    "clock",
    "horizonHours",
    "optional comment page bounds",
  ],
  acceptedContracts: [
    "samedaydesk.work-brief.v1",
    "samedaydesk.issue-evidence-brief.v1",
    "samedaydesk.recurring-job-prior.v1",
  ],
});

export async function runIssueEvidence(input = {}) {
  const clock = input.clock || new Date().toISOString();
  const scheduleHint = input.scheduleHint || null;

  const priorLoad = loadOptionalPrior(input.priorPath);
  if (!priorLoad.ok) {
    return fail(priorLoad.code, priorLoad.message, { clock, scheduleHint });
  }

  const payment = inspectPaymentAuthority(priorLoad.prior || { payment: { attempted: false } }, input);
  if (!payment.ok) {
    return fail(payment.code, payment.message, {
      clock,
      scheduleHint,
      payment,
      prior: summarizePrior(priorLoad),
    });
  }

  if (priorLoad.present) {
    const stale = classifyStaleBaseline(priorLoad.prior.createdAt, clock, input.horizonHours);
    if (stale.stale) {
      return result({
        outcome: "stale_baseline",
        clock,
        scheduleHint,
        prior: summarizePrior(priorLoad),
        payment,
        stale,
        evidence: { kind: "stale_baseline", ...stale },
      });
    }
  }

  const fetched = await collectEvidence(input);
  if (!fetched.observation && fetched.error) {
    return result({
      outcome: fetched.error?.code === "timed_out" || fetched.error?.code === "cancelled" ? "timed_out" : "error",
      clock,
      scheduleHint,
      prior: summarizePrior(priorLoad),
      payment,
      evidence: {
        kind: "observe_error",
        code: fetched.error?.code || "observe_error",
        message: fetched.error?.message || "evidence collection failed",
        transport: fetched.observation?.transport || null,
      },
    });
  }

  const observation = fetched.observation;
  const priorPayload = priorObservationPayload(priorLoad.prior);
  if (priorLoad.present && !priorPayload) return fail("invalid_prior", "prior contains no comparable issue observation", { clock });
  if (priorPayload && String(priorPayload.observation.issue?.url || "").toLowerCase() !== String(observation.issue?.url || "").toLowerCase()) return fail("prior_identity_mismatch", "prior and current issue identities differ", { clock });
  const delta = diffIssueEvidence(observation, priorPayload);
  const brief = buildIssueEvidenceBrief({ observation, delta, clock, priorObservation: priorPayload?.observation });
  const markdown = renderIssueEvidenceMarkdown(brief);

  let outcome;
  if (observation.completeness === "error") {
    outcome = "error";
  } else if (observation.completeness === "partial" || fetched.partial) {
    outcome = "partial";
  } else if (!priorLoad.present) {
    outcome = "changed"; // first observation is a change record
  } else {
    outcome = delta.changed ? "changed" : "unchanged";
  }

  return result({
    outcome,
    clock,
    scheduleHint,
    prior: summarizePrior(priorLoad),
    payment,
    evidence: {
      kind: "issue_evidence",
      observation,
      delta,
      fingerprint: delta.fingerprint || fingerprintObservation(observation),
      brief,
      markdown,
      changed: Boolean(delta.changed),
      completeness: observation.completeness,
      claims: {
        ...brief.claims,
        ...brief.constraints,
        ownerQaOnly: true,
        notDemand: true,
      },
    },
    directUse: {
      markdown,
      briefPathHint: "write brief JSON via --out-dir --write-artifact",
    },
  });
}

async function collectEvidence(input) {
  if (input.evidenceFixturePath || input.issueFixturePath) {
    try {
      const path = input.evidenceFixturePath || input.issueFixturePath;
      const { doc: raw } = readIssueEvidenceJson(path);
      // Accept either a full evidence fixture or a legacy issue-only fixture.
      if (raw.observation || raw.comments || raw.issue) {
        return fetchGithubIssueEvidence(input.issueUrl || raw.issue?.url || "fixture://issue", {
          fixture: raw.observation ? raw : raw,
        });
      }
      return {
        ok: false,
        error: { code: "invalid_evidence_fixture", message: "fixture missing observation/issue" },
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "invalid_evidence_fixture",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  if (!input.issueUrl) {
    return {
      ok: false,
      error: { code: "missing_issue", message: "supply --issue-url or --evidence-fixture" },
    };
  }

  return fetchGithubIssueEvidence(input.issueUrl, {
    fetchImpl: input.fetchImpl,
    token: input.githubToken || null, // explicit only
    bounds: {
      maxCommentPages: input.maxCommentPages,
      perPage: input.perPage,
      maxCommentBytes: input.maxCommentBytes,
      timeoutMs: input.timeoutMs,
    },
    signal: input.signal || null,
  });
}

function summarizePrior(priorLoad) {
  if (!priorLoad?.present) {
    return { present: false, path: null };
  }
  return {
    present: true,
    path: priorLoad.path,
    sha256: priorLoad.prior.sha256,
    sequence: priorLoad.prior.sequence,
    createdAt: priorLoad.prior.createdAt,
    immutable: priorLoad.prior.immutable,
  };
}

function fail(code, message, extra = {}) {
  return result({
    outcome: "error",
    ...extra,
    evidence: { kind: "error", code, message },
  });
}

function result(partial) {
  return {
    ok: partial.outcome === "unchanged" || partial.outcome === "changed" || partial.outcome === "partial",
    schema: RECIPE_SCHEMA,
    recipeId: RECIPE_ID,
    meta: META,
    cost: costForRecipe(RECIPE_ID),
    recovery: recoveryPlan(partial.outcome, partial.evidence),
    ...partial,
  };
}
