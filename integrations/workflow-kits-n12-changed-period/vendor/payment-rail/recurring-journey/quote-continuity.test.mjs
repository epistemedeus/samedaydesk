import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  CONTINUITY_CODES,
  CONTINUITY_RETRYABLE,
  buildLocalPreview,
  createMemoryRecoveryStore,
  createSyntheticRemote,
  dispatchWithRecovery,
  prepareDispatch,
  recoverDispatch,
  sendPersistedDispatch,
} from "./quote-continuity.mjs";
import { periodInterface } from "./journey.mjs";
import { exchangeRecords } from "./fixtures/load-synthetic-recurring.mjs";

const T0 = "2026-11-12T10:00:00.000Z";
const TERMS = exchangeRecords().periodN.termsVersion;
const OTHER_TERMS = exchangeRecords().periodNPlus1.termsVersion;
const TARGET = "https://seller.example/synthetic-recurring-record";

function request(body = {}) {
  return {
    method: "POST",
    effect: "read_only",
    mediaType: "application/json",
    body: { synthetic: true, periodId: "period-N", taskId: "task-n", ...body },
  };
}

function setup({ ttlMs } = {}) {
  let now = T0;
  const clock = () => now;
  const remote = createSyntheticRemote({ clock, ttlMs });
  const store = createMemoryRecoveryStore();
  const preview = buildLocalPreview({ request: request(), target: TARGET, termsVersion: TERMS });
  const quote = remote.quote({ requestDigest: preview.requestDigest, termsVersion: TERMS });
  const reservation = remote.reserve({ quote });
  return {
    remote,
    store,
    preview,
    quote,
    reservation,
    setNow(value) {
      now = value;
    },
    clock,
    input(overrides = {}) {
      return {
        store,
        remote,
        request: request(),
        target: TARGET,
        termsVersion: TERMS,
        quote,
        reservation,
        now: clock(),
        ...overrides,
      };
    },
  };
}

describe("positive: three distinct records and one committed effect", () => {
  test("preview, quote and reservation are distinct records bound in a chain", () => {
    const { preview, quote, reservation } = setup();
    assert.equal(preview.kind, "local_preview");
    assert.equal(preview.networkDispatch, false);
    assert.equal(preview.authorizes, false);
    assert.equal(preview.quoteId, undefined);
    assert.equal(preview.expiresAt, undefined);
    assert.equal(quote.kind, "remote_quote");
    assert.equal(quote.requestDigest, preview.requestDigest);
    assert.equal(quote.termsVersion, TERMS);
    assert.equal(quote.amountAtomic, "0");
    assert.equal(quote.unsigned, true);
    assert.equal(quote.synthetic, true);
    assert.ok(Date.parse(quote.expiresAt) > Date.parse(quote.issuedAt));
    assert.equal(reservation.kind, "reservation");
    assert.equal(reservation.quoteId, quote.quoteId);
    assert.equal(reservation.requestDigest, quote.requestDigest);
  });

  test("dispatch persists the recovery record before the remote is called and commits once", () => {
    const ctx = setup();
    let sawRecordAtDispatch = null;
    const original = ctx.remote.dispatch;
    const remote = {
      ...ctx.remote,
      dispatch(input) {
        sawRecordAtDispatch = ctx.store.get(input.idempotencyKey);
        return original(input);
      },
    };
    const out = dispatchWithRecovery(ctx.input({ remote }));
    assert.equal(out.ok, true);
    assert.equal(out.outcome, "committed");
    assert.equal(out.exception, null);
    assert.equal(out.exactlyOnce, false);
    assert.equal(out.idempotencyKey, ctx.preview.requestDigest);
    assert.equal(sawRecordAtDispatch.requestDigest, ctx.preview.requestDigest);
    assert.equal(sawRecordAtDispatch.quoteId, ctx.quote.quoteId);
    assert.equal(sawRecordAtDispatch.reservationId, ctx.reservation.reservationId);
    assert.deepEqual(sawRecordAtDispatch.intendedDispatch, { method: "POST", target: TARGET, effect: "read_only" });
    assert.equal(ctx.remote.effectCount, 1);
  });

  test("the persisted recovery record is minimal and nonsecret", () => {
    const ctx = setup();
    const prepared = prepareDispatch(ctx.input());
    assert.equal(prepared.ok, true);
    const persisted = ctx.store.get(prepared.idempotencyKey);
    assert.deepEqual(Object.keys(persisted).sort(), [
      "idempotencyKey",
      "intendedDispatch",
      "persistedAt",
      "quoteExpiresAt",
      "quoteId",
      "requestDigest",
      "reservationId",
      "schemaVersion",
      "termsVersion",
    ]);
    assert.equal(JSON.stringify(persisted).includes("taskId"), false);
    assert.equal(ctx.remote.dispatchCalls, 0);
  });
});

