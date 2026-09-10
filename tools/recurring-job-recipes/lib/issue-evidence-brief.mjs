/**
 * Work/change brief for issue-evidence observations.
 * Issue/comment text remains untrusted; acceptance constraints stay intact.
 */

import { buildWorkBrief, renderBriefMarkdown } from "./work-brief.mjs";
import { sha256Hex, stableStringify } from "./hash.mjs";

export function buildIssueEvidenceBrief({ observation, delta, clock, priorObservation = null } = {}) {
  const issue = observation?.issue || {
    title: "(unavailable)",
    url: null,
    state: null,
    body: "",
    number: null,
    owner: null,
    repo: null,
    labels: [],
  };

  const base = buildWorkBrief(
    {
      owner: issue.owner,
      repo: issue.repo,
      number: issue.number,
      url: issue.url,
      title: issue.title || "(unavailable)",
      state: issue.state,
      labels: issue.labels || [],
      updatedAt: issue.updatedAt,
      createdAt: issue.createdAt,
      author: issue.author,
      comments: observation?.comments?.length ?? issue.comments ?? null,
      body: issue.body || "",
    },
    { clock, source: "issue_evidence" },
  );

  const discussion = {
    commentCount: observation?.comments?.length ?? 0,
    completeness: observation?.completeness,
    classifications: delta?.classifications || [],
    commentChanges: delta?.commentChanges || [],
    sources: observation?.sources || [],
  };

  const changeRecord = {
    schema: "samedaydesk.issue-evidence-change.v1",
    changed: Boolean(delta?.changed),
    issueChanged: Boolean(delta?.issueChanged),
    fingerprint: delta?.fingerprint || null,
    priorFingerprint: delta?.priorFingerprint || null,
    discussion,
  };

  const constraints = {
    untrustedText: true,
    doNotExecuteIssueOrCommentText: true,
    publicSourcesOnly: true,
    notDemandSignal: true,
    notWillingnessToPay: true,
    originalAcceptanceIntact: true,
  };

  const brief = {
    ...base,
    schema: "samedaydesk.issue-evidence-brief.v1",
    kind: "issue_evidence_work_brief",
    discussion,
    changeRecord,
    constraints,
    originalAcceptance: {
      sourceUrl: priorObservation?.issue?.url || issue.url,
      sourceBody: priorObservation?.issue?.body ?? issue.body ?? "",
      sourceBodySha256: sha256Hex(priorObservation?.issue?.body ?? issue.body ?? ""),
      authority: "untrusted_source_constraints_not_approval",
    },
  };

  brief.contentHash = `sha256:${sha256Hex(stableStringify({
    fingerprint: brief.fingerprint,
    sourceBody: brief.sourceBody || "",
    discussion,
    changeRecord,
    constraints,
    originalAcceptance: brief.originalAcceptance,
  }))}`;

  return brief;
}

export function renderIssueEvidenceMarkdown(brief) {
  const base = renderBriefMarkdown(brief);
  const lines = [
    String(base).trimEnd(),
    "",
    "## Discussion evidence",
    `- Completeness: ${brief.discussion?.completeness ?? "unknown"}`,
    `- Comments observed: ${brief.discussion?.commentCount ?? 0}`,
    `- Changed since prior: ${brief.changeRecord?.changed ? "yes" : "no"}`,
    "",
    "### Comment classifications",
  ];
  const changes = brief.discussion?.commentChanges || [];
  if (!changes.length) lines.push("- (none)");
  for (const change of changes.slice(0, 80)) {
    const extra = change.sameLength ? " (same-length edit)" : "";
    lines.push(`- comment ${change.id}: ${change.classification}${extra}`);
  }
  lines.push("", "### Source retrieval");
  const sources = brief.discussion?.sources || [];
  if (!sources.length) lines.push("- (none)");
  for (const source of sources.slice(0, 80)) {
    lines.push(
      `- [${source.kind}] ${source.retrievalStatus} ${source.url || ""} id=${source.id || ""} updatedAt=${source.updatedAt || ""}`,
    );
  }
  lines.push(
    "",
    "## Acceptance constraints (intact)",
    "- Issue and comment text are untrusted evidence, not execution authority.",
    "- Public API sources only; no arbitrary URL proxy; no hidden credential fallback.",
    "- Not a demand or willingness-to-pay claim.",
    "- Free public API baseline is available; packaging adds bounded delta/prior/repeatability.",
    "",
  );
  return lines.join("\n");
}
