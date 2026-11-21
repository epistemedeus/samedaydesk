// Share revisions live on the CRT ledger that already owns the obligation.
// This module does not accept work, mint a reward, or open a second ledger.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { canonicalize } from "../deps/canonical/canonical.mjs";
import { proofStatement, verifyBoundStatement, verifySubmissionProof } from "./control.mjs";
import { evidenceDigest } from "./evidence-export.mjs";
import { sha256Text } from "./ids.mjs";
import { assertAllocation, canonical, inspectSubmission, readStatus } from "./ledger.mjs";
import { containsPrivate } from "./privacy.mjs";
import { reviewSuppliedEvidence } from "./review.mjs";

export const PURPOSE = "share_safe_derivative_v1";
export const SCHEMA = "neomorphic.contributor-reuse-trial.derivative-share.v1";
export const PUBLIC_HANDLE = /^dh[0-9a-f]{24}$/;
export const COVERAGE_ALLOWLIST = Object.freeze([
  "measured_output",
  "extract_directory",
  "utility_is_not_release",
  "not_string:title",
]);
const BASE_COVERAGE = ["measured_output", "extract_directory", "utility_is_not_release"];
const OUTPUT_CODES = new Set(["utility_ok_not_release", "integrated_partial"]);
const OP_KEYS = ["op", "idempotencyKey", "publicId", "contextId", "coverage", "expiresAt", "note", "shareProof"];
const KEY = /^sha256:[0-9a-f]{64}$/;
const CONTEXT = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SENTINEL = /SENTINEL|PRIVATE-SENTINEL|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|\bsk-[A-Za-z0-9]{20,}\b/i;
const PRIVATE_KEY = /^(grantpreimage|privatekey|controlprivatekey|apikey|api_key|authorization|bearer|password|secret|mnemonic|wallet|payoutdestination|customerbody|customer_body)$/i;

const refuse = (code, message) => ({ ok: false, code, message });

export function mintPublicId() {
  return `dh${randomBytes(12).toString("hex")}`;
}

export function accounting(ledger) {
  const obligations = Object.values(ledger?.obligations ?? {});
  return {
    acceptedCount: ledger?.allocation?.acceptedCount ?? null,
    spentAtomic: ledger?.allocation?.spentAtomic ?? null,
    committedAtomic: ledger?.allocation?.committedAtomic ?? null,
    paid: obligations.map((row) => row.paid === true),
    obligationIds: obligations.map((row) => row.obligationId).sort(),
    rewardCount: Object.values(ledger?.submissions ?? {}).reduce((sum, row) => sum + (row.rewardCount || 0), 0),
  };
}

