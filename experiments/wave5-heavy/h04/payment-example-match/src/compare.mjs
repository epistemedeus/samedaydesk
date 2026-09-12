import { readFileSync } from "node:fs";
import { emptyGetBody, OBSERVED, paidEvidenceRequestDigest } from "./digest.mjs";

export function loadCorpus(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function digestCandidate(candidate) {
  const method = candidate.method || "GET";
  const target = candidate.target;
  const rawBody =
    candidate.rawBody === "" || candidate.rawBody == null
      ? emptyGetBody()
      : Buffer.from(String(candidate.rawBody), "utf8");
  return paidEvidenceRequestDigest(method, target, rawBody);
}

export function compareCorpus(corpus, observed = OBSERVED) {
  const rows = [];
  for (const candidate of corpus.candidates || []) {
    const digest = digestCandidate(candidate);
    rows.push({
      id: candidate.id,
      target: candidate.target,
      digest,
      matchTriple: digest === observed.triple,
      matchFourth: digest === observed.fourth,
      source: candidate.source?.path || null,
    });
  }
  const uniqueTargets = [...new Set((corpus.candidates || []).map((c) => c.target))];
  return {
    candidateCount: (corpus.candidates || []).length,
    uniqueTargetCount: uniqueTargets.length,
    uniqueTargets,
    rows,
    matches: {
      triple: rows.filter((r) => r.matchTriple).map((r) => r.id),
      fourth: rows.filter((r) => r.matchFourth).map((r) => r.id),
    },
  };
}
