import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalize } from "../deps/canonical/canonical.mjs";
import { deriveControlKey, proofStatement, signBoundStatement } from "./control.mjs";
import {
  ADMITTED_CLIENT_ARCHIVE,
  CLIENT_ARCHIVE,
  CLIENT_VERSION,
  CONTACT,
  DISCOVER_MAX_BYTES,
  DISCOVER_TIMEOUT_MS,
  EXIT,
  FROZEN_CURRENT_CLIENT_ARCHIVE,
  FROZEN_CURRENT_CLIENT_SHA256,
  FROZEN_CURRENT_CLIENT_VERSION,
  OFFER_ID,
  PREPARED_CLIENT_ARCHIVE,
  PREPARED_CLIENT_SHA256,
  PREPARED_CLIENT_VERSION,
  SCHEMA_READ_REQUEST,
  SCHEMA_REVOCATION,
} from "./constants.mjs";
import { claimAdmission, discoverCurrent } from "./discover.mjs";
import { claimEmail, submissionFromMeasurement } from "./envelope.mjs";
import { contributorIdAccepted, sha256Text } from "./ids.mjs";
import { evaluate } from "./evaluate.mjs";
import { loadTerms, machineOffer } from "./offer.mjs";
import { handoffDocument, participantHelp, readHandoffPair, runParticipantJourney } from "./participant.mjs";
import { defaultSubjectArchive, inRepoCheckout, REPO_ROOT, TRIAL_DIR } from "./paths.mjs";

export { REPO_ROOT, TRIAL_DIR };

