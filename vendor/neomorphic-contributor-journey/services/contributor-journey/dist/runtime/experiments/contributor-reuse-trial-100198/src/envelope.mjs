import { controlDescriptor, deriveControlKey, proofStatement, signBoundStatement, submissionBodySha256 } from "./control.mjs";
import {
  CONTACT,
  OFFER_ID,
  SCHEMA_CLAIM,
  SCHEMA_SUBMISSION,
  TASK_SCOPE,
} from "./constants.mjs";
import { boundedEvidenceExport, evidenceDigest } from "./evidence-export.mjs";
import { contributorIdAccepted, reservationIdFor, sha256Text } from "./ids.mjs";
import { MAILBOX } from "./offer.mjs";

export function claimEmail(terms, fields) {
  if (!contributorIdAccepted(fields.contributorPublicId)) {
    const error = new Error("contributor id");
    error.code = "bad_claim";
    throw error;
  }
  const email = {
    schema: SCHEMA_CLAIM,
    offerId: OFFER_ID,
    termsVersion: terms.termsVersion,
    idempotencyKey: fields.idempotencyKey,
    grantSha256: sha256Text(fields.grantPreimage),
    contributorPublicId: fields.contributorPublicId,
    taskScope: TASK_SCOPE,
    route: "email",
    channel: MAILBOX.channel,
    hostedApi: "unavailable",
    to: CONTACT,
    mailbox: MAILBOX,
    subject: `${OFFER_ID} claim`,
    transmitted: false,
    asynchronous: true,
    instantApi: false,
    grantPreimageInEmail: false,
  };
  if (fields.controlPublicKey) email.control = controlDescriptor(fields.controlPublicKey);
  return email;
}

export function submissionFromMeasurement(terms, measurement, fields) {
  const outcome = fields.outcome;
  const changed = outcome === "useful_positive" ? measurement.positive : measurement.negative;
  const reservationId = fields.reservationId
    ?? reservationIdFor(terms.termsVersion, fields.claimKey);
  const body = {
    schema: SCHEMA_SUBMISSION,
    offerId: OFFER_ID,
    termsVersion: terms.termsVersion,
    reservationId,
    idempotencyKey: fields.idempotencyKey,
    taskScope: TASK_SCOPE,
    outcome,
    evidenceClass: "sponsored_evaluation",
    organicCustomer: false,
    customerRevenue: false,
    original: {
      status: measurement.original.status,
      exitCode: 0,
      stableSha256: measurement.original.stableSha256,
      taskId: measurement.original.taskId,
    },
    changed: {
      status: changed.status,
      exitCode: 0,
      stableSha256: changed.stableSha256,
      taskId: changed.taskId,
      failures: changed.failures,
    },
    compatibility: outcome === "useful_positive"
      ? { id: measurement.compatibility.id, appliesToChangedTask: true }
      : { id: measurement.compatibility.id, appliesToChangedTask: true, agreedNegative: "not_string:title" },
    endorsementRequired: false,
    referralRequired: false,
    preferredCommercialConclusion: false,
    releaseAcceptance: false,
    tokenReceipts: { kind: "unknown" },
    effort: changed.effort,
    provenance: "cold_archive",
    route: "email",
    channel: MAILBOX.channel,
    hostedApi: "unavailable",
    to: CONTACT,
    transmitted: false,
    grantPreimageInEmail: false,
    evidenceExport: boundedEvidenceExport(measurement, outcome),
  };
  if (fields.contributorPublicId) body.contributorPublicId = fields.contributorPublicId;
  if (fields.grantPreimage && fields.contributorPublicId && fields.claimKey) {
    const derived = deriveControlKey(fields.grantPreimage);
    body.controlProof = signBoundStatement(proofStatement({
      purpose: "submission",
      offerId: OFFER_ID,
      termsVersion: terms.termsVersion,
      reservationId,
      claimIdempotencyKey: fields.claimKey,
      grantSha256: sha256Text(fields.grantPreimage),
      contributorPublicId: fields.contributorPublicId,
      publicKey: derived.publicKey,
      submissionIdempotencyKey: fields.idempotencyKey,
      submissionBodySha256: submissionBodySha256(body),
      evidenceSha256: evidenceDigest(body.evidenceExport),
    }), fields.grantPreimage);
  }
  return {
    email: body,
    local: { ...body, grantPreimage: fields.grantPreimage },
    reservationId,
  };
}