describe("failure: typed refusals before any dispatch", () => {
  test("a local preview presented as a quote is preview_used_as_quote", () => {
    const ctx = setup();
    const out = dispatchWithRecovery(ctx.input({ quote: ctx.preview }));
    assert.equal(out.ok, false);
    assert.equal(out.exception.code, "preview_used_as_quote");
    assert.equal(out.retry.retryable, false);
    assert.equal(ctx.remote.dispatchCalls, 0);
    assert.equal(ctx.store.size(), 0);
  });

  test("a Work Exchange preview record also never stands in for a quote", () => {
    const ctx = setup();
    const out = dispatchWithRecovery(ctx.input({ quote: exchangeRecords().periodN }));
    assert.equal(out.exception.code, "preview_used_as_quote");
    assert.equal(ctx.remote.dispatchCalls, 0);
  });

  test("a quote for a different request digest is quote_request_mismatch", () => {
    const ctx = setup();
    const out = dispatchWithRecovery(ctx.input({ request: request({ periodId: "period-N+1" }) }));
    assert.equal(out.exception.code, "quote_request_mismatch");
    assert.equal(out.retry.retryable, false);
    assert.equal(ctx.remote.dispatchCalls, 0);
  });

  test("a different termsVersion is quote_terms_mismatch", () => {
    const ctx = setup();
    const out = dispatchWithRecovery(ctx.input({ termsVersion: OTHER_TERMS }));
    assert.equal(out.exception.code, "quote_terms_mismatch");
    assert.equal(out.retry.retryable, false);
    assert.equal(ctx.remote.dispatchCalls, 0);
  });

  test("an expired quote is quote_expired, retryable with a fresh quote", () => {
    const ctx = setup({ ttlMs: 60_000 });
    ctx.setNow("2026-11-12T10:01:00.000Z");
    const out = dispatchWithRecovery(ctx.input());
    assert.equal(out.exception.code, "quote_expired");
    assert.equal(out.retry.retryable, true);
    assert.equal(ctx.remote.dispatchCalls, 0);
    const fresh = ctx.remote.quote({ requestDigest: ctx.preview.requestDigest, termsVersion: TERMS });
    const again = dispatchWithRecovery(ctx.input({ quote: fresh, reservation: ctx.remote.reserve({ quote: fresh }) }));
    assert.equal(again.ok, true);
    assert.equal(ctx.remote.effectCount, 1);
  });

  test("a missing or unbound reservation is reservation_without_quote", () => {
    const ctx = setup();
    const missing = dispatchWithRecovery(ctx.input({ reservation: null }));
    assert.equal(missing.exception.code, "reservation_without_quote");
    const otherQuote = ctx.remote.quote({ requestDigest: ctx.preview.requestDigest, termsVersion: TERMS });
    const otherReservation = ctx.remote.reserve({ quote: { ...otherQuote } });
    const unbound = dispatchWithRecovery(ctx.input({ reservation: otherReservation }));
    assert.equal(unbound.exception.code, "reservation_without_quote");
    assert.equal(ctx.remote.dispatchCalls, 0);
  });

  test("a signed or nonzero quote is refused; quotes stay synthetic", () => {
    const ctx = setup();
    const out = dispatchWithRecovery(ctx.input({ quote: { ...ctx.quote, amountAtomic: "1000" } }));
    assert.equal(out.exception.code, "quote_not_synthetic");
    const signed = dispatchWithRecovery(ctx.input({ quote: { ...ctx.quote, unsigned: false } }));
    assert.equal(signed.exception.code, "quote_not_synthetic");
    assert.equal(ctx.remote.dispatchCalls, 0);
  });

  test("a dispatch attempted without a persisted record is recovery_record_missing and never reaches the remote", () => {
    const ctx = setup();
    const out = sendPersistedDispatch({ store: ctx.store, remote: ctx.remote, idempotencyKey: ctx.preview.requestDigest, request: request() });
    assert.equal(out.exception.code, "recovery_record_missing");
    assert.equal(out.retry.retryable, false);
    assert.equal(ctx.remote.dispatchCalls, 0);
  });

  test("a store that silently drops the record is recovery_record_missing with no dispatch", () => {
    const ctx = setup();
    const droppingStore = { put() {}, get() { return null; } };
    const out = dispatchWithRecovery(ctx.input({ store: droppingStore }));
    assert.equal(out.exception.code, "recovery_record_missing");
    assert.equal(ctx.remote.dispatchCalls, 0);
  });
});

