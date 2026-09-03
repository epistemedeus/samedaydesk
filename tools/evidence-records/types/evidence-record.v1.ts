/**
 * Traffic and settlement evidence record.
 * Runtime authority is the JSON Schema plus tools/evidence-records/lib.mjs.
 */

export const SCHEMA_VERSION = "samedaydesk.evidence-record.v1" as const;

export const SOURCE_KINDS = [
  "cloudflare_analytics",
  "hosting_analytics",
  "indexnow_receipt",
  "search_console",
  "bazaar_listing",
  "registry_listing",
  "x402_facilitator_settlement",
  "stripe_event",
  "operator_validation",
  "incentivized_trial",
  "external_work_payout",
  "buyer_attested_receipt",
  "seller_ledger_line",
] as const;

export const COMPLETENESS = ["complete", "sampled", "truncated", "unknown"] as const;

export const AUTHORITY_CLASSES = [
  "seller_observed",
  "provider_returned",
  "independently_reconciled",
  "provider_authoritative",
] as const;

export const ACQUISITION_LABELS = [
  "unclassified",
  "organic",
  "referral",
  "direct",
  "operator_validation",
  "incentivized_trial",
] as const;

export const BUYER_CLASSES = ["independent", "owner", "sponsored", "unknown"] as const;

export const REQUIRED_PROHIBITED_INFERENCES = [
  "cross_source_join_without_exact_key",
  "sum_across_authority_classes",
  "organic_label_for_controlled_or_incentivized_traffic",
  "collapsed_provider_scope",
] as const;

export const PROHIBITED_INFERENCES = [
  ...REQUIRED_PROHIBITED_INFERENCES,
  "analytics_count_is_independent_demand",
  "search_impression_is_visit",
  "indexnow_receipt_is_indexing",
  "catalog_presence_is_demand",
  "provider_response_is_chain_settlement",
  "chain_transfer_is_route_attribution",
  "stripe_event_is_onchain_settlement",
  "local_observation_is_provider_billing",
] as const;

export type SchemaVersion = typeof SCHEMA_VERSION;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type Completeness = (typeof COMPLETENESS)[number];
export type AuthorityClass = (typeof AUTHORITY_CLASSES)[number];
export type AcquisitionLabel = (typeof ACQUISITION_LABELS)[number];
export type BuyerClass = (typeof BUYER_CLASSES)[number];
export type ProhibitedInference = (typeof PROHIBITED_INFERENCES)[number];
export type RequiredProhibitedInference = (typeof REQUIRED_PROHIBITED_INFERENCES)[number];

export interface EvidenceProducer {
  id: string;
  providerId: string;
  adapterId: string;
  observedSurface: string;
}

export interface EvidenceScope {
  providerId: string;
  population: string;
  joinKeys: string[];
  host?: string;
}

export interface ObservationWindow {
  start: string;
  end: string;
  reportingDelaySeconds: number;
}

export interface EvidenceJoin {
  otherSourceKind: SourceKind;
  exactKey?: string;
  exactValue?: string;
}

export interface EvidenceAggregatePart {
  recordId: string;
  authorityClass: AuthorityClass;
  value: string;
}

export interface EvidenceAggregate {
  metricId: string;
  parts: EvidenceAggregatePart[];
}

export interface EvidenceLabels {
  acquisition?: AcquisitionLabel;
}

export interface EvidenceSettlement {
  operationId: string;
  amountUsdc: string;
  buyerClass: BuyerClass;
  validDeliveryStatus: string;
  transaction?: string;
  facilitatorOrPayoutRef?: string;
}

export interface EvidenceRecord {
  schemaVersion: SchemaVersion;
  recordId: string;
  sourceKind: SourceKind;
  producer: EvidenceProducer;
  scope: EvidenceScope;
  observationWindow: ObservationWindow;
  completeness: Completeness;
  authorityClass: AuthorityClass;
  unknownWhenAbsent: string[];
  prohibitedInferences: ProhibitedInference[];
  joins?: EvidenceJoin[];
  aggregates?: EvidenceAggregate[];
  labels?: EvidenceLabels;
  settlement?: EvidenceSettlement;
}

export interface ValidationError {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}