function ownedState(ledger) {
  return JSON.stringify({
    claims: ledger.claims,
    submissions: ledger.submissions,
    obligations: ledger.obligations,
    allocation: ledger.allocation,
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function withLedgerLock(ledgerPath, fn) {
  const lockPath = `${ledgerPath}.lock`;
  const deadline = Date.now() + 8000;
  for (;;) {
    try {
      mkdirSync(lockPath);
      writeFileSync(`${lockPath}/pid`, String(process.pid));
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") return refuse("lock_unavailable", "receiver lock failed");
      let pid = 0;
      try {
        pid = Number(readFileSync(`${lockPath}/pid`, "utf8"));
      } catch {
        pid = 0;
      }
      if (pid && !alive(pid)) {
        rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) return refuse("lock_unavailable", "receiver lock timed out");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function loadLedger(path) {
  const text = readFileSync(path, "utf8");
  if (!text.trim() || !text.trim().endsWith("}") && !text.trim().endsWith("]")) {
    const error = new Error("truncated");
    error.code = "truncated";
    throw error;
  }
  return JSON.parse(text);
}

function saveLedger(path, ledger) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(tmp, path);
}

function instant(value) {
  return typeof value === "string"
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === (value.includes(".") ? value : value.replace("Z", ".000Z"));
}

function privateTree(value) {
  if (typeof value === "string") return SENTINEL.test(value);
  if (Array.isArray(value)) return value.some((item) => privateTree(item));
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_KEY.test(key) && item != null) return true;
      if (privateTree(item)) return true;
    }
  }
  return false;
}

function forbiddenRequest(value) {
  if (!value || typeof value !== "object") return false;
  return ["ledgerPath", "ledger", "authority", "authorityUrl", "verifier", "readAndVerify", "url"].some((key) => Object.hasOwn(value, key));
}

export function supportedCoverage(review, outcome) {
  const codes = [...BASE_COVERAGE];
  if (outcome === "useful_negative" && Array.isArray(review?.changed?.failures) && review.changed.failures.includes("not_string:title")) {
    codes.push("not_string:title");
  }
  return codes;
}

function coverageOk(requested, supported, { initial }) {
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > COVERAGE_ALLOWLIST.length) return false;
  if (new Set(requested).size !== requested.length) return false;
  if (!requested.every((code) => COVERAGE_ALLOWLIST.includes(code) && supported.includes(code))) return false;
  if (initial && !BASE_COVERAGE.every((code) => requested.includes(code))) return false;
  return true;
}

function subset(next, previous) {
  return next.every((code) => previous.includes(code));
}

export function bodyHash(submission) {
  const copy = structuredClone(submission);
  delete copy.grantPreimage;
  copy.tokenReceipts = { kind: "unknown" };
  return sha256Text(canonical(copy));
}

function lexHash(value) {
  return sha256Text(canonicalize(value));
}

function reservationOf(ledger, reservationId) {
  return Object.values(ledger?.claims ?? {}).find((row) => row.reservationId === reservationId) ?? null;
}

function knowledgeFrom(review, outcome, termsVersion, coverage, expiresAt) {
  return {
    subject: { id: "capability-preflight", version: review.archiveSha256, sha256: review.archiveSha256 },
    tool: { id: "capability-consumer-kit.journey", version: review.archiveSha256 },
    inputSha256: review.changed.inputSha256,
    termsVersion,
    expectedOutput: { kind: outcome, code: review.changed.status, sha256: review.changed.stableSha256 },
    coverage,
    expiresAt,
  };
}

function bindingFrom(reservation, received, obligation, contextId) {
  return {
    decisionId: obligation.obligationId,
    submissionId: received.submissionId,
    submissionBodySha256: received.bodySha256,
    evidenceSha256: received.suppliedEvidenceSha256,
    ownerId: reservation.contributorPublicId,
    contextId,
  };
}

function projectionBody({ id, revision, withdrawn, binding, knowledge }) {
  return { scope: "safe_derived_record", id, revision, withdrawn: withdrawn === true, binding, knowledge };
}

export function statementFor({ reservation, received, obligation, id, revision, withdrawn, coverage, expiresAt, review, contextId }) {
  const knowledge = knowledgeFrom(review, received.outcome, reservation.termsVersion, coverage, expiresAt);
  const binding = bindingFrom(reservation, received, obligation, contextId);
  return proofStatement({
    purpose: PURPOSE,
    offerId: reservation.offerId,
    termsVersion: reservation.termsVersion,
    reservationId: reservation.reservationId,
    claimIdempotencyKey: reservation.idempotencyKey,
    grantSha256: reservation.grantSha256,
    contributorPublicId: reservation.contributorPublicId,
    publicKey: reservation.control.publicKey,
    submissionIdempotencyKey: received.idempotencyKey,
    submissionBodySha256: lexHash(projectionBody({ id, revision, withdrawn, binding, knowledge })),
    evidenceSha256: received.suppliedEvidenceSha256,
  });
}

function operationBodySha(operation, reservationId) {
  return lexHash({
    op: operation.op,
    reservationId,
    publicId: operation.publicId,
    contextId: operation.contextId ?? "",
    coverage: operation.coverage ?? [],
    expiresAt: operation.expiresAt ?? "",
    note: operation.note ?? "",
    proof: operation.shareProof?.value ?? "",
  });
}

export function coherentShare(row, ledgerGeneration) {
  if (!row || row.schema !== SCHEMA || !PUBLIC_HANDLE.test(row.publicId)) return false;
  if (!Number.isSafeInteger(row.generation) || row.generation < 1) return false;
  if (!Number.isSafeInteger(row.globalGeneration) || row.globalGeneration < 1) return false;
  if (row.globalGeneration > ledgerGeneration) return false;
  if (!Array.isArray(row.log) || row.log.length !== row.generation) return false;
  return row.log.every((entry, index) => entry && entry.generation === index + 1 && entry.revision >= 1);
}

export function pageEntries(row, after = 0, limit = 20) {
  const start = row.log.filter((entry) => entry.generation > after);
  const entries = start.slice(0, limit).map((entry) => ({
    generation: entry.generation,
    op: entry.op,
    revision: entry.revision,
    withdrawn: entry.withdrawn === true,
    coverage: entry.coverage,
    expiresAt: entry.expiresAt,
  }));
  const last = entries.at(-1)?.generation ?? after;
  return { generation: row.generation, entries, next: last, headReached: last === row.generation };
}

export function assemblePages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return { ok: false, reason: "truncated" };
  const generation = pages[0].generation;
  if (!Number.isSafeInteger(generation) || generation < 1) return { ok: false, reason: "malformed" };
  let expect = 1;
  const entries = [];
  let reached = false;
  for (const page of pages) {
    if (!page || page.generation !== generation || !Array.isArray(page.entries)) return { ok: false, reason: "malformed" };
    if (page.entries.length === 0) {
      if (page.headReached !== true || expect !== generation + 1) return { ok: false, reason: "empty_page" };
      reached = true;
      continue;
    }
    for (const entry of page.entries) {
      if (entry?.generation !== expect) return { ok: false, reason: "gap" };
      entries.push(entry);
      expect += 1;
    }
    if (page.headReached === true) {
      if (expect !== generation + 1) return { ok: false, reason: "head_mismatch" };
      reached = true;
    }
  }
  if (!reached || expect !== generation + 1) return { ok: false, reason: "truncated" };
  return { ok: true, generation, entries, sawWithdraw: entries.some((entry) => entry.op === "withdraw" || entry.withdrawn === true) };
}

