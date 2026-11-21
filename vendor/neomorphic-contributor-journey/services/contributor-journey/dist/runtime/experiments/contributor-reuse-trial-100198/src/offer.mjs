import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashTermsVersion } from "../deps/canonical/hash.mjs";
import { CONTRIBUTOR_ID_GRAMMAR } from "./ids.mjs";
import {
  ALLOCATION,
  ALLOCATION_ATOMIC,
  ARCHIVE_REL,
  ARCHIVE_SHA256,
  ASSET,
  CLIENT_ARCHIVE,
  CLIENT_VERSION,
  CURRENT_OFFER_URL,
  FROZEN_CURRENT_CLIENT_ARCHIVE,
  FROZEN_CURRENT_CLIENT_SHA256,
  FROZEN_CURRENT_CLIENT_VERSION,
  PREPARED_CLIENT_ARCHIVE,
  PREPARED_CLIENT_VERSION,
  BALANCE_READ_AT,
  COMPAT_ID,
  CONTACT,
  DOCUMENTED_EXTRACT_DIR,
  EXPIRES_AT,
  KIT_ENTRY,
  LIQUID_BALANCE,
  MAX_ACCEPTED,
  NETWORK,
  OFFER_ID,
  OFFER_VERSION,
  REWARD,
  REWARD_ATOMIC,
  SCHEMA_OFFER,
  SCHEMA_TERMS,
  TASK_ID,
  TASK_SCOPE,
  WORKING_EXTRACT_DIR,
} from "./constants.mjs";

export function repoRootFromHere(here) {
  return join(here, "../../..");
}

export function loadTerms(dir) {
  const terms = JSON.parse(readFileSync(join(dir, "terms/instance.json"), "utf8"));
  const issues = validateTermsShape(terms);
  if (issues.length > 0) {
    const error = new Error(issues.join("; "));
    error.code = "stale_terms";
    throw error;
  }
  const expected = hashTermsVersion(terms);
  if (terms.termsVersion !== expected) {
    const error = new Error("termsVersion does not match the canonical terms body");
    error.code = "stale_terms";
    error.expected = expected;
    throw error;
  }
  return terms;
}

export function validateTermsShape(terms) {
  const issues = [];
  if (!terms || typeof terms !== "object" || Array.isArray(terms)) return ["terms must be an object"];
  if (terms.schema !== SCHEMA_TERMS) issues.push("schema");
  if (terms.offerId !== OFFER_ID) issues.push("offerId");
  if (terms.offerVersion !== OFFER_VERSION) issues.push("offerVersion");
  if (terms.taskId !== TASK_ID) issues.push("taskId");
  if (terms.evidenceClass !== "sponsored_evaluation") issues.push("evidenceClass");
  if (terms.organicCustomer !== false) issues.push("organicCustomer");
  if (terms.customerRevenue !== false) issues.push("customerRevenue");
  if (terms.reward?.amount !== REWARD) issues.push("reward.amount");
  if (terms.reward?.amountAtomic !== REWARD_ATOMIC.toString()) issues.push("reward.amountAtomic");
  if (terms.reward?.asset !== ASSET || terms.reward?.network !== NETWORK) issues.push("reward rail");
  if (terms.reward?.decimals !== 6) issues.push("decimals");
  if (terms.allocation?.amount !== ALLOCATION) issues.push("allocation.amount");
  if (terms.allocation?.amountAtomic !== ALLOCATION_ATOMIC.toString()) issues.push("allocation.amountAtomic");
  if (terms.allocation?.maxAccepted !== MAX_ACCEPTED) issues.push("maxAccepted");
  if (terms.allocation?.escrowed !== false || terms.allocation?.spent !== "0") issues.push("allocation state");
  if (terms.allocation?.automaticIncrease !== false) issues.push("automaticIncrease");
  if (terms.availability?.expiresAt !== EXPIRES_AT) issues.push("expiresAt");
  if (terms.availability?.openedByWorker !== false) issues.push("openedByWorker");
  if (terms.availability?.acceptsPublicSubmissions !== false) issues.push("acceptsPublicSubmissions");
  if (terms.scope?.archiveSha256 !== ARCHIVE_SHA256) issues.push("archiveSha256");
  if (terms.scope?.usefulNegativeEarnsIdenticalReward !== true) issues.push("usefulNegative");
  if (terms.scope?.endorsementRequired !== false) issues.push("endorsementRequired");
  if (terms.scope?.referralRequired !== false) issues.push("referralRequired");
  if (terms.scope?.preferredCommercialConclusion !== false) issues.push("preferredCommercialConclusion");
  if (terms.claim?.route !== "email" || terms.claim?.asynchronous !== true || terms.claim?.instantApi !== false) {
    issues.push("claim route");
  }
  if (terms.claim?.to !== CONTACT) issues.push("claim destination");
  if (terms.claim?.walletRequiredToSubmit !== false) issues.push("walletRequiredToSubmit");
  if (terms.hosted?.providerDbEnrollment !== "unavailable") issues.push("providerDbEnrollment");
  if (terms.hosted?.replacementDatabaseProvisioned !== false) issues.push("replacementDatabase");
  if (terms.hosted?.kernelBooted !== false) issues.push("kernelBooted");
  if (terms.hosted?.paymentAdapter !== "null_nonpaying_v0") issues.push("paymentAdapter");
  if (terms.authority?.workerMaySign !== false || terms.authority?.workerMayPay !== false) issues.push("worker authority");
  if (terms.authority?.workerMayContact !== false) issues.push("workerMayContact");
  if (terms.authority?.balanceIsRevenueClaim !== false) issues.push("balanceIsRevenueClaim");
  if (terms.expiryCancelsAccepted !== false) issues.push("expiryCancelsAccepted");
  if (terms.publicAcceptanceIsGrant !== false) issues.push("publicAcceptanceIsGrant");
  if (terms.historicalH15Slots !== "closed_not_in_this_offer") issues.push("historicalH15Slots");
  if (typeof terms.termsVersion !== "string" || !/^sha256:[0-9a-f]{64}$/.test(terms.termsVersion)) {
    issues.push("termsVersion shape");
  }
  return issues;
}

