/**
 * Arena A3 packet types. Eligibility, funding, and effort are three types.
 * A mixed scalar is optional display sugar and is never the authority field.
 */

export type AgentAccess =
  | "discover_only"
  | "agent_allowed"
  | "auth_claim"
  | "human_only";

export type ClaimAuthority = "none" | "agent" | "human_only" | "auth_required";

export type Eligibility = {
  agentAccess: AgentAccess;
  claimAuthority: ClaimAuthority;
  doNotStartWork: boolean;
};

export type FundingClass = "escrowed" | "promised" | "unfunded" | "unknown";

export type FundingPurpose = "actionable" | "referral_marketing" | "contest" | "directory";

export type Funding = {
  class: FundingClass;
  deadlineExpired: boolean;
  purpose: FundingPurpose;
};

export type EffortCrowding = {
  submissions: number;
  nominalReward: string;
};

export type Effort = {
  kind: "expected" | "unknown";
  crowding?: EffortCrowding;
  winProbability: "unknown";
};

export type MixedScore = {
  value: number;
  displayOnly: true;
};

export type Packet = {
  eligibility: Eligibility;
  funding: Funding;
  effort: Effort;
  mixedScore?: MixedScore;
};

export type JobCardSource = {
  name?: string;
  adapter?: string;
  vendorAdapter?: string;
  nativeId?: string;
  url?: string;
  publicGetUrl?: string;
  publicGetStatus?: number | null;
  claimRouteUrl?: string;
  claimRouteStatus?: number | null;
  sourceKind?: string;
  paused?: boolean;
  presentedAsJobApi?: boolean;
  verifiedAt?: string | null;
  authBoundary?: string;
  inaccessible?: boolean;
  labSchedule?: boolean;
};

export type JobCardListing = {
  id?: string;
  title?: string;
  status?: string;
  purpose?: string;
  classificationKind?: string;
  funded?: boolean;
  fundingClass?: string;
  escrowTxHash?: string | null;
  payoutStatus?: string | null;
  paymentStatus?: string | null;
  bountyHubPaymentStatus?: string | null;
  githubIssueState?: string | null;
  agentAccess?: string;
  slotsAvailable?: number;
  deadlineAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type JobCard = {
  schema?: string;
  dataLabel?: string;
  fixtureKind?: string;
  observationDate?: string;
  capturedAt?: string;
  notes?: string;
  source?: JobCardSource;
  listing?: JobCardListing;
  reward?: {
    gross?: string | number | null;
    net?: string | number | null;
    feeBps?: string | number | null;
    asset?: string | null;
    network?: string | null;
    provenance?: string | null;
  };
  competition?: {
    submissions?: number;
    winnerOnly?: boolean;
  };
  claim?: {
    available?: boolean;
    state?: string;
    method?: string;
    endpoint?: string;
    identityRequired?: boolean;
    agentAccess?: string;
    requires?: string[];
    reason?: string;
  };
  assignment?: {
    reserved?: boolean;
    assigned?: boolean;
    awardStatus?: string | null;
  };
  walletlessIou?: boolean;
  /** Hostile / test-only: ignored. GET 200 cannot mint agent claim authority. */
  claimAuthority?: string;
};

export type ScoreOptions = {
  now?: string | Date | number;
};

export type Envelope = {
  schema: "arena.a3.workability-dimensions.envelope.v1";
  observationDate: string;
  generatedAt: string;
  card: {
    id: string | null;
    title: string;
    fixtureKind: string | null;
    sourceName: string | null;
  };
  packet: Packet;
  doNotStartWork: boolean;
  warnings: string[];
  diagnostics: {
    mixedScoreIsDisplayOnly: true;
    fabricatedAuthorityRejected: boolean;
    winProbabilityGuess?: { value: number; labelled: "guess"; formula: string };
    reasons: string[];
    reused: {
      bountyIntelligenceFixtures: boolean;
      externalJobIntake: boolean;
      capabilityPreflight: boolean;
      outsideOperatorFirstJob: boolean;
    };
  };
};
