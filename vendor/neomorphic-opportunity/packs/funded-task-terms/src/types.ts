import type {
  EffortUnit,
  FundingState,
  ObligationEvent,
  Provenance,
} from "./constants.js";
import {
  APPEAL_BIND,
  RAIL_SETTLEMENT,
  SCHEMA_ID,
  SCHEMA_VERSION,
} from "./constants.js";

export type DecimalAmount = string;
export type AtomicAmount = string;
/** `sha256:` + 64 lowercase hex. Content hash, not an integer. */
export type TermsVersion = string;

export type Reward = {
  /** Decimal string in display units. Never a JS number. */
  amount: DecimalAmount;
  asset: string;
  network: string;
  /** Integer decimal string in atomic units. */
  amountAtomic?: AtomicAmount;
  /** Token decimals. USDC must be 6 when present. */
  decimals?: number;
};

/** Exact artifact descriptor. Metadata only — never executed. */
export type ArtifactDescriptor = {
  ref: string;
  digestSha256: string;
  mediaType: string;
  bytes: number;
};

export type AcceptanceCriterion = {
  id: string;
  text: string;
};

export type ExpectedEffort = {
  kind: "expected";
  value: number;
  unit: EffortUnit;
};

export type UnknownEffort = {
  kind: "unknown";
};

export type Effort = ExpectedEffort | UnknownEffort;

export type SpdxLicense = {
  kind: "spdx";
  spdxId: string;
};

export type CustomLicense = {
  kind: "custom";
  text: string;
};

export type ContributorLicense = SpdxLicense | CustomLicense;

/** Positive integer seconds, or a positive ISO-8601 duration string. */
export type DurationValue = number | string;

export type CorrectionPolicy = {
  maxCorrections: number;
  window?: DurationValue;
};

export type PaymentTiming = {
  obligationBecomesOwed: ObligationEvent;
  railMayPay: typeof RAIL_SETTLEMENT;
};

export type FundTransferAuthority = {
  requesterAcceptRequired: true;
  llmVerdictAlone: false;
};

export type FailureAppealRoute = {
  id: string;
  decider: string;
  boundTo: typeof APPEAL_BIND;
};

export type FundedTaskTerms = {
  schema: typeof SCHEMA_ID;
  schemaVersion: typeof SCHEMA_VERSION;
  /** Opaque task identifier. Not a URL to fetch and not a capability. */
  taskId: string;
  /**
   * Immutable content hash of the canonical terms body (this object without
   * `termsVersion`). Kind: content-hash (`sha256:<64 hex>`), not an integer.
   */
  termsVersion?: TermsVersion;
  fundingState: FundingState;
  provenance: Provenance;
  execute: false;
  reward: Reward;
  artifact: ArtifactDescriptor;
  acceptanceCriterion: AcceptanceCriterion;
  verifierVersion: string;
  effort: Effort;
  contributorLicense: ContributorLicense;
  reservationDuration: DurationValue;
  reservationExpiresAt?: string;
  correctionPolicy: CorrectionPolicy;
  paymentTiming: PaymentTiming;
  fundTransferAuthority: FundTransferAuthority;
  failureAppealRoute: FailureAppealRoute;
};

export type ParseFailure = {
  ok: false;
  code: string;
  message: string;
  path: Array<string | number>;
};

export type ParseSuccess = {
  ok: true;
  value: FundedTaskTerms & { termsVersion: TermsVersion };
};

export type ParseResult = ParseSuccess | ParseFailure;