describe("recovery: lost replies and no exactly-once promise", () => {
  test("lost reply after the record is persisted: recovery in a fresh process returns the original with no second effect", () => {
    const ctx = setup();
    ctx.remote.failNext("lose_reply");
    const first = dispatchWithRecovery(ctx.input());
    assert.equal(first.ok, false);
    assert.equal(first.exception.code, "dispatch_outcome_unknown");
    assert.equal(first.retry.retryable, true);
    assert.equal(first.result, null);
    assert.equal(ctx.remote.effectCount, 1);

    // Fresh process: only the store and the remote survive.
    const recovered = recoverDispatch({ store: ctx.store, remote: ctx.remote, idempotencyKey: first.idempotencyKey, request: request() });
    assert.equal(recovered.ok, true);
    assert.equal(recovered.outcome, "recovered_original");
    assert.equal(recovered.retry.recovered, true);
    assert.equal(recovered.retry.secondEffect, false);
    assert.equal(recovered.retry.sameIdempotencyKey, first.idempotencyKey);
    assert.equal(recovered.result.sequence, 1);
    assert.equal(ctx.remote.effectCount, 1);

    const replayedAgain = recoverDispatch({ store: ctx.store, remote: ctx.remote, idempotencyKey: first.idempotencyKey });
    assert.deepEqual(replayedAgain.result, recovered.result);
    assert.equal(ctx.remote.effectCount, 1);
  });

  test("lost reply before the record is persisted: refused, nothing dispatched, recovery fabricates nothing", () => {
    const ctx = setup();
    const failingStore = { put() { throw new Error("synthetic: disk full"); }, get() { return null; } };
    const first = dispatchWithRecovery(ctx.input({ store: failingStore }));
    assert.equal(first.ok, false);
    assert.equal(first.exception.code, "recovery_store_unavailable");
    assert.equal(first.retry.retryable, true);
    assert.equal(first.dispatched, false);
    assert.equal(ctx.remote.dispatchCalls, 0);
    const recovered = recoverDispatch({ store: failingStore, remote: ctx.remote, idempotencyKey: first.idempotencyKey });
    assert.equal(recovered.ok, false);
    assert.equal(recovered.exception.code, "recovery_record_missing");
    assert.equal(recovered.result, null);
    assert.equal(ctx.remote.effectCount, 0);
  });

  test("request lost before the remote committed, quote now expired: typed uncommitted, no effect fabricated", () => {
    const ctx = setup({ ttlMs: 60_000 });
    ctx.remote.failNext("lose_request");
    const first = dispatchWithRecovery(ctx.input());
    assert.equal(first.exception.code, "dispatch_outcome_unknown");
    assert.equal(ctx.remote.effectCount, 0);
    ctx.setNow("2026-11-12T10:05:00.000Z");
    const recovered = recoverDispatch({ store: ctx.store, remote: ctx.remote, idempotencyKey: first.idempotencyKey });
    assert.equal(recovered.ok, false);
    assert.equal(recovered.committed, false);
    assert.equal(recovered.exception.code, "uncommitted");
    assert.equal(recovered.retry.retryable, true);
    assert.equal(recovered.result, null);
    assert.equal(ctx.remote.effectCount, 0);
  });

  test("request lost before commit, quote still valid: replay with the same key commits once", () => {
    const ctx = setup();
    ctx.remote.failNext("lose_request");
    const first = dispatchWithRecovery(ctx.input());
    assert.equal(first.exception.code, "dispatch_outcome_unknown");
    const recovered = recoverDispatch({ store: ctx.store, remote: ctx.remote, idempotencyKey: first.idempotencyKey });
    assert.equal(recovered.ok, true);
    assert.equal(recovered.outcome, "committed");
    assert.equal(recovered.retry.recovered, false);
    assert.equal(ctx.remote.effectCount, 1);
  });

  test("a second full dispatch with the same key returns the committed original, not a second effect", () => {
    const ctx = setup();
    const first = dispatchWithRecovery(ctx.input());
    const second = dispatchWithRecovery(ctx.input());
    assert.equal(second.ok, true);
    assert.equal(second.retry.secondEffect, false);
    assert.deepEqual(second.result, first.result);
    assert.equal(ctx.remote.effectCount, 1);
  });
});

describe("codes and retry sets", () => {
  test("new codes are documented, new retryables are separate, and the frozen period set is unchanged", () => {
    assert.deepEqual([...CONTINUITY_CODES], [
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
    assert.deepEqual([...CONTINUITY_RETRYABLE].sort(), ["dispatch_outcome_unknown", "quote_expired", "recovery_store_unavailable"]);
    const frozenRetryable = (code) => periodInterface({ ok: false, reason: code }).retry.retryable;
    for (const code of ["ingestion_missing", "capture_stale", "ingestion_incomplete"]) {
      assert.equal(frozenRetryable(code), true, code);
    }
    for (const code of CONTINUITY_CODES) {
      assert.equal(frozenRetryable(code), false, `${code} must not join the frozen period set`);
    }
    assert.equal(periodInterface({ ok: false, reason: "x", artifact: { committed: false } }).retry.retryable, true);
  });
});
