import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CLIENT_VERSION,
  CONTACT,
  DISCOVER_MAX_BYTES,
  DISCOVER_TIMEOUT_MS,
  EXIT,
  FROZEN_CURRENT_CLIENT_SHA256,
  FROZEN_CURRENT_CLIENT_VERSION,
  OFFER_ID,
  PREPARED_CLIENT_VERSION,
  REWARD,
  SCHEMA_CLAIM,
  SCHEMA_SUBMISSION,
} from "./constants.mjs";
import { discoverCurrent } from "./discover.mjs";
import { claimEmail, submissionFromMeasurement } from "./envelope.mjs";
import { evaluate } from "./evaluate.mjs";
import { contributorIdAccepted } from "./ids.mjs";
import { deriveControlKey } from "./control.mjs";
import { randomBytes } from "node:crypto";

const KEY = /^sha256:[0-9a-f]{64}$/;
const HISTORICAL = new Set(["prepared", "closed", "not_admitted", "artifact_missing", "frozen_offer_unusable"]);

export function participantHelp() {
  return {
    schema: "neomorphic.contributor-reuse-trial.participant-help.v1",
    clientVersion: CLIENT_VERSION,
    preparedSnapshotVersion: PREPARED_CLIENT_VERSION,
    frozenCurrentClientVersion: FROZEN_CURRENT_CLIENT_VERSION,
    frozenCurrentClientSha256: FROZEN_CURRENT_CLIENT_SHA256,
    currentAdmissionCommand: "discover",
    historicalInspectionCommand: "discover --prepared",
    historicalSnapshotIsAdmission: false,
    journeyCommand: "journey",
    handoffCommand: "handoff",
    hostedSubmit: "unavailable",
    walletRequired: false,
    accountRequired: false,
    rootReceivingInThisArchive: false,
    rootAbsenceIsNotAdmission: true,
    reward: REWARD,
    positiveAndNegativeQualifyEqually: true,
    preparedEnvelopeIsDeliveredMail: false,
    mailbox: CONTACT,
    commands: [
      "discover",
      "prerequisites",
      "help",
      "journey",
      "handoff",
      "evaluate",
      "claim",
      "submit",
      "request-result",
      "read-reply",
    ],
    nextAction: "Run discover for today's admission. Run journey to evaluate and prepare local envelopes. Mail those files yourself. This client does not send them.",
  };
}