function publicView(row) {
  return {
    publicId: row.publicId,
    revision: row.revision,
    generation: row.generation,
    withdrawn: row.withdrawn === true,
  };
}

async function replay(row, received, repoRoot) {
  if (!row?.receivedEvidence) return refuse("unavailable", "current evidence is missing");
  let digest;
  try {
    digest = evidenceDigest(row.receivedEvidence);
  } catch {
    return refuse("unavailable", "stored evidence is truncated");
  }
  if (digest !== received.suppliedEvidenceSha256) return refuse("unavailable", "stored evidence does not match the receiver");
  const reviewed = reviewSuppliedEvidence(row.receivedEvidence, {
    outcome: received.outcome,
    changed: received.changed,
    original: received.original,
  }, repoRoot);
  if (!reviewed.ok || lexHash(reviewed.rootReview) !== lexHash(received.rootReview)) {
    return refuse("unavailable", "independent replay does not match the receiver");
  }
  if (!OUTPUT_CODES.has(reviewed.rootReview.changed.status)) return refuse("unavailable", "reviewed status is not a public code");
  return { ok: true, review: reviewed.rootReview };
}

function acceptedNow(ledger, reservationId, now, repoRoot) {
  const reservation = reservationOf(ledger, reservationId);
  const received = ledger.submissions?.[reservationId];
  const obligation = ledger.obligations?.[reservationId];
  if (!reservation || !received || !obligation) return refuse("not_accepted", "receiver has no accepted obligation");
  if (reservation.status === "revoked") return refuse("revoked", "native claim revocation");
  const control = verifySubmissionProof(reservation, { contributorPublicId: reservation.contributorPublicId, idempotencyKey: received.idempotencyKey });
  if (control.code === "proof_revoked") return refuse("revoked", "native claim revocation");
  let inspected;
  try {
    inspected = inspectSubmission(ledger, reservationId, now);
  } catch (error) {
    // Settlement may move spentAtomic. That adapter invariant is not the accept decision.
    if (error?.message !== "spent must stay 0 in this adapter") throw error;
    if (ledger.allocation?.escrowed !== false) return refuse("unavailable", "escrow");
    const probe = structuredClone(ledger);
    probe.allocation.spentAtomic = "0";
    assertAllocation(probe);
    inspected = {
      ok: true,
      result: { accepted: Boolean(obligation) },
    };
  }
  if (!inspected.ok || inspected.result?.accepted !== true) return refuse("not_accepted", "receiver decision is not accept");
  const view = readStatus(ledger, reservationId, null, now, repoRoot);
  if (!view.ok || view.result?.accepted_by_root !== true || view.result.rewardClaimable !== false || view.result.readback !== "none") {
    return refuse("not_accepted", "public status is not an accepted obligation");
  }
  if (view.result.paid !== false && view.result.paid !== true) {
    return refuse("not_accepted", "public status is not an accepted obligation");
  }
  if (obligation.accepted_by_root !== true) return refuse("not_accepted", "receiver decision is not accept");
  return { ok: true, reservation, received, obligation };
}

