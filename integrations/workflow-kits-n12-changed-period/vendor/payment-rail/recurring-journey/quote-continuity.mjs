/**
 * Exact-request quote and delivery continuity.
 *
 * Follows CLI revision 3 (epistemedeus/pilot@e597252f, THREE-SITE-AGENT-CLI-PLAN.md
 * "Agent-native runtime contract" item 6 and INTEGRATED-DECISIONS.md Revision3):
 * a local preview validates and reports intended effects without network
 * dispatch; a separate remote quote declares its effect and actual expiry;
 * execution binds the exact request and terms; minimal nonsecret recovery
 * metadata is persisted before a dispatch that could be lost.
 *
 * Three distinct records: local preview, remote quote, reservation. A preview
 * never stands in for a quote. A quote binds to the exact request digest and
 * termsVersion. A reservation binds to a quote.
 *
 * There is no exactly-once promise. Recovery replays with the same idempotency
 * key and returns either the original committed result with no second effect
 * or a typed uncommitted state that fabricates nothing. Retention expiry,
 * ambiguous absence and host or storage loss remain honest limitations.
 *
 * Quotes here are synthetic: unsigned and zero-amount. No live payment,
 * signing or funded action. The recovery store and the remote are injected;
 * this module performs no real IO and keeps no authoritative ledger.
 */
import { createHash } from "node:crypto";

import { canonicalJson, normalizeRequestContract } from "../buyer/request-contract.mjs";
import { computeRequestDigest, normalizeTarget } from "../job-contract/job-contract.mjs";
import { isTermsVersionHash } from "./hash-terms-version.mjs";

export const LOCAL_PREVIEW_SCHEMA = "useful-commerce.local-preview.v1";
export const REMOTE_QUOTE_SCHEMA = "useful-commerce.remote-quote.v1";
export const RESERVATION_SCHEMA = "useful-commerce.reservation.v1";
export const RECOVERY_RECORD_SCHEMA = "useful-commerce.dispatch-recovery.v1";
export const CONTINUITY_RESULT_SCHEMA = "useful-commerce.quote-continuity-result.v1";

/**
 * Codes introduced by this module. Kept separate from the frozen period
 * RETRYABLE set in journey.mjs, which is unchanged.
 */
export const CONTINUITY_CODES = Object.freeze([
  "preview_used_as_quote",
  "quote_not_synthetic",
  "quote_request_mismatch",
  "quote_terms_mismatch",
  "quote_expired",
  "reservation_without_quote",
  "recovery_store_unavailable",
  "recovery_record_missing",
  "dispatch_outcome_unknown",
]);

/**
 * New retryable codes, separate from the frozen period set.
 * - quote_expired: request a fresh remote quote for the same request, then retry.
 * - recovery_store_unavailable: nothing was dispatched; retry once the store accepts the record.
 * - dispatch_outcome_unknown: the reply was lost after a persisted record; run recovery with the same key.
 * The existing frozen code "uncommitted" stays retryable as before and is reused, not redefined.
 */
export const CONTINUITY_RETRYABLE = Object.freeze(new Set([
  "quote_expired",
  "recovery_store_unavailable",
  "dispatch_outcome_unknown",
]));