export function admissionSeam(discovered) {
  const body = discovered?.body ?? {};
  const current = body.availabilityClass === "current_ledger";
  if (discovered?.ok === true) {
    return {
      proceed: true,
      usedHistoricalSnapshotAsGate: false,
      admissionDecision: "open",
      admissionSource: "current_ledger",
      historicalSnapshotIgnored: true,
      code: "ok",
      exit: EXIT.ok,
      message: "open at the caller clock",
    };
  }
  if (!current && HISTORICAL.has(body.reason)) {
    return {
      proceed: false,
      usedHistoricalSnapshotAsGate: false,
      admissionDecision: "not_made",
      admissionSource: "historical_snapshot",
      historicalSnapshotIgnored: true,
      code: "historical_snapshot_not_admission",
      exit: EXIT.unavailable,
      message: "The prepared or closed historical snapshot is not today's admission. No current ledger projection was published, so this command did not refuse an open offer.",
    };
  }
  return {
    proceed: false,
    usedHistoricalSnapshotAsGate: false,
    admissionDecision: "refused",
    admissionSource: current ? "current_ledger" : "current_discovery",
    historicalSnapshotIgnored: true,
    code: discovered?.code ?? "not_admitted",
    exit: discovered?.exit ?? EXIT.unavailable,
    message: discovered?.message ?? "current offer is not open at the caller clock",
  };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateMailboxBodies({ claim, submission }) {
  if (!claim || typeof claim !== "object" || !submission || typeof submission !== "object") {
    return { ok: false, exit: EXIT.usage, code: "malformed", message: "claim and submission bodies are required" };
  }
  if (claim.schema !== SCHEMA_CLAIM || submission.schema !== SCHEMA_SUBMISSION) {
    return { ok: false, exit: EXIT.wrong_subject, code: "wrong_offer", message: "mailbox body schema" };
  }
  if (claim.offerId !== OFFER_ID || submission.offerId !== OFFER_ID) {
    return { ok: false, exit: EXIT.wrong_subject, code: "wrong_offer", message: "mailbox offer" };
  }
  if (claim.to !== CONTACT || submission.to !== CONTACT) {
    return { ok: false, exit: EXIT.usage, code: "bad_recipient", message: "mailbox recipient is not the published contact address" };
  }
  if (claim.route !== "email" || submission.route !== "email") {
    return { ok: false, exit: EXIT.usage, code: "bad_operation", message: "mailbox operation is email, not a hosted submit" };
  }
  if (claim.hostedApi !== "unavailable" || submission.hostedApi !== "unavailable") {
    return { ok: false, exit: EXIT.usage, code: "hosted_submit", message: "hosted submit does not exist" };
  }
  if (claim.grantPreimage || submission.grantPreimage || claim.grantPreimageInEmail !== false || submission.grantPreimageInEmail !== false) {
    return { ok: false, exit: EXIT.private_input, code: "private_input", message: "mailbox body contains the grant preimage" };
  }
  if (claim.transmitted === true || submission.transmitted === true) {
    return { ok: false, exit: EXIT.conflict, code: "not_delivered", message: "a prepared envelope is not delivered mail" };
  }
  if (!contributorIdAccepted(claim.contributorPublicId)) {
    return { ok: false, exit: EXIT.usage, code: "bad_claim", message: "contributor id" };
  }
  if (submission.contributorPublicId && submission.contributorPublicId !== claim.contributorPublicId) {
    return { ok: false, exit: EXIT.unauthenticated, code: "wrong_contributor", message: "submission contributor does not match the claim" };
  }
  return {
    ok: true,
    recipient: CONTACT,
    operations: ["claim", "submission"],
    delivered: false,
    transmitted: false,
    hostedSubmit: "unavailable",
    preparedEnvelopeIsDeliveredMail: false,
  };
}

export function handoffDocument(verdict, extra = {}) {
  return {
    schema: "neomorphic.contributor-reuse-trial.mailbox-handoff.v1",
    ok: verdict.ok === true,
    code: verdict.ok ? "prepared_not_sent" : verdict.code,
    recipient: verdict.ok ? CONTACT : null,
    operations: verdict.ok ? ["claim", "submission"] : [],
    delivered: false,
    transmitted: false,
    hostedSubmit: "unavailable",
    preparedEnvelopeIsDeliveredMail: false,
    sendsMail: false,
    reservationIsObligation: false,
    nextAction: verdict.ok
      ? `Mail claim-email.json and submission-email.json to ${CONTACT}. This command did not send them.`
      : verdict.message,
    ...extra,
  };
}

function armView(arm) {
  if (!arm) return null;
  return {
    taskId: arm.taskId ?? null,
    status: arm.status ?? null,
    exitCode: arm.exitCode ?? null,
    failures: arm.failures ?? [],
    stableSha256: arm.stableSha256 ?? null,
    directBaseline: arm.directBaseline ?? null,
    executed: arm.exitCode === 0,
    releaseAcceptance: false,
  };
}

export async function runParticipantJourney({
  offerUrl,
  now,
  timeoutMs = DISCOVER_TIMEOUT_MS,
  maxBytes = DISCOVER_MAX_BYTES,
  subject,
  repoRoot,
  out,
  contributorId,
  claimKey,
  submitKey,
  outcome,
  grantPreimage,
}) {
  if (out && (existsSync(join(out, "claim", "claim-email.json")) || existsSync(join(out, "submission", "submission-email.json")))) {
    return {
      ok: false,
      exit: EXIT.duplicate,
      code: "duplicate",
      message: "envelopes already exist; this command does not open a second claim",
      body: { delivered: false, transmitted: false },
    };
  }
  const discovered = await discoverCurrent({
    url: offerUrl,
    receivedAt: now,
    timeoutMs,
    maxBytes,
  });
  const seam = admissionSeam(discovered);
  if (!seam.proceed) {
    const body = {
      ok: false,
      code: seam.code,
      message: seam.message,
      admissionDecision: seam.admissionDecision,
      admissionSource: seam.admissionSource,
      usedHistoricalSnapshotAsGate: false,
      historicalSnapshotIgnored: true,
      delivered: false,
      transmitted: false,
      hostedSubmit: "unavailable",
      discover: discovered.body ?? null,
    };
    if (out) writeJson(join(out, "admission.json"), body);
    return { ok: false, exit: seam.exit, code: seam.code, message: seam.message, body };
  }
  if (!subject) {
    return { ok: false, exit: EXIT.usage, code: "usage", message: "journey --subject <capability-preflight.tar.gz> --out <dir>" };
  }
  if (!out || !contributorId || !claimKey || !submitKey || (outcome !== "useful_positive" && outcome !== "useful_negative")) {
    return { ok: false, exit: EXIT.usage, code: "usage", message: "journey needs --out, --contributor-id, --claim-key, --submit-key, and --outcome useful_positive|useful_negative" };
  }
  if (!contributorIdAccepted(contributorId)) {
    return { ok: false, exit: EXIT.usage, code: "bad_claim", message: "contributor id" };
  }
  if (!KEY.test(claimKey) || !KEY.test(submitKey)) {
    return { ok: false, exit: EXIT.usage, code: "usage", message: "idempotency key" };
  }
  const started = Date.now();
  let measurement;
  try {
    measurement = evaluate({ subjectArchive: subject, repoRoot });
  } catch (error) {
    return { ok: false, exit: EXIT.wrong_subject, code: "evaluation_failed", message: error.message };
  }
  const observedEvaluationMs = Date.now() - started;
  const positive = armView(measurement.positive);
  const negative = armView(measurement.negative);
  if (!positive?.executed || positive.status !== "utility_ok_not_release" || !positive.directBaseline) {
    return { ok: false, exit: EXIT.wrong_subject, code: "evaluation_failed", message: "positive arm did not execute against an equal baseline" };
  }
  if (!negative?.executed || !negative.failures.includes("not_string:title") || negative.status !== "integrated_partial" || !negative.directBaseline) {
    return { ok: false, exit: EXIT.wrong_subject, code: "evaluation_failed", message: "negative arm did not execute not_string:title against an equal baseline" };
  }
  const preimage = grantPreimage ?? randomBytes(32).toString("hex");
  const discoverPath = join(out, "discover.json");
  writeJson(discoverPath, discovered.body);
  writeJson(join(out, "measurement", "measurement.json"), measurement);
  const email = claimEmail({ termsVersion: discovered.body.termsVersion }, {
    idempotencyKey: claimKey,
    grantPreimage: preimage,
    contributorPublicId: contributorId,
    controlPublicKey: deriveControlKey(preimage).publicKey,
  });
  const claimDir = join(out, "claim");
  writeJson(join(claimDir, "claim-email.json"), email);
  writeJson(join(claimDir, "claim-local.json"), { ...email, grantPreimage: preimage });
  const built = submissionFromMeasurement({ termsVersion: discovered.body.termsVersion }, measurement, {
    outcome,
    claimKey,
    idempotencyKey: submitKey,
    grantPreimage: preimage,
    contributorPublicId: contributorId,
  });
  writeJson(join(out, "submission", "submission-email.json"), built.email);
  writeJson(join(out, "submission", "submission-local.json"), built.local);
  const verdict = validateMailboxBodies({ claim: email, submission: built.email });
  const handoff = handoffDocument(verdict, {
    outcome,
    reservationId: built.reservationId,
    observedEvaluationMs,
  });
  writeJson(join(out, "handoff.json"), handoff);
  const summary = {
    ok: true,
    code: "prepared_not_sent",
    clientVersion: CLIENT_VERSION,
    admissionDecision: "open",
    admissionSource: "current_ledger",
    usedHistoricalSnapshotAsGate: false,
    historicalSnapshotIgnored: true,
    outcome,
    reward: REWARD,
    positiveAndNegativeQualifyEqually: true,
    positive,
    negative,
    effort: {
      contributor: measurement.contributorEffort ?? null,
      requester: measurement.rootReviewEffort ?? null,
      observedEvaluationMs,
      tokens: { kind: "unknown" },
      cash: { kind: "unknown" },
    },
    delivered: false,
    transmitted: false,
    hostedSubmit: "unavailable",
    accepted: false,
    paid: false,
    reservationId: built.reservationId,
    files: {
      discover: "discover.json",
      measurement: "measurement/measurement.json",
      claimEmail: "claim/claim-email.json",
      submissionEmail: "submission/submission-email.json",
      handoff: "handoff.json",
    },
    nextAction: handoff.nextAction,
  };
  writeJson(join(out, "journey.json"), summary);
  return { ok: true, exit: EXIT.ok, code: "prepared_not_sent", message: handoff.nextAction, body: summary };
}

export function readHandoffPair(claimPath, submissionPath) {
  let claim;
  let submission;
  try {
    claim = readJson(claimPath);
    submission = readJson(submissionPath);
  } catch {
    return { ok: false, exit: EXIT.usage, code: "malformed", message: "mailbox body is not json" };
  }
  const verdict = validateMailboxBodies({ claim, submission });
  if (!verdict.ok) return verdict;
  return { ok: true, claim, submission, verdict };
}
