import { costForRecipe } from "../lib/cost.mjs";
import { sha256Hex, stableStringify } from "../lib/hash.mjs";
import { inspectPaymentAuthority } from "../lib/payment-guard.mjs";
import { loadPrior } from "../lib/prior.mjs";
import { classifyStaleBaseline, recoveryPlan } from "../lib/recovery.mjs";
import { fetchPublicIssue, parseIssueRef } from "../lib/github-issue.mjs";
import { buildWorkBrief, renderBriefMarkdown } from "../lib/work-brief.mjs";
import { readFileSync } from "node:fs";

export const RECIPE_ID = "issue-to-work-brief";
export const RECIPE_SCHEMA = "samedaydesk.recurring-job-recipe-result.v1";

export const META = Object.freeze({
  recipeId: RECIPE_ID,
  userBenefit:
    "Turn a public GitHub issue into a direct-use work brief and detect when the issue fingerprint changes since an immutable prior.",
  operatorSupplies: [
    "priorPath",
    "issueUrl or --issue-fixture",
    "scheduleHint",
    "clock",
    "horizonHours",
  ],
  acceptedContracts: ["samedaydesk.work-brief.v1", "samedaydesk.recurring-job-prior.v1"],
});

export async function runIssueToWorkBrief(input = {}) {
  const clock = input.clock || new Date().toISOString();
  const scheduleHint = input.scheduleHint || null;

  const priorLoad = loadPrior(input.priorPath);
  if (!priorLoad.ok) {
    return fail(priorLoad.code, priorLoad.message, { clock, scheduleHint });
  }

  const payment = inspectPaymentAuthority(priorLoad.prior, input);
  if (!payment.ok) {
    return fail(payment.code, payment.message, {
      clock,
      scheduleHint,
      payment,
      prior: summarizePrior(priorLoad),
    });
  }

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

  const observation = await observeIssue(input);
  if (!observation.ok) {
    return result({
      outcome: observation.partial ? "partial" : "error",
      clock,
      scheduleHint,
      prior: summarizePrior(priorLoad),
      payment,
      evidence: {
        kind: observation.partial ? "partial_sources" : "observe_error",
        ...observation.evidence,
      },
    });
  }

  const brief = buildWorkBrief(observation.issue, { clock, source: observation.source });
  const markdown = renderBriefMarkdown(brief);
  const priorFinger = priorLoad.prior.payload?.fingerprint || priorLoad.prior.payload?.issue?.fingerprint || null;
  const currentFinger = brief.fingerprint;
  const changed =
    priorFinger == null
      ? true
      : stableStringify(priorFinger) !== stableStringify(currentFinger);

  const corrections = [];
  if (priorLoad.prior.payload?.brief?.contentHash && priorLoad.prior.payload.brief.contentHash !== brief.contentHash) {
    corrections.push({
      field: "contentHash",
      before: priorLoad.prior.payload.brief.contentHash,
      after: brief.contentHash,
    });
  }

  return result({
    outcome: changed ? "changed" : "unchanged",
    clock,
    scheduleHint,
    prior: summarizePrior(priorLoad),
    payment,
    stale,
    evidence: {
      kind: "issue_work_brief",
      source: observation.source,
      transport: observation.transport,
      issue: brief.issue,
      fingerprint: currentFinger,
      brief,
      markdown,
      changed,
      corrections,
      contentHash: brief.contentHash,
      claims: brief.claims,
    },
    directUse: {
      markdown,
      briefPathHint: "write brief JSON via --out-dir --write-artifact",
    },
  });
}

async function observeIssue(input) {
  if (input.issueFixturePath) {
    try {
      const raw = JSON.parse(readFileSync(input.issueFixturePath, "utf8"));
      const issue = raw.issue || raw;
      if (!issue.number || !issue.title) {
        return {
          ok: false,
          evidence: { code: "invalid_issue_fixture", message: "fixture missing number/title" },
        };
      }
      return {
        ok: true,
        source: { kind: "fixture", path: input.issueFixturePath },
        issue,
        transport: { status: 200, bytes: Buffer.byteLength(JSON.stringify(issue)), elapsedMs: 0 },
      };
    } catch (error) {
      return {
        ok: false,
        evidence: {
          code: "invalid_issue_fixture",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  const ref = input.issueUrl || input.issueRef;
  if (!parseIssueRef(ref)) {
    return {
      ok: false,
      evidence: { code: "missing_issue", message: "supply --issue-url or --issue-fixture" },
    };
  }

  const primary = await fetchPublicIssue(ref, {
    fetchImpl: input.fetchImpl,
    token: input.githubToken || process.env.GITHUB_TOKEN || null,
  });
  if (!primary.ok) {
    return {
      ok: false,
      evidence: {
        code: primary.error.code,
        message: primary.error.message,
        transport: primary.transport,
      },
    };
  }

  // Optional companion docs fetch; failure becomes partial, not total error.
  let docs = null;
  let partial = false;
  if (input.docsUrl) {
    try {
      const started = performance.now();
      const response = await (input.fetchImpl || fetch)(input.docsUrl, {
        method: "GET",
        headers: { accept: "text/plain,text/markdown,*/*;q=0.1" },
        redirect: "follow",
      });
      const text = await response.text();
      docs = {
        url: input.docsUrl,
        status: response.status,
        bytes: Buffer.byteLength(text),
        elapsedMs: performance.now() - started,
        ok: response.ok,
      };
      if (!response.ok) partial = true;
    } catch (error) {
      partial = true;
      docs = {
        url: input.docsUrl,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (partial) {
    return {
      ok: false,
      partial: true,
      evidence: {
        code: "partial_docs_fetch",
        message: "issue fetched; companion docs source failed",
        issue: primary.issue,
        docs,
        transport: primary.transport,
        brief: buildWorkBrief(primary.issue, { clock: input.clock }),
      },
    };
  }

  return {
    ok: true,
    source: { kind: "github_api", url: primary.issue.url },
    issue: primary.issue,
    transport: { ...primary.transport, docs },
  };
}

function summarizePrior(priorLoad) {
  return {
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
