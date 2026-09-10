/**
 * Diff current issue-evidence observation against an optional immutable prior payload.
 * Distinguishes omitted/delayed/unavailable/reordered/edited/deleted from unchanged.
 */

import { sha256Hex, stableStringify } from "./hash.mjs";

export function commentBodyHash(body) {
  return sha256Hex(typeof body === "string" ? body : "");
}

export function diffIssueEvidence(currentObservation, priorPayload = null) {
  if (!priorPayload || !priorPayload.observation) {
    return {
      kind: "first_observation",
      changed: true,
      classifications: [{ code: "no_prior", detail: "optional prior absent; treating as first observation" }],
      commentChanges: (currentObservation?.comments || []).map((c) => ({ id: c.id, classification: "added" })),
      issueChanged: true,
      fingerprint: fingerprintObservation(currentObservation),
    };
  }

  const prior = priorPayload.observation;
  const classifications = [];
  const commentChanges = [];

  const priorById = new Map((prior.comments || []).map((c) => [String(c.id), c]));
  const currentById = new Map((currentObservation.comments || []).map((c) => [String(c.id), c]));
  const priorOrder = (prior.comments || []).map((c) => String(c.id));
  const currentOrder = (currentObservation.comments || []).map((c) => String(c.id));

  for (const [id, cur] of currentById) {
    const prev = priorById.get(id);
    if (!prev) {
      commentChanges.push({ id, classification: "added" });
      continue;
    }
    if (cur.retrievalStatus && ["unavailable", "delayed", "omitted", "forbidden", "rate_limited", "error", "timed_out", "oversize", "cancelled", "partial", "malformed"].includes(cur.retrievalStatus)) {
      commentChanges.push({ id, classification: cur.retrievalStatus });
      classifications.push({ code: cur.retrievalStatus, id });
      continue;
    }
    const prevHash = commentBodyHash(prev.body);
    const curHash = commentBodyHash(cur.body);
    if (prevHash !== curHash) {
      // same-length edits still count as edited
      commentChanges.push({
        id,
        classification: "edited",
        beforeBytes: Buffer.byteLength(prev.body || "", "utf8"),
        afterBytes: Buffer.byteLength(cur.body || "", "utf8"),
        sameLength: Buffer.byteLength(prev.body || "", "utf8") === Buffer.byteLength(cur.body || "", "utf8"),
      });
    } else {
      commentChanges.push({ id, classification: "unchanged" });
    }
  }

  for (const [id, prev] of priorById) {
    if (!currentById.has(id)) {
      commentChanges.push({ id, classification: currentObservation.completeness === "complete" ? "missing_from_complete_listing" : "unavailable", basis: currentObservation.completeness === "complete" ? "absent_from_complete_current_listing_not_deletion_history" : "incomplete_current_listing" });
    }
  }

  const sameSet = priorOrder.length === currentOrder.length && priorOrder.every((id) => currentById.has(id));
  const sameOrder = sameSet && priorOrder.every((id, i) => id === currentOrder[i]);
  if (sameSet && !sameOrder) {
    classifications.push({ code: "reordered", priorOrder, currentOrder });
  }

  if (prior.completeness !== "complete") classifications.push({ code: "prior_partial_or_unknown", completeness: prior.completeness || "unknown" });
  if (prior.completeness === "complete" && currentObservation.completeness === "partial") {
    classifications.push({ code: "partial_vs_prior_complete" });
  }
  if (currentObservation.completeness !== "complete") {
    classifications.push({ code: "current_partial_or_error", completeness: currentObservation.completeness });
  }

  // Detect pruned / missing prior fields
  if (!Array.isArray(prior.comments)) {
    classifications.push({ code: "prior_comments_missing" });
  }

  const issueChanged = stableStringify(issueFinger(prior.issue)) !== stableStringify(issueFinger(currentObservation.issue));
  const meaningfulCommentChange = commentChanges.some((c) => !["unchanged"].includes(c.classification));
  const changed = issueChanged || meaningfulCommentChange || classifications.some((c) => ["reordered", "prior_partial_or_unknown"].includes(c.code));

  return {
    kind: "delta",
    changed,
    issueChanged,
    classifications,
    commentChanges,
    fingerprint: fingerprintObservation(currentObservation),
    priorFingerprint: priorPayload.fingerprint || fingerprintObservation(prior),
  };
}

function issueFinger(issue) {
  if (!issue) return null;
  return {
    id: issue.id ?? issue.number ?? null,
    state: issue.state ?? null,
    labels: [...(issue.labels || [])].sort(),
    title: issue.title ?? null,
    updatedAt: issue.updatedAt ?? null,
    bodySha256: commentBodyHash(issue.body || ""),
    url: issue.url ?? null,
  };
}

export function fingerprintObservation(observation) {
  return {
    schema: "samedaydesk.issue-evidence-fingerprint.v1",
    issue: issueFinger(observation?.issue),
    commentIds: (observation?.comments || []).map((c) => String(c.id)),
    commentBodySha256: (observation?.comments || []).map((c) => c.bodySha256 || commentBodyHash(c.body || "")),
    completeness: observation?.completeness || null,
  };
}
