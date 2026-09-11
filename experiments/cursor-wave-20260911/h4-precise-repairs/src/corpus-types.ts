/** Shared H4R corpus fixture contract. Children write one JSON per defect id. */

export const CORPUS_DISPOSITIONS = Object.freeze([
  "reproduced",
  "fixed_with_regression",
  "briefed_out_of_scope",
  "noted",
] as const);

export type CorpusDisposition = (typeof CORPUS_DISPOSITIONS)[number];

export const REQUIRED_CORPUS_IDS = Object.freeze([
  "M-SDS-F08",
  "M-termsVersion",
  "M-F07",
  "M-F02-pr",
  "M-H4-api",
  "F18-health",
  "F18-bytes",
  "F18-402",
  "F18-sample",
  "F18-routes",
  "M-F16-meter",
] as const);

export type CorpusId = (typeof REQUIRED_CORPUS_IDS)[number];

export type CorpusFixture = {
  id: CorpusId | string;
  title: string;
  disposition: CorpusDisposition;
  inSdsScope: boolean;
  saleState: "not_a_sale";
  provenance: "fixture";
  authorized: false;
  kind: "reproduction" | "regression" | "brief" | "note";
  evaluator: string;
  briefPath: string | null;
  notes: string;
  facts: Record<string, unknown>;
};