export async function readVerifiedShare({ ledger, publicId, now, repoRoot }) {
  if (!PUBLIC_HANDLE.test(publicId ?? "")) return { state: "unavailable" };
  const generation = ledger?.derivativeShareGeneration ?? 0;
  const row = ledger?.derivativeShares?.[publicId];
  if (!row) return { state: "unavailable" };
  if (!coherentShare(row, generation)) return { state: "unavailable" };
  const accepted = acceptedNow(ledger, row.reservationId, now, repoRoot);
  if (!accepted.ok) {
    if (accepted.code === "revoked") return { state: "revoked" };
    if (accepted.code === "not_accepted") return { state: "not_accepted" };
    return { state: "unavailable" };
  }
  const played = await replay(row, accepted.received, repoRoot);
  if (!played.ok) return { state: "unavailable" };
  const knowledge = knowledgeFrom(played.review, accepted.received.outcome, accepted.reservation.termsVersion, row.coverage, row.expiresAt);
  const binding = bindingFrom(accepted.reservation, accepted.received, accepted.obligation, row.contextId);
  const statement = statementFor({
    reservation: accepted.reservation,
    received: accepted.received,
    obligation: accepted.obligation,
    id: row.publicId,
    revision: row.revision,
    withdrawn: row.withdrawn === true,
    coverage: row.coverage,
    expiresAt: row.expiresAt,
    contextId: row.contextId,
    review: played.review,
  });
  if (row.withdrawn === true) {
    if (!verifyBoundStatement(statement, row.shareProof).ok) return { state: "unavailable" };
    return { state: "revoked" };
  }
  if (!verifyBoundStatement(statement, row.shareProof).ok) return { state: "sharing_denied" };
  const supported = supportedCoverage(played.review, accepted.received.outcome);
  if (!row.coverage.every((code) => supported.includes(code) && COVERAGE_ALLOWLIST.includes(code))) return { state: "unavailable" };
  return {
    state: "current",
    revision: row.revision,
    review: "independent_reproduction",
    sharing: "contributor_control_safe_derivative",
    binding,
    knowledge,
  };
}

