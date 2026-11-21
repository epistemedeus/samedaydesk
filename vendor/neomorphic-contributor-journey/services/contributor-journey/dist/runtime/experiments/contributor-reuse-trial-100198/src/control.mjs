import { createPrivateKey, createPublicKey, hkdfSync, sign, verify } from "node:crypto";
import { canonicalize } from "../deps/canonical/canonical.mjs";
import { OFFER_ID, PROOF_INFO, PROOF_USE, SCHEMA_PROOF } from "./constants.mjs";
import { evidenceDigest } from "./evidence-export.mjs";
import { sha256Text } from "./ids.mjs";

// RFC 8410 Ed25519 PKCS8 prefix. The 32-byte seed follows. This is not a secret.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function deriveControlKey(preimage) {
  const seed = Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(String(preimage), "utf8"),
    Buffer.from(OFFER_ID, "utf8"),
    Buffer.from(PROOF_INFO, "utf8"),
    32,
  ));
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  seed.fill(0);
  const publicKey = createPublicKey(privateKey).export({ format: "jwk" }).x;
  return { publicKey, privateKey };
}

export function validPublicKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  if (Buffer.from(value, "base64url").length !== 32) return false;
  try {
    createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: value }, format: "jwk" });
    return true;
  } catch {
    return false;
  }
}

export function controlDescriptor(publicKey) {
  return {
    algorithm: "Ed25519",
    publicKey,
    use: PROOF_USE,
    payoutSigner: false,
    identityService: false,
    hostedAuthenticator: false,
  };
}

export function proofStatement(fields) {
  return {
    schema: SCHEMA_PROOF,
    purpose: fields.purpose,
    offerId: fields.offerId,
    termsVersion: fields.termsVersion,
    reservationId: fields.reservationId,
    claimIdempotencyKey: fields.claimIdempotencyKey,
    grantSha256: fields.grantSha256,
    contributorPublicId: fields.contributorPublicId,
    publicKey: fields.publicKey,
    submissionIdempotencyKey: fields.submissionIdempotencyKey ?? null,
    submissionBodySha256: fields.submissionBodySha256 ?? null,
    evidenceSha256: fields.evidenceSha256 ?? null,
    payoutDestination: null,
    rewardAmount: null,
  };
}

export function signBoundStatement(statement, preimage) {
  const derived = deriveControlKey(preimage);
  if (derived.publicKey !== statement.publicKey) {
    const error = new Error("local preimage does not match the claim control key");
    error.code = "grant_mismatch";
    throw error;
  }
  const message = canonicalize(statement);
  return {
    schema: SCHEMA_PROOF,
    algorithm: "Ed25519",
    use: PROOF_USE,
    payoutSigner: false,
    identityService: false,
    hostedAuthenticator: false,
    purpose: statement.purpose,
    publicKey: statement.publicKey,
    statementSha256: sha256Text(message),
    value: sign(null, Buffer.from(message, "utf8"), derived.privateKey).toString("base64url"),
  };
}

export function verifyBoundStatement(statement, proof) {
  if (!proof || proof.schema !== SCHEMA_PROOF) {
    return { ok: false, code: "proof_missing", message: "message proof is missing" };
  }
  if (proof.payoutSigner !== false || proof.identityService !== false || proof.hostedAuthenticator === true) {
    return { ok: false, code: "proof_rejected", message: "a message proof is not a payout signer or an identity service" };
  }
  if (proof.algorithm !== "Ed25519" || proof.use !== PROOF_USE || proof.purpose !== statement.purpose) {
    return { ok: false, code: "proof_failed", message: "message proof does not match this purpose" };
  }
  if (proof.publicKey !== statement.publicKey || statement.payoutDestination !== null || statement.rewardAmount !== null) {
    return { ok: false, code: "proof_failed", message: "proof key does not match the original claim" };
  }
  let message;
  try {
    message = canonicalize(statement);
  } catch {
    return { ok: false, code: "proof_failed", message: "proof statement is not canonical" };
  }
  if (proof.statementSha256 !== sha256Text(message) || typeof proof.value !== "string") {
    return { ok: false, code: "proof_failed", message: "proof statement was swapped" };
  }
  try {
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: statement.publicKey }, format: "jwk" });
    const ok = verify(null, Buffer.from(message, "utf8"), key, Buffer.from(proof.value, "base64url"));
    if (!ok) return { ok: false, code: "proof_failed", message: "message proof did not verify" };
  } catch {
    return { ok: false, code: "proof_failed", message: "message proof did not verify" };
  }
  return { ok: true, statementSha256: proof.statementSha256 };
}