export const MAILBOX = Object.freeze({
  address: CONTACT,
  recordedFor: "root_delivery_verification_before_opening",
  deliveryVerified: false,
  workerClaimsLive: false,
  hostedApi: "unavailable",
  channel: "asynchronous_mailbox_plus_root_import",
});

export function machineOffer(terms) {
  return {
    schema: SCHEMA_OFFER,
    offerId: terms.offerId,
    offerVersion: terms.offerVersion,
    termsVersion: terms.termsVersion,
    taskId: terms.taskId,
    taskScope: TASK_SCOPE,
    evidenceClass: "sponsored_evaluation",
    organicCustomer: false,
    customerRevenue: false,
    openedByWorker: false,
    publicExport: false,
    historicalH15Slots: "closed",
    reward: {
      amount: REWARD,
      asset: ASSET,
      network: NETWORK,
      identicalForUsefulNegative: true,
      conditionedOnEndorsement: false,
      conditionedOnReferral: false,
      conditionedOnCommercialConclusion: false,
      escrowed: false,
      automated: false,
    },
    allocation: {
      amount: ALLOCATION,
      maxAccepted: MAX_ACCEPTED,
      escrowed: false,
      spent: "0",
      automaticIncrease: false,
      note: "Allocated internal commitment. Not escrow and not spent by this trial builder.",
    },
    authority: {
      balanceReadAt: BALANCE_READ_AT,
      liquidBalanceUsdc: LIQUID_BALANCE,
      balanceIsRevenueClaim: false,
      network: NETWORK,
      asset: ASSET,
      signer: "root",
      workerMaySign: false,
      workerMayPay: false,
      workerMayContact: false,
      settlementBy: "root",
    },
    availability: {
      state: "prepared",
      acceptsPublicSubmissions: false,
      expiresAt: EXPIRES_AT,
      expiryCancelsAccepted: false,
      openCommand: "node bin/trial.mjs open --ledger <root-ledger.json>",
      note: "Prepared. Not open. Root opens a reserved ledger only after mailbox delivery is verified and a real cold envelope arrives.",
    },
    prerequisites: {
      node: "22.x",
      archive: ARCHIVE_REL,
      archiveSha256: ARCHIVE_SHA256,
      documentedExtractDirectory: DOCUMENTED_EXTRACT_DIR,
      workingExtractDirectory: WORKING_EXTRACT_DIR,
      entry: KIT_ENTRY,
      originalInput: "fixtures/journey-input.json inside the archive",
      correctColdCommand: "tar -xzf capability-preflight.tar.gz && cd capability-preflight && node bin/capability-consumer-kit.mjs journey --input fixtures/journey-input.json --out report.json",
      wallet: false,
      hostedDatabase: false,
      providerDbEnrollment: "unavailable",
      submissionChannel: MAILBOX.channel,
      hostedApi: "unavailable",
      mailbox: CONTACT,
      mailboxDeliveryVerified: false,
    },
    claim: {
      route: "email",
      channel: MAILBOX.channel,
      hostedApi: "unavailable",
      to: CONTACT,
      mailbox: MAILBOX,
      subject: `${OFFER_ID} claim`,
      asynchronous: true,
      instantApi: false,
      walletRequiredToSubmit: false,
      payoutDestinationRequiredFor: "settlement_only",
      grantPreimageInEmail: false,
      contributorPublicIdGrammar: CONTRIBUTOR_ID_GRAMMAR,
      prepareCommand: "node bin/trial.mjs claim --current <discover.json> --contributor-id <id> --idempotency-key <sha256:64hex> --out <dir>",
      importCommand: "node bin/trial.mjs import --ledger <root-ledger.json> --envelope <claim-email.json>",
      transmittedByWorker: false,
    },
    submission: {
      route: "email",
      channel: MAILBOX.channel,
      hostedApi: "unavailable",
      to: CONTACT,
      grantPreimageInEmail: false,
      prepareCommand: "node bin/trial.mjs submit --measurement <measurement.json> --outcome <useful_positive|useful_negative> --idempotency-key <sha256:64hex> --claim-local <claim-local.json> --out <dir>",
      importCommand: "node bin/trial.mjs submit --ledger <root-ledger.json> --submission <submission-email.json>",
      legacyLocalCommand: "node bin/trial.mjs submit --ledger <root-ledger.json> --submission <local-submission.json> --grant-preimage <local-only> --evidence <measurement.json>",
      transmittedByWorker: false,
      evidence: "bounded evidence export inside submission-email.json. Root replays the pinned subject. A signature is not proof of useful work.",
    },
    receiving: {
      route: "asynchronous_mailbox_plus_root_import",
      hostedApi: "unavailable",
      permittedMailboxFiles: ["claim-email.json", "submission-email.json", "result-request.json"],
      grantPreimageInEmail: false,
      measurementFileRequired: false,
      legacyLocalSuppliedSecret: "explicit --grant-preimage on one machine. Not mailbox receiving.",
      importCommand: "node bin/trial.mjs submit --ledger <root-ledger.json> --submission <submission-email.json>",
      inspectCommand: "node bin/trial.mjs inspect --ledger <root-ledger.json> --reservation <rsv>",
      acceptCommand: "node bin/trial.mjs decide --ledger <root-ledger.json> --reservation <rsv> --outcome accept",
      readRequestCommand: "node bin/trial.mjs request-result --claim-local <claim-local.json> --reservation <rsv> --out <dir>",
      replyCommand: "node bin/trial.mjs reply --ledger <root-ledger.json> --request <result-request.json> --out <dir>",
      proof: "Ed25519 message-proof-of-control bound to the original claim, offer, terms, reservation, submission identity, and evidence digest. Not a payout signer. Not an identity service.",
      workProof: "Root replays the pinned capability-preflight subject. A claimed measurement or a signature is not proof of useful work.",
    },
    discoveryMode: "offline_prepared_inspection",
    currentAdmission: false,
    preparedSnapshotIsCurrentAdmission: false,
    client: {
      distribution: CLIENT_ARCHIVE,
      version: CLIENT_VERSION,
      acquisitionUrl: `https://neomorphic.io/downloads/contributor-reuse-trial/${CLIENT_VERSION}/${CLIENT_ARCHIVE}`,
      currentOfferUrl: CURRENT_OFFER_URL,
      discovery: "current_https_api",
      preparedInspection: "node bin/trial.mjs discover --prepared",
      discoverySnapshot: "current_client",
      importsPrivateKernelAtLoad: false,
      rootReceivingInArchive: false,
      distinctFromPreparedSnapshot: true,
    },
    preparedClient: {
      distribution: PREPARED_CLIENT_ARCHIVE,
      version: PREPARED_CLIENT_VERSION,
      acquisitionUrl: `https://neomorphic.io/downloads/contributor-reuse-trial/${PREPARED_CLIENT_VERSION}/${PREPARED_CLIENT_ARCHIVE}`,
      discoverySnapshot: "prepared_source_snapshot",
      rootReceivingInArchive: false,
    },
    frozenCurrentClient: {
      distribution: FROZEN_CURRENT_CLIENT_ARCHIVE,
      version: FROZEN_CURRENT_CLIENT_VERSION,
      sha256: FROZEN_CURRENT_CLIENT_SHA256,
      admission: false,
      note: "Frozen previous current client. Not repacked. Its help and journey commands are not today's admission path.",
    },
    outcomes: ["useful_positive", "useful_negative", "reject"],
    compatibility: {
      id: COMPAT_ID,
      summary: "The published archive extracts to capability-preflight, not the README directory s180-capability-consumer-kit. A changed task may retarget string bounds on artifact fields that are strings. A check on a missing field is a useful negative (not_string), not a failed reward and not a release.",
    },
    states: ["accept", "reject", "owed", "paid"],
    paymentAuthority: "none",
    payoutEnabled: false,
  };
}

export function hashOfTerms(terms) {
  return hashTermsVersion(terms);
}