function adoptEvidence(existing, submission, received) {
  if (existing?.receivedEvidence) {
    if (submission) {
      try {
        if (evidenceDigest(submission.evidenceExport) !== received.suppliedEvidenceSha256 || bodyHash(submission) !== received.bodySha256) {
          return refuse("evidence_mismatch", "presented submission does not match the receiver");
        }
      } catch {
        return refuse("evidence_mismatch", "presented submission does not match the receiver");
      }
    }
    return { ok: true, receivedEvidence: existing.receivedEvidence };
  }
  if (!submission?.evidenceExport) return refuse("not_accepted", "share requires the independently received submission");
  if (containsPrivate(submission) || privateTree(submission)) return refuse("private_input", "submission contains private input");
  if (bodyHash(submission) !== received.bodySha256) return refuse("evidence_mismatch", "normalized body does not match the receiver");
  let digest;
  try {
    digest = evidenceDigest(submission.evidenceExport);
  } catch {
    return refuse("evidence_mismatch", "evidence export is not canonical");
  }
  if (digest !== received.suppliedEvidenceSha256) return refuse("evidence_mismatch", "evidence does not match the receiver");
  return { ok: true, receivedEvidence: structuredClone(submission.evidenceExport) };
}

export async function mutateShare({ ledgerPath, repoRoot, now, reservationId, submission = null, operation }) {
  if (forbiddenRequest(operation) || forbiddenRequest(submission)) return refuse("malformed", "ledger paths and verifiers are not request fields");
  if (!operation || typeof operation !== "object" || Object.keys(operation).some((key) => !OP_KEYS.includes(key))) {
    return refuse("malformed", "share operation");
  }
  if (!["share", "narrow", "withdraw"].includes(operation.op) || !KEY.test(operation.idempotencyKey ?? "") || !PUBLIC_HANDLE.test(operation.publicId ?? "")) {
    return refuse("malformed", "share operation");
  }
  if (containsPrivate(operation) || privateTree(operation) || (submission && (containsPrivate(submission) || privateTree(submission)))) {
    return refuse("private_input", "share operation contains private input and was not stored");
  }
  if (!instant(now)) return refuse("malformed", "receiver clock");
  return withLedgerLock(ledgerPath, async () => {
    let ledger;
    try {
      ledger = loadLedger(ledgerPath);
    } catch {
      return refuse("unavailable", "receiver state is unreadable");
    }
    const beforeOwned = ownedState(ledger);
    const beforeAccounts = accounting(ledger);
    const bodySha = operationBodySha(operation, reservationId);
    const priorOp = ledger.derivativeShareOps?.[operation.idempotencyKey];
    if (priorOp) {
      if (priorOp.bodySha256 !== bodySha || priorOp.reservationId !== reservationId) return refuse("idempotency_conflict", "same operation key with a different body");
      return { ok: true, idempotentReplay: true, ...publicView(ledger.derivativeShares[priorOp.publicId]), ledgerGeneration: ledger.derivativeShareGeneration ?? 0 };
    }
    const accepted = acceptedNow(ledger, reservationId, now, repoRoot);
    if (!accepted.ok) return accepted;
    const { reservation, received, obligation } = accepted;
    const shares = ledger.derivativeShares ?? {};
    const existing = shares[operation.publicId] ?? null;
    if (existing && existing.reservationId !== reservationId) return refuse("wrong_owner", "public handle is bound to another record");
    const evidence = adoptEvidence(existing, submission, received);
    if (!evidence.ok) return evidence;
    const provisional = {
      ...(existing ?? {}),
      receivedEvidence: evidence.receivedEvidence,
    };
    const played = await replay(provisional, received, repoRoot);
    if (!played.ok) return refuse("evidence_mismatch", "independent review did not reproduce the submission");
    const supported = supportedCoverage(played.review, received.outcome);
    let revision = existing?.revision ?? 0;
    let withdrawn = false;
    let coverage = operation.coverage;
    let expiresAt = operation.expiresAt;
    let contextId = operation.contextId;
    if (operation.op === "share") {
      if (existing && existing.withdrawn !== true) return refuse("duplicate_share", "an open share is narrowed or withdrawn, not replaced");
      if (existing && contextId !== existing.contextId) return refuse("context_mismatch", "reauthorization cannot move the customer context");
      if (!CONTEXT.test(contextId ?? "") || SENTINEL.test(contextId)) return refuse("malformed", "context");
      if (!coverageOk(coverage, supported, { initial: !existing })) return refuse("unknown_coverage", "coverage is outside the reviewed allowlist");
      if (!instant(expiresAt) || Date.parse(expiresAt) <= Date.parse(now)) return refuse("malformed", "initial expiry");
      revision += 1;
      withdrawn = false;
    } else if (!existing) {
      return refuse("not_accepted", "no share exists to change");
    } else if (operation.op === "narrow") {
      if (existing.withdrawn === true) return refuse("share_withdrawn", "withdrawn sharing is not corrected in place");
      if (typeof operation.note !== "string" || operation.note.length < 1 || operation.note.length > 200) return refuse("malformed", "correction note");
      if (contextId !== existing.contextId) return refuse("context_mismatch", "a correction cannot move the customer context");
      if (!coverageOk(coverage, supported, { initial: false }) || !subset(coverage, existing.coverage)) return refuse("correction_widens", "coverage cannot widen");
      if (!instant(expiresAt) || Date.parse(expiresAt) >= Date.parse(existing.expiresAt)) return refuse("correction_widens", "expiry cannot move later");
      if (coverage.length === existing.coverage.length && expiresAt === existing.expiresAt) return refuse("correction_widens", "correction did not narrow");
      revision += 1;
      withdrawn = false;
    } else {
      if (existing.withdrawn === true) {
        return { ok: true, idempotentReplay: true, alreadyWithdrawn: true, ...publicView(existing), ledgerGeneration: ledger.derivativeShareGeneration ?? 0 };
      }
      coverage = existing.coverage;
      expiresAt = existing.expiresAt;
      contextId = existing.contextId;
      revision += 1;
      withdrawn = true;
    }
    const statement = statementFor({
      reservation,
      received,
      obligation,
      id: operation.publicId,
      revision,
      withdrawn,
      coverage,
      expiresAt,
      contextId,
      review: played.review,
    });
    const verdict = verifyBoundStatement(statement, operation.shareProof);
    if (!verdict.ok) {
      return refuse(operation.shareProof?.publicKey && operation.shareProof.publicKey !== reservation.control.publicKey ? "wrong_owner" : "sharing_denied", "share proof does not authorize this projection");
    }
    const nextGeneration = (existing?.generation ?? 0) + 1;
    const globalGeneration = (ledger.derivativeShareGeneration ?? 0) + 1;
    const row = {
      schema: SCHEMA,
      publicId: operation.publicId,
      reservationId,
      revision,
      generation: nextGeneration,
      globalGeneration,
      withdrawn,
      contextId,
      coverage,
      expiresAt,
      receivedEvidence: evidence.receivedEvidence,
      shareProof: operation.shareProof,
      log: [...(existing?.log ?? []), {
        generation: nextGeneration,
        op: operation.op,
        revision,
        at: now,
        coverage,
        expiresAt,
        withdrawn,
        bodySha256: bodySha,
      }],
    };
    const next = structuredClone(ledger);
    next.derivativeShares = { ...(next.derivativeShares ?? {}), [operation.publicId]: row };
    next.derivativeShareOps = {
      ...(next.derivativeShareOps ?? {}),
      [operation.idempotencyKey]: { bodySha256: bodySha, reservationId, publicId: operation.publicId, revision, generation: nextGeneration, withdrawn },
    };
    next.derivativeShareGeneration = globalGeneration;
    if (ownedState(next) !== beforeOwned || JSON.stringify(accounting(next)) !== JSON.stringify(beforeAccounts)) {
      return refuse("unavailable", "share mutation would have changed obligation state");
    }
    if (!coherentShare(row, globalGeneration)) return refuse("unavailable", "share generation is incoherent");
    saveLedger(ledgerPath, next);
    const reread = loadLedger(ledgerPath);
    if (reread.derivativeShareGeneration !== globalGeneration || reread.derivativeShares[operation.publicId].generation !== nextGeneration) {
      return refuse("unavailable", "share write did not become the current head");
    }
    return { ok: true, idempotentReplay: false, ...publicView(row), ledgerGeneration: globalGeneration };
  });
}