const FROZEN_UNCOMMITTED = "uncommitted";

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function isoTime(value, label) {
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${label} must be a valid time`);
  return ms;
}

function shortDigest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);
}

function retryableFor(code) {
  return code === FROZEN_UNCOMMITTED || CONTINUITY_RETRYABLE.has(code);
}

function result({
  ok,
  outcome,
  code = null,
  message,
  idempotencyKey = null,
  committed = false,
  recovered = false,
  secondEffect = false,
  effectResult = null,
  records = {},
  dispatched = false,
}) {
  return {
    schemaVersion: CONTINUITY_RESULT_SCHEMA,
    ok,
    outcome,
    reason: code ?? outcome,
    message,
    idempotencyKey,
    committed,
    dispatched,
    result: committed ? effectResult : null,
    exception: code ? { code, message } : null,
    retry: {
      retryable: code ? retryableFor(code) : false,
      sameIdempotencyKey: idempotencyKey,
      recovered,
      secondEffect,
    },
    records,
    exactlyOnce: false,
  };
}

function refuse(code, message, extra = {}) {
  return result({ ok: false, outcome: "exception", code, message, ...extra });
}

/** Exact request binding shared by preview, quote, reservation and recovery. */
export function bindRequest({ request, target }) {
  const normalized = normalizeRequestContract(request);
  const normalizedTarget = normalizeTarget(target);
  return {
    request: normalized,
    target: normalizedTarget,
    requestDigest: computeRequestDigest({ request: normalized, target: normalizedTarget }),
  };
}

/**
 * Local preview: validates locally and reports intended effects. No network
 * dispatch, no quote id, no expiry, no authority.
 */
export function buildLocalPreview({ request, target, termsVersion, missingFacts = [] } = {}) {
  const bound = bindRequest({ request, target });
  return Object.freeze({
    schemaVersion: LOCAL_PREVIEW_SCHEMA,
    kind: "local_preview",
    requestDigest: bound.requestDigest,
    termsVersion: isTermsVersionHash(termsVersion) ? termsVersion : null,
    intendedEffects: Object.freeze([`${bound.request.method} ${bound.target} effect=${bound.request.effect ?? "read_only"}`]),
    missingFacts: Object.freeze([...missingFacts]),
    networkDispatch: false,
    authorizes: false,
  });
}

function looksLikePreview(value) {
  const candidate = record(value);
  if (!candidate) return false;
  if (candidate.kind === "local_preview" || candidate.schemaVersion === LOCAL_PREVIEW_SCHEMA) return true;
  const schema = String(candidate.schema ?? candidate.schemaVersion ?? "");
  return /(^|[.:-])preview([.:-]|$)/.test(schema);
}

/**
 * Client-side check that a quote is a remote quote bound to this exact
 * request and terms, synthetic, and not expired.
 */
export function checkQuote({ quote, requestDigest, termsVersion, now }) {
  if (looksLikePreview(quote)) {
    return { ok: false, code: "preview_used_as_quote", message: "a preview is not a quote; request a separate remote quote" };
  }
  const value = record(quote);
  if (!value || value.kind !== "remote_quote" || value.schemaVersion !== REMOTE_QUOTE_SCHEMA || !value.quoteId) {
    return { ok: false, code: "reservation_without_quote", message: "no remote quote was presented" };
  }
  if (value.synthetic !== true || value.unsigned !== true || value.amountAtomic !== "0") {
    return { ok: false, code: "quote_not_synthetic", message: "only synthetic unsigned zero-amount quotes are accepted here; no live payment or signing" };
  }
  if (value.requestDigest !== requestDigest) {
    return { ok: false, code: "quote_request_mismatch", message: "quote is bound to a different request digest" };
  }
  if (!isTermsVersionHash(termsVersion) || value.termsVersion !== termsVersion) {
    return { ok: false, code: "quote_terms_mismatch", message: "quote is bound to a different termsVersion" };
  }
  if (isoTime(now, "now") >= isoTime(value.expiresAt, "quote expiresAt")) {
    return { ok: false, code: "quote_expired", message: "quote has expired; request a fresh remote quote for the same request" };
  }
  return { ok: true, quote: value };
}

export function checkReservation({ reservation, quote }) {
  const value = record(reservation);
  if (
    !value
    || value.kind !== "reservation"
    || value.schemaVersion !== RESERVATION_SCHEMA
    || !value.reservationId
    || value.quoteId !== quote.quoteId
    || value.requestDigest !== quote.requestDigest
  ) {
    return { ok: false, code: "reservation_without_quote", message: "reservation is missing or not bound to the presented quote" };
  }
  return { ok: true, reservation: value };
}

/** In-memory recovery store. Callers inject a durable store with the same get/put shape. */
export function createMemoryRecoveryStore() {
  const records = new Map();
  return {
    put(key, value) {
      records.set(key, JSON.parse(JSON.stringify(value)));
    },
    get(key) {
      const value = records.get(key);
      return value ? JSON.parse(JSON.stringify(value)) : null;
    },
    size() {
      return records.size;
    },
  };
}

/**
 * Validate quote and reservation, then persist the minimal nonsecret recovery
 * record (request digest, quote id, intended dispatch) and read it back.
 * Nothing is dispatched here.
 */
export function prepareDispatch({ store, request, target, termsVersion, quote, reservation, now } = {}) {
  const bound = bindRequest({ request, target });
  const key = bound.requestDigest;
  const quoteCheck = checkQuote({ quote, requestDigest: key, termsVersion, now });
  if (!quoteCheck.ok) return refuse(quoteCheck.code, quoteCheck.message, { idempotencyKey: key });
  const reservationCheck = checkReservation({ reservation, quote: quoteCheck.quote });
  if (!reservationCheck.ok) return refuse(reservationCheck.code, reservationCheck.message, { idempotencyKey: key });

  const recoveryRecord = {
    schemaVersion: RECOVERY_RECORD_SCHEMA,
    idempotencyKey: key,
    requestDigest: key,
    termsVersion,
    quoteId: quoteCheck.quote.quoteId,
    quoteExpiresAt: quoteCheck.quote.expiresAt,
    reservationId: reservationCheck.reservation.reservationId,
    intendedDispatch: {
      method: bound.request.method,
      target: bound.target,
      effect: bound.request.effect ?? "read_only",
    },
    persistedAt: new Date(isoTime(now, "now")).toISOString(),
  };
  try {
    store.put(key, recoveryRecord);
  } catch (error) {
    return refuse("recovery_store_unavailable", `recovery record was not persisted, so nothing was dispatched: ${error.message}`, { idempotencyKey: key });
  }
  const readBack = store.get(key);
  if (!readBack || canonicalJson(readBack) !== canonicalJson(recoveryRecord)) {
    return refuse("recovery_record_missing", "recovery record did not read back, so nothing was dispatched", { idempotencyKey: key });
  }
  return {
    ok: true,
    idempotencyKey: key,
    request: bound.request,
    records: { quote: quoteCheck.quote, reservation: reservationCheck.reservation, recovery: readBack },
  };
}

/**
 * Dispatch only from a persisted recovery record. A dispatch attempted without
 * a persisted record is refused before the remote is called.
 */
export function sendPersistedDispatch({ store, remote, idempotencyKey, request } = {}) {
  const persisted = idempotencyKey ? store.get(idempotencyKey) : null;
  if (!persisted || persisted.schemaVersion !== RECOVERY_RECORD_SCHEMA) {
    return refuse("recovery_record_missing", "dispatch refused: no persisted recovery record for this idempotency key", { idempotencyKey: idempotencyKey ?? null });
  }
  let reply;
  try {
    reply = remote.dispatch({
      idempotencyKey: persisted.idempotencyKey,
      quoteId: persisted.quoteId,
      reservationId: persisted.reservationId,
      requestDigest: persisted.requestDigest,
      request,
    });
  } catch (error) {
    return refuse("dispatch_outcome_unknown", `reply was lost; the effect may or may not have committed. Recover with the same idempotency key: ${error.message}`, {
      idempotencyKey: persisted.idempotencyKey,
      dispatched: true,
      records: { recovery: persisted },
    });
  }
  return fromRemoteReply(reply, persisted, { recovered: false });
}

function fromRemoteReply(reply, persisted, { recovered }) {
  if (reply?.committed === true) {
    return result({
      ok: true,
      outcome: recovered && reply.replayed === true ? "recovered_original" : "committed",
      message: recovered && reply.replayed === true
        ? "replay with the same idempotency key returned the original committed result"
        : "dispatch committed once for this idempotency key",
      idempotencyKey: persisted.idempotencyKey,
      committed: true,
      dispatched: true,
      recovered: recovered && reply.replayed === true,
      secondEffect: reply.secondEffect === true,
      effectResult: reply.result,
      records: { recovery: persisted },
    });
  }
  return refuse(FROZEN_UNCOMMITTED, reply?.message ?? "no committed effect for this idempotency key; nothing is fabricated", {
    idempotencyKey: persisted.idempotencyKey,
    dispatched: true,
    records: { recovery: persisted },
  });
}

/** Full client path: prepare (validate and persist) then dispatch from the record. */
export function dispatchWithRecovery({ store, remote, request, target, termsVersion, quote, reservation, now } = {}) {
  const prepared = prepareDispatch({ store, request, target, termsVersion, quote, reservation, now });
  if (!prepared.ok) return prepared;
  const sent = sendPersistedDispatch({ store, remote, idempotencyKey: prepared.idempotencyKey, request: prepared.request });
  return { ...sent, records: { ...prepared.records, ...sent.records } };
}

/**
 * Recovery after a lost reply, possibly in a fresh process. Reads the
 * persisted record and replays with the same idempotency key.
 */
export function recoverDispatch({ store, remote, idempotencyKey, request } = {}) {
  const persisted = idempotencyKey ? store.get(idempotencyKey) : null;
  if (!persisted || persisted.schemaVersion !== RECOVERY_RECORD_SCHEMA) {
    return refuse("recovery_record_missing", "nothing to recover: no persisted recovery record, and no result is fabricated", { idempotencyKey: idempotencyKey ?? null });
  }
  let reply;
  try {
    reply = remote.replay({
      idempotencyKey: persisted.idempotencyKey,
      quoteId: persisted.quoteId,
      reservationId: persisted.reservationId,
      requestDigest: persisted.requestDigest,
      request,
    });
  } catch (error) {
    return refuse("dispatch_outcome_unknown", `recovery reply was lost too; retry recovery with the same key: ${error.message}`, {
      idempotencyKey: persisted.idempotencyKey,
      dispatched: true,
      records: { recovery: persisted },
    });
  }
  return fromRemoteReply(reply, persisted, { recovered: true });
}

/**
 * Synthetic remote standing in for a seller or exchange quote endpoint. Issues
 * unsigned zero-amount quotes and reservations, commits at most one effect per
 * idempotency key, and can lose a reply for tests. Not a live service.
 */
export function createSyntheticRemote({ clock, ttlMs = 15 * 60 * 1000 } = {}) {
  const quotes = new Map();
  const reservations = new Map();
  const commits = new Map();
  let effectCount = 0;
  let dispatchCalls = 0;
  let pendingFault = null;
  let quoteSequence = 0;
  const nowMs = () => isoTime(typeof clock === "function" ? clock() : clock, "remote clock");

  function quote({ requestDigest, termsVersion }) {
    const issuedAt = nowMs();
    quoteSequence += 1;
    const quoteId = `quote:synthetic:${shortDigest({ requestDigest, termsVersion, issuedAt, quoteSequence })}`;
    const value = Object.freeze({
      schemaVersion: REMOTE_QUOTE_SCHEMA,
      kind: "remote_quote",
      synthetic: true,
      unsigned: true,
      amountAtomic: "0",
      asset: "USDC",
      network: "eip155:8453",
      quoteId,
      requestDigest,
      termsVersion,
      declaredEffects: Object.freeze(["reservation"]),
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(issuedAt + ttlMs).toISOString(),
      note: "Synthetic unsigned zero-amount quote. Not a live payment, signature or authorization.",
    });
    quotes.set(quoteId, value);
    return value;
  }

  function reserve({ quote: presented }) {
    const known = quotes.get(presented?.quoteId);
    if (!known) throw new Error("reservation requires a quote this remote issued");
    const reservationId = `reservation:synthetic:${shortDigest({ quoteId: known.quoteId })}`;
    const value = Object.freeze({
      schemaVersion: RESERVATION_SCHEMA,
      kind: "reservation",
      synthetic: true,
      reservationId,
      quoteId: known.quoteId,
      requestDigest: known.requestDigest,
      expiresAt: known.expiresAt,
    });
    reservations.set(reservationId, value);
    return value;
  }

  function commit({ idempotencyKey, quoteId, reservationId, requestDigest }) {
    const existing = commits.get(idempotencyKey);
    if (existing) return { committed: true, replayed: true, secondEffect: false, result: existing.result };
    const knownQuote = quotes.get(quoteId);
    const knownReservation = reservations.get(reservationId);
    if (!knownQuote || !knownReservation || knownReservation.quoteId !== quoteId || knownQuote.requestDigest !== requestDigest) {
      return { committed: false, message: "remote refused: quote or reservation not bound to this request" };
    }
    if (nowMs() >= isoTime(knownQuote.expiresAt, "quote expiresAt")) {
      return { committed: false, message: "remote refused: quote expired before any effect committed" };
    }
    effectCount += 1;
    const committedResult = { synthetic: true, requestDigest, quoteId, reservationId, effect: "accepted_delivery", sequence: effectCount };
    commits.set(idempotencyKey, { result: committedResult });
    return { committed: true, replayed: false, secondEffect: false, result: committedResult };
  }

  return {
    quote,
    reserve,
    dispatch(input) {
      dispatchCalls += 1;
      const fault = pendingFault;
      pendingFault = null;
      if (fault === "lose_request") throw new Error("synthetic: request lost before reaching the remote");
      const reply = commit(input);
      if (fault === "lose_reply") throw new Error("synthetic: reply lost after the remote committed");
      return reply;
    },
    replay(input) {
      const existing = commits.get(input.idempotencyKey);
      if (existing) return { committed: true, replayed: true, secondEffect: false, result: existing.result };
      return commit(input);
    },
    failNext(kind) {
      pendingFault = kind;
    },
    get effectCount() {
      return effectCount;
    },
    get dispatchCalls() {
      return dispatchCalls;
    },
  };
}