export function submissionBodySha256(submission) {
  const copy = structuredClone(submission);
  delete copy.controlProof;
  delete copy.grantPreimage;
  delete copy.authenticationRoute;
  return sha256Text(canonicalize(copy));
}

function claimBinding(reservation) {
  if (!reservation?.control?.publicKey) {
    return { ok: false, code: "proof_missing", message: "the original claim has no message-proof key and this packet has no grant preimage" };
  }
  return { ok: true };
}

export function verifySubmissionProof(reservation, submission) {
  const bound = claimBinding(reservation);
  if (!bound.ok) return bound;
  if (reservation.status === "revoked") {
    return { ok: false, code: "proof_revoked", message: "revoked proof writes no accepted obligation" };
  }
  if (!submission?.controlProof) {
    return { ok: false, code: "proof_missing", message: "mailbox submission has no proof of control" };
  }
  if (submission.controlProof.publicKey !== reservation.control.publicKey) {
    return { ok: false, code: "proof_failed", message: "proof key does not match the original claim" };
  }
  if (!submission.evidenceExport || submission.evidenceExport.authoritative !== false || submission.evidenceExport.signatureIsWorkProof !== false) {
    return { ok: false, code: "evidence_mismatch", message: "a claimed measurement or a signature is not proof of useful work" };
  }
  let evidenceSha256;
  let bodySha;
  try {
    evidenceSha256 = evidenceDigest(submission.evidenceExport);
    bodySha = submissionBodySha256(submission);
  } catch {
    return { ok: false, code: "proof_failed", message: "submission proof body is not canonical" };
  }
  const verdict = verifyBoundStatement(proofStatement({
    purpose: "submission",
    offerId: reservation.offerId,
    termsVersion: reservation.termsVersion,
    reservationId: reservation.reservationId,
    claimIdempotencyKey: reservation.idempotencyKey,
    grantSha256: reservation.grantSha256,
    contributorPublicId: reservation.contributorPublicId,
    publicKey: reservation.control.publicKey,
    submissionIdempotencyKey: submission.idempotencyKey,
    submissionBodySha256: bodySha,
    evidenceSha256,
  }), submission.controlProof);
  if (!verdict.ok) return verdict;
  return { ok: true, evidenceSha256, statementSha256: verdict.statementSha256 };
}

export function verifyPurposeProof(reservation, proof, purpose) {
  const bound = claimBinding(reservation);
  if (!bound.ok) return bound;
  if (reservation.status === "revoked" && purpose !== "revoke") {
    return { ok: false, code: "proof_revoked", message: "revoked proof cannot read or replace this claim" };
  }
  if (proof?.publicKey && proof.publicKey !== reservation.control.publicKey) {
    return { ok: false, code: "proof_failed", message: "proof key does not match the original claim" };
  }
  return verifyBoundStatement(proofStatement({
    purpose,
    offerId: reservation.offerId,
    termsVersion: reservation.termsVersion,
    reservationId: reservation.reservationId,
    claimIdempotencyKey: reservation.idempotencyKey,
    grantSha256: reservation.grantSha256,
    contributorPublicId: reservation.contributorPublicId,
    publicKey: reservation.control.publicKey,
  }), proof);
}