const here = dirname(fileURLToPath(import.meta.url));
const PACK_STAMP = "2026-10-01T21:10:00Z";
const PACK_FILES = [
  "DEPENDENCIES.md",
  "LICENSE",
  "PINS.json",
  "README.md",
  "RUNBOOK.md",
  "SOURCE-NOTICE.txt",
  "bin/trial.mjs",
  "deps/canonical/LICENSE",
  "deps/canonical/SOURCE-NOTICE.txt",
  "deps/canonical/canonical.mjs",
  "deps/canonical/hash.mjs",
  "mailbox/RECEIVING-FAILURE-100218.json",
  "mailbox/ROOT-DELIVERY.json",
  "offer/machine-offer.json",
  "package.json",
  "schema/terms.v1.json",
  "src/cli.mjs",
  "src/constants.mjs",
  "src/control.mjs",
  "src/current-availability.mjs",
  "src/discover.mjs",
  "src/envelope.mjs",
  "src/evidence-export.mjs",
  "src/evaluate.mjs",
  "src/ids.mjs",
  "src/offer.mjs",
  "src/participant.mjs",
  "src/paths.mjs",
  "src/privacy.mjs",
  "src/settlement-state.mjs",
  "src/terms.mjs",
  "terms/instance.json",
];

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) out[key] = true;
    else {
      out[key] = value;
      i += 1;
    }
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadLedger(path) {
  if (!path) return null;
  try {
    return readJson(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function persist(path, result) {
  if (!path || !result?.ledger) return;
  const keep = result.ok || result.code === "expired" || result.code === "settlement_unknown" || result.code === "task_mismatch";
  if (!keep) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result.ledger, null, 2)}\n`);
}

function emit(result) {
  const body = result.result ?? { ok: result.ok, code: result.code, message: result.message };
  process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  if (!result.ok && result.message) process.stderr.write(`${result.code}: ${result.message}\n`);
  return result.exit ?? (result.ok ? 0 : EXIT.usage);
}

function missingModule(error) {
  const code = error?.code || error?.cause?.code;
  if (code === "ERR_MODULE_NOT_FOUND") return true;
  const message = String(error?.message ?? "");
  return message.includes("Cannot find module") || message.includes("ERR_MODULE_NOT_FOUND");
}

async function loadRoot() {
  try {
    return await import("./root.mjs");
  } catch (error) {
    if (missingModule(error)) return null;
    throw error;
  }
}

function rootAbsent() {
  process.stderr.write("root_receiving_absent: Root receiving is not in this archive. Mail the envelope for a Root import. No hosted API is enrolled.\n");
  process.stdout.write(`${JSON.stringify({
    ok: false,
    code: "root_receiving_absent",
    channel: "asynchronous_mailbox_plus_root_import",
    hostedApi: "unavailable",
    deliveryVerified: false,
  }, null, 2)}\n`);
  return EXIT.unavailable;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function localProof(local, purpose, reservationId) {
  if (!local?.grantPreimage || !local.control?.publicKey || !local.idempotencyKey || !local.contributorPublicId || !local.termsVersion) {
    return { exit: EXIT.usage };
  }
  if (deriveControlKey(local.grantPreimage).publicKey !== local.control.publicKey) {
    process.stderr.write("grant_mismatch: claim-local control key does not match the preimage\n");
    return { exit: EXIT.unauthenticated };
  }
  const statement = proofStatement({
    purpose,
    offerId: local.offerId ?? OFFER_ID,
    termsVersion: local.termsVersion,
    reservationId,
    claimIdempotencyKey: local.idempotencyKey,
    grantSha256: local.grantSha256,
    contributorPublicId: local.contributorPublicId,
    publicKey: local.control.publicKey,
  });
  return { proof: signBoundStatement(statement, local.grantPreimage), statementSha256: sha256Text(canonicalize(statement)) };
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parse(argv);
  const command = flags._[0];
  const now = flags.now ?? new Date().toISOString();
  if (!command || flags.help) {
    process.stdout.write("help | discover [--prepared | --offer-url <isolated>] | prerequisites | journey | handoff | evaluate | claim | submit | request-result | read-reply | open | import | receive | inspect | decide | status | retrieve | reply | revoke | settle | observe | pack | kernel-compare | remote\n");
    return command ? EXIT.ok : EXIT.usage;
  }
  if (command === "help") {
    process.stdout.write(`${JSON.stringify(participantHelp(), null, 2)}\n`);
    return EXIT.ok;
  }
  const terms = loadTerms(join(here, ".."));
  const offer = machineOffer(terms);
  if (command === "discover") {
    if (flags.prepared === true) {
      process.stdout.write(`${JSON.stringify(offer, null, 2)}\n`);
      return EXIT.ok;
    }
    const timeoutMs = flags["timeout-ms"] == null ? DISCOVER_TIMEOUT_MS : Number(flags["timeout-ms"]);
    const maxBytes = flags["max-bytes"] == null ? DISCOVER_MAX_BYTES : Number(flags["max-bytes"]);
    const discovered = await discoverCurrent({
      url: flags["offer-url"],
      receivedAt: now,
      timeoutMs,
      maxBytes,
    });
    process.stdout.write(`${JSON.stringify(discovered.body, null, 2)}\n`);
    if (!discovered.ok) process.stderr.write(`${discovered.code}: ${discovered.message}\n`);
    return discovered.exit;
  }
  if (command === "prerequisites") {
    process.stdout.write(`${JSON.stringify({
      ...offer.prerequisites,
      wallet: false,
      accountRequired: false,
      historicalSnapshotIsAdmission: false,
      currentAdmissionCommand: "discover",
      journeyCommand: "journey",
    }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (command === "journey") {
    const subject = flags.subject
      ? resolve(flags.subject)
      : (inRepoCheckout() ? defaultSubjectArchive() : null);
    const timeoutMs = flags["timeout-ms"] == null ? DISCOVER_TIMEOUT_MS : Number(flags["timeout-ms"]);
    const maxBytes = flags["max-bytes"] == null ? DISCOVER_MAX_BYTES : Number(flags["max-bytes"]);
    const journey = await runParticipantJourney({
      offerUrl: flags["offer-url"],
      now,
      timeoutMs,
      maxBytes,
      subject,
      repoRoot: !flags.subject && inRepoCheckout() ? REPO_ROOT : null,
      out: flags.out ? resolve(flags.out) : null,
      contributorId: flags["contributor-id"],
      claimKey: flags["claim-key"] ?? flags["idempotency-key"],
      submitKey: flags["submit-key"],
      outcome: flags.outcome,
      grantPreimage: flags["grant-preimage"],
    });
    process.stdout.write(`${JSON.stringify(journey.body ?? { ok: false, code: journey.code, message: journey.message, delivered: false, transmitted: false }, null, 2)}\n`);
    if (!journey.ok && journey.message) process.stderr.write(`${journey.code}: ${journey.message}\n`);
    return journey.exit;
  }
  if (command === "handoff") {
    if (!flags.claim || !flags.submission) return EXIT.usage;
    const read = readHandoffPair(flags.claim, flags.submission);
    const document = read.ok
      ? handoffDocument(read.verdict)
      : handoffDocument(read);
    if (read.ok && flags.out) writeJson(join(resolve(flags.out), "next-action.json"), document);
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    if (!read.ok) process.stderr.write(`${read.code}: ${read.message}\n`);
    return read.ok ? EXIT.ok : read.exit;
  }
  if (command === "evaluate") {
    const subject = flags.subject
      ? resolve(flags.subject)
      : (inRepoCheckout() ? defaultSubjectArchive() : null);
    if (!subject) {
      process.stderr.write("usage: evaluate --subject <capability-preflight.tar.gz>\n");
      return EXIT.usage;
    }
    const measurement = evaluate({
      subjectArchive: subject,
      repoRoot: !flags.subject && inRepoCheckout() ? REPO_ROOT : null,
    });
    if (flags.out) writeJson(join(flags.out, "measurement.json"), measurement);
    process.stdout.write(`${JSON.stringify({
      schema: measurement.schema,
      original: measurement.original.status,
      positive: measurement.positive.status,
      later: measurement.later.status,
      negative: measurement.negative.status,
      documentedPathExists: measurement.documentedPathExists,
      reuseGain: measurement.reuseGain,
      releaseAcceptance: measurement.completionQuality.releaseAcceptance,
      tokenReceipts: measurement.tokenReceipts,
    }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (command === "claim") {
    if (!flags["contributor-id"] || !flags["idempotency-key"] || !flags.out) return EXIT.usage;
    if (flags.current === true) return EXIT.usage;
    if (!contributorIdAccepted(flags["contributor-id"])) {
      process.stderr.write("bad_claim: contributor id\n");
      process.stdout.write(`${JSON.stringify({ ok: false, code: "bad_claim", message: "contributor id" }, null, 2)}\n`);
      return EXIT.usage;
    }
    if (typeof flags.current === "string") {
      let admission;
      try {
        admission = readJson(flags.current);
      } catch {
        process.stderr.write("malformed: current admission file\n");
        process.stdout.write(`${JSON.stringify({ ok: false, code: "malformed", message: "current admission file" }, null, 2)}\n`);
        return EXIT.usage;
      }
      const allowed = claimAdmission(admission, terms.termsVersion);
      if (!allowed.ok) {
        process.stderr.write(`${allowed.code}: ${allowed.message}\n`);
        process.stdout.write(`${JSON.stringify({ ok: false, code: allowed.code, message: allowed.message }, null, 2)}\n`);
        return allowed.exit;
      }
    }
    const preimage = flags["grant-preimage"] ?? randomBytes(32).toString("hex");
    const email = claimEmail(terms, {
      idempotencyKey: flags["idempotency-key"],
      grantPreimage: preimage,
      contributorPublicId: flags["contributor-id"],
      controlPublicKey: deriveControlKey(preimage).publicKey,
    });
    writeJson(join(flags.out, "claim-email.json"), email);
    writeJson(join(flags.out, "claim-local.json"), { ...email, grantPreimage: preimage });
    process.stdout.write(`${JSON.stringify({
      transmitted: false,
      to: CONTACT,
      channel: email.channel,
      hostedApi: "unavailable",
      deliveryVerified: false,
      grantPreimageInEmail: false,
      email: "claim-email.json",
      local: "claim-local.json",
    }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (command === "submit" && !flags.ledger) {
    const localClaim = flags["claim-local"] ? readJson(flags["claim-local"]) : null;
    let preimage = flags["grant-preimage"] ?? null;
    let claimKey = flags["claim-key"] ?? null;
    let contributorPublicId = flags["contributor-id"] ?? null;
    if (localClaim) {
      if (!localClaim.grantPreimage || !localClaim.idempotencyKey || !localClaim.contributorPublicId || !localClaim.control?.publicKey) return EXIT.usage;
      if (preimage && preimage !== localClaim.grantPreimage) {
        process.stderr.write("grant_mismatch: claim-local preimage does not match --grant-preimage\n");
        return EXIT.unauthenticated;
      }
      if (claimKey && claimKey !== localClaim.idempotencyKey) return EXIT.unauthenticated;
      if (contributorPublicId && contributorPublicId !== localClaim.contributorPublicId) return EXIT.unauthenticated;
      if (deriveControlKey(localClaim.grantPreimage).publicKey !== localClaim.control.publicKey) return EXIT.unauthenticated;
      preimage = localClaim.grantPreimage;
      claimKey = localClaim.idempotencyKey;
      contributorPublicId = localClaim.contributorPublicId;
    }
    if (!flags.measurement || !flags.outcome || !flags["idempotency-key"] || !preimage || !flags.out) return EXIT.usage;
    if (!flags.reservation && !claimKey) return EXIT.usage;
    if (flags.outcome !== "useful_positive" && flags.outcome !== "useful_negative") return EXIT.wrong_subject;
    const built = submissionFromMeasurement(terms, readJson(flags.measurement), {
      outcome: flags.outcome,
      reservationId: flags.reservation,
      claimKey,
      idempotencyKey: flags["idempotency-key"],
      grantPreimage: preimage,
      contributorPublicId,
    });
    writeJson(join(flags.out, "submission-email.json"), built.email);
    writeJson(join(flags.out, "submission-local.json"), built.local);
    process.stdout.write(`${JSON.stringify({
      transmitted: false,
      to: CONTACT,
      channel: built.email.channel,
      hostedApi: "unavailable",
      grantPreimageInEmail: false,
      reservationId: built.reservationId,
      email: "submission-email.json",
      local: "submission-local.json",
    }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (command === "request-result") {
    if (!flags["claim-local"] || !flags.reservation || !flags.out) return EXIT.usage;
    const local = readJson(flags["claim-local"]);
    const signed = localProof(local, "read", flags.reservation);
    if (signed.exit) return signed.exit;
    const request = {
      schema: SCHEMA_READ_REQUEST,
      purpose: "read",
      offerId: local.offerId ?? OFFER_ID,
      termsVersion: local.termsVersion,
      reservationId: flags.reservation,
      claimIdempotencyKey: local.idempotencyKey,
      contributorPublicId: local.contributorPublicId,
      publicKey: local.control.publicKey,
      controlProof: signed.proof,
      payoutDestination: null,
      channel: "asynchronous_mailbox",
      hostedApi: "unavailable",
      transmitted: false,
      to: CONTACT,
    };
    writeJson(join(flags.out, "result-request.json"), request);
    process.stdout.write(`${JSON.stringify({
      transmitted: false,
      to: CONTACT,
      hostedApi: "unavailable",
      grantPreimageInEmail: false,
      email: "result-request.json",
      reservationId: flags.reservation,
    }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (command === "read-reply") {
    if (!flags["claim-local"] || !flags.reply || !flags.reservation) return EXIT.usage;
    const local = readJson(flags["claim-local"]);
    const reply = readJson(flags.reply);
    const signed = localProof(local, "read", flags.reservation);
    if (signed.exit) return signed.exit;
    const bound = reply?.inReplyTo?.requestStatementSha256 === signed.statementSha256
      && reply?.inReplyTo?.reservationId === flags.reservation
      && reply?.inReplyTo?.offerId === (local.offerId ?? OFFER_ID)
      && reply?.inReplyTo?.termsVersion === local.termsVersion;
    if (!bound) {
      process.stderr.write("proof_failed: mailbox reply is not bound to the original claim request\n");
      return EXIT.unauthenticated;
    }
    if (reply.rootSignature !== null || reply.replyAuthenticatedByRootKey !== false) {
      process.stderr.write("proof_rejected: mailbox reply is not a Root identity signature\n");
      return EXIT.wrong_subject;
    }
    if ((reply.result?.state === "owed" || reply.result?.state === "paid") && reply.result?.reward !== "0.10") {
      process.stderr.write("redirected_reward: mailbox reply reward does not match the offer\n");
      return EXIT.redirect;
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      reservationId: flags.reservation,
      state: "unknown",
      reward: null,
      paid: null,
      reportedState: reply.result?.state ?? null,
      reportedReward: reply.result?.reward ?? null,
      reportedPaid: reply.result?.paid === true,
      evidenceClass: "unverified_mailbox_file",
      obligationVerified: false,
      settlementVerified: false,
      boundToRequest: true,
      replyAuthenticatedByRootKey: false,
      hostedApi: "unavailable",
      channel: "asynchronous_mailbox",
    }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (command === "revoke" && !flags.ledger) {
    if (!flags["claim-local"] || !flags.reservation || !flags.out) return EXIT.usage;
    const local = readJson(flags["claim-local"]);
    const signed = localProof(local, "revoke", flags.reservation);
    if (signed.exit) return signed.exit;
    writeJson(join(flags.out, "revoke-email.json"), {
      schema: SCHEMA_REVOCATION,
      offerId: local.offerId ?? OFFER_ID,
      termsVersion: local.termsVersion,
      reservationId: flags.reservation,
      claimIdempotencyKey: local.idempotencyKey,
      contributorPublicId: local.contributorPublicId,
      controlProof: signed.proof,
      payoutDestination: null,
      channel: "asynchronous_mailbox",
      hostedApi: "unavailable",
      transmitted: false,
      to: CONTACT,
    });
    process.stdout.write(`${JSON.stringify({
      transmitted: false,
      to: CONTACT,
      hostedApi: "unavailable",
      grantPreimageInEmail: false,
      email: "revoke-email.json",
      reservationId: flags.reservation,
    }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (command === "pack") {
    if (!flags.out) return EXIT.usage;
    const out = resolve(flags.out);
    if (basename(out) === PREPARED_CLIENT_ARCHIVE || basename(out) === FROZEN_CURRENT_CLIENT_ARCHIVE || basename(out) === ADMITTED_CLIENT_ARCHIVE) {
      process.stderr.write("frozen_archive: 0.1.1, 0.1.2, and 0.1.3 stay immutable\n");
      process.stdout.write(`${JSON.stringify({ ok: false, code: "frozen_archive", message: "0.1.1, 0.1.2, and 0.1.3 stay immutable" }, null, 2)}\n`);
      return EXIT.conflict;
    }
    mkdirSync(dirname(out), { recursive: true });
    const run = spawnSync("tar", [
      "--sort=name",
      "--mode=u=rwX,go=rX",
      `--mtime=${PACK_STAMP}`,
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-czf",
      out,
      ...PACK_FILES,
    ], { cwd: TRIAL_DIR, env: { ...process.env, GZIP: "-n" } });
    if (run.status !== 0) {
      process.stderr.write(run.stderr || "tar failed\n");
      return run.status || 1;
    }
    const archiveBytes = readFileSync(out);
    const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
    const members = PACK_FILES.map((rel) => {
      const bytes = readFileSync(join(TRIAL_DIR, rel));
      return {
        path: rel,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    });
    const inventory = {
      archive: basename(out),
      version: CLIENT_VERSION,
      bytes: statSync(out).size,
      sha256: archiveSha256,
      tarMtime: PACK_STAMP,
      rootReceivingIncluded: false,
      privateKernelIncluded: false,
      members,
    };
    const versionDir = basename(dirname(out)) === CLIENT_VERSION;
    const inventoryPath = versionDir ? join(dirname(out), "INVENTORY.json") : `${out}.inventory.json`;
    writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
    if (versionDir) {
      writeFileSync(join(dirname(out), "SHA256SUMS"), `${archiveSha256}  ${basename(out)}\n`);
      writeFileSync(join(dirname(out), "current.json"), `${JSON.stringify({
        schema: "neomorphic.contributor-reuse-trial.client-descriptor.v1",
        currentVersion: CLIENT_VERSION,
        archive: CLIENT_ARCHIVE,
        sha256: archiveSha256,
        bytes: inventory.bytes,
        tarMtime: PACK_STAMP,
        preparedSnapshotVersion: PREPARED_CLIENT_VERSION,
        preparedSnapshotArchive: PREPARED_CLIENT_ARCHIVE,
        preparedSnapshotSha256: PREPARED_CLIENT_SHA256,
        preparedSnapshotIsAdmission: false,
        frozenCurrentVersion: FROZEN_CURRENT_CLIENT_VERSION,
        frozenCurrentArchive: FROZEN_CURRENT_CLIENT_ARCHIVE,
        frozenCurrentSha256: FROZEN_CURRENT_CLIENT_SHA256,
        frozenCurrentIsAdmission: false,
        historicalSnapshotIsAdmission: false,
        hostedSubmit: "unavailable",
        rootReceivingInArchive: false,
        walletRequired: false,
        accountRequired: false,
      }, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify({
      archive: out,
      bytes: inventory.bytes,
      sha256: archiveSha256,
      files: PACK_FILES.length,
      inventory: inventoryPath,
      transmitted: false,
    }, null, 2)}\n`);
    return EXIT.ok;
  }
  if (command === "remote") {
    try {
      const { probeRemote } = await import("./remote.mjs");
      const report = await probeRemote();
      if (flags.out) writeFileSync(flags.out, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return EXIT.ok;
    } catch (error) {
      if (missingModule(error)) return rootAbsent();
      throw error;
    }
  }
  const root = await loadRoot();
  if (!root) return rootAbsent();
  const result = await root.handle({ command, flags, now, terms, repoRoot: REPO_ROOT, readJson, loadLedger });
  if (result.direct) return result.exit;
  if (command === "reply" && result.ok && flags.out) writeJson(join(flags.out, "result-reply.json"), result.result);
  persist(flags.ledger, result);
  return emit(result);
}
