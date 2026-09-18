import { SCHEMA } from "./cohort.mjs";
import {
  ENGINE_AUTHORITY,
  ENGINE_FALLBACK,
  ENGINE_SQL,
  ENGINE_STORE,
  ENGINE_WAL,
  seededFixture,
} from "./paths.mjs";
import {
  PINNED_NONCE_A,
  applyFlush,
  createStore,
  makeDelta,
  naiveConflictAsOk,
  naiveReplayAsFresh,
} from "./engine.mjs";

const ENGINES = {
  store: ENGINE_STORE,
  authority: ENGINE_AUTHORITY,
  wal: ENGINE_WAL,
  fallback: ENGINE_FALLBACK,
  sql: ENGINE_SQL,
};

function report({ id, rejected, code, message, extra = {} }) {
  return {
    schema: SCHEMA,
    ok: rejected === true,
    mode: "seeded-failure",
    id,
    rejected,
    code,
    message,
    engine: ENGINES,
    paymentSent: false,
    checkout: false,
    publish: false,
    ...extra,
  };
}

async function replayAsFreshApply() {
  const probe = seededFixture("replay-as-fresh-apply.json");
  const { store } = createStore();
  const delta = makeDelta(probe.delta);
  const first = await applyFlush(store, probe.flushId, delta);
  const second = await applyFlush(store, probe.flushId, delta);
  const snapshot = await store.readSnapshot(probe.observedFrom);
  const acks = [first.status, second.status];
  const naive = naiveReplayAsFresh(acks, snapshot.total, probe.delta.total);
  const rejected =
    first.status === "applied"
    && second.status === "already_applied"
    && snapshot.total === probe.delta.total
    && naive.acks[1] === "applied"
    && naive.snapshotTotal === probe.delta.total * 2
    && probe.claim.secondStatus === "applied"
    && probe.claim.snapshotTotal === probe.delta.total * 2;
  return report({
    id: "replay-as-fresh-apply",
    rejected,
    code: rejected ? "identical_replay_not_fresh_apply" : "identical_replay_double_counted",
    message: rejected
      ? "Published pulse nonce replay of the same flush id is already_applied and does not double-count; naive fresh-apply claim is refused"
      : "identical nonce replay was accepted as a second apply",
    extra: {
      flushId: probe.flushId,
      acks,
      snapshotTotal: snapshot.total,
      naiveAcks: naive.acks,
      naiveSnapshotTotal: naive.snapshotTotal,
      claim: probe.claim,
    },
  });
}

async function conflictAsOk() {
  const probe = seededFixture("conflict-as-ok.json");
  const { store } = createStore();
  const firstDelta = makeDelta(probe.firstDelta);
  const secondDelta = makeDelta(probe.secondDelta);
  const first = await applyFlush(store, probe.flushId, firstDelta);
  const second = await applyFlush(store, probe.flushId, secondDelta);
  const snapshot = await store.readSnapshot(probe.observedFrom);
  const naive = naiveConflictAsOk(probe.firstDelta.total, probe.secondDelta.total);
  const rejected =
    first.status === "applied"
    && second.ok === false
    && second.error === "pulse_flush_id_conflict"
    && snapshot.total === probe.firstDelta.total
    && naive.snapshotTotal === probe.firstDelta.total + probe.secondDelta.total
    && probe.claim.secondStatus === "applied"
    && probe.claim.error === null;
  return report({
    id: "conflict-as-ok",
    rejected,
    code: rejected ? "conflicting_nonce_not_ok" : "conflicting_nonce_accepted",
    message: rejected
      ? "Same flush-id nonce with a different delta is pulse_flush_id_conflict; naive ok-claim is refused"
      : "conflicting nonce replay was accepted as ok",
    extra: {
      flushId: probe.flushId,
      firstStatus: first.status,
      secondError: second.error,
      snapshotTotal: snapshot.total,
      naiveSnapshotTotal: naive.snapshotTotal,
      claim: probe.claim,
    },
  });
}

async function consumedNonceReissued() {
  const probe = seededFixture("consumed-nonce-reissued.json");
  const { store } = createStore();
  const first = await applyFlush(store, probe.flushId, makeDelta(probe.firstDelta));
  const second = await applyFlush(store, probe.flushId, makeDelta(probe.reissueDelta));
  const snapshot = await store.readSnapshot(probe.observedFrom);
  const rejected =
    first.status === "applied"
    && second.error === "pulse_flush_id_conflict"
    && snapshot.total === probe.firstDelta.total
    && probe.claim.reissued === true
    && probe.claim.secondStatus === "applied";
  return report({
    id: "consumed-nonce-reissued",
    rejected,
    code: rejected ? "consumed_nonce_not_reissued" : "consumed_nonce_reused",
    message: rejected
      ? "A consumed flush-id nonce cannot be reissued with a new delta; naive reissue claim is refused"
      : "consumed nonce was treated as reissued",
    extra: {
      flushId: probe.flushId,
      firstStatus: first.status,
      secondError: second.error,
      snapshotTotal: snapshot.total,
      claim: probe.claim,
    },
  });
}

function paymentToMintNonce() {
  const probe = seededFixture("payment-to-mint-nonce.json");
  const refused =
    probe.action === "checkout"
    || probe.action === "pay"
    || probe.payment === true
    || probe.checkout === true;
  return report({
    id: "payment-to-mint-nonce",
    rejected: refused === true,
    code: refused ? "payment_forbidden" : "payment_not_refused",
    message: refused
      ? "Replay-nonce pack refuses payment/checkout as a way to mint or reset a flush-id nonce"
      : "payment path was not refused",
    extra: {
      action: probe.action || null,
      flushId: probe.flushId || PINNED_NONCE_A,
    },
  });
}

const HANDLERS = {
  "replay-as-fresh-apply": replayAsFreshApply,
  "conflict-as-ok": conflictAsOk,
  "consumed-nonce-reissued": consumedNonceReissued,
  "payment-to-mint-nonce": paymentToMintNonce,
};

export function listSeededFailures() {
  return Object.keys(HANDLERS);
}

export async function runSeededFailure(id) {
  const handler = HANDLERS[id];
  if (!handler) {
    return report({
      id,
      rejected: false,
      code: "unknown_seeded_failure",
      message: `unknown seeded failure ${id}`,
    });
  }
  return handler();
}
