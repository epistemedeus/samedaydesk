export type RepairIntake = {
  defectId: string;
  suppliedInput: { digestSha256: string; mediaType: string; bytes: number };
  scope: string;
  acceptanceTest: string;
  rollback: string;
  provenance: "fixture" | "test" | "customer";
  saleState: "not_a_sale";
};

export type MetadataDiagnostic = {
  field: "resource" | "extensions.bazaar" | "payload" | "other";
  present: boolean;
  signed: boolean;
  drift: "none" | "missing_hint" | "mismatch" | "unknown";
};

export type CanaryDesign = {
  purchaseCap: { amount: string; asset: string; network: string };
  ownerQa: true;
  externalRevenue: false;
  authorized: false;
};

export type SubjectJobId =
  | "api-upgrade-brief"
  | "vendor-budget-impact"
  | "feed-agenda"
  | "evidence-ci-annotation"
  | "listing-repair-packet"
  | "repeat-job-record";

export type RepairIntakeDraft = {
  defectId?: unknown;
  suppliedInput?: unknown;
  scope?: unknown;
  acceptanceTest?: unknown;
  rollback?: unknown;
  provenance?: unknown;
  saleState?: unknown;
  paid?: unknown;
  settled?: unknown;
  flags?: unknown;
  labels?: unknown;
  exampleFlag?: unknown;
  sourceKind?: unknown;
  subjectJobId?: unknown;
  fromFixturePath?: unknown;
};

export type CanaryRoute = "extract" | "seller-integrity-audit";
