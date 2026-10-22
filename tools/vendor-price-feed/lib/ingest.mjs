import { observationDigest } from "./digest.mjs";
import { FeedRefuse } from "./refuse.mjs";
import {
  appendRecord,
  getRecord,
  listCurrent,
  listStale,
  loadStore,
  markStale,
  saveStore,
} from "./store.mjs";
import { validateObservation } from "./validate.mjs";

function seriesKey(observation) {
  return observation.sourceUrl;
}

export function ingestObservation(input, { storeDir, flags = {}, now = null } = {}) {
  const observation = validateObservation(input, flags);
  const id = observationDigest(observation);
  const store = loadStore(storeDir);
  const ingestedAt = now || new Date().toISOString();

  const existing = getRecord(store, id);
  if (existing) {
    const same = JSON.stringify(existing.observation) === JSON.stringify(observation);
    if (!same) {
      throw new FeedRefuse("history-overwrite", "digest collision with different observation bytes");
    }
    return {
      ok: true,
      refused: false,
      code: "idempotent",
      id,
      status: existing.status,
      observation,
      record: existing,
      purchaseAuthority: false,
      purchaseAuthorized: false,
      liveCatalogWritten: false,
      idempotent: true,
    };
  }

  const currentId = store.currentBySource[seriesKey(observation)];
  const current = currentId ? getRecord(store, currentId) : null;

  if (observation.priorObservationId) {
    const prior = getRecord(store, observation.priorObservationId);
    if (!prior) {
      throw new FeedRefuse(
        "invalid-prior-observation",
        "priorObservationId is not in the store",
      );
    }
    if (prior.observation.sourceUrl !== observation.sourceUrl) {
      throw new FeedRefuse(
        "history-overwrite",
        "priorObservationId does not belong to this sourceUrl",
      );
    }
    if (prior.observation.unit !== observation.unit) {
      throw new FeedRefuse(
        "invalid-unit",
        "unit does not match the prior observation; refusing a silent unit rewrite",
      );
    }
    if (prior.status !== "current") {
      throw new FeedRefuse(
        "history-overwrite",
        "prior observation is already stale; refusing a history fork",
      );
    }
    if (current && current.id !== prior.id) {
      throw new FeedRefuse(
        "history-overwrite",
        "priorObservationId is not the current observation for this source",
      );
    }
  } else if (current) {
    throw new FeedRefuse(
      "history-overwrite",
      "source already has a current observation; pass priorObservationId instead of overwriting",
    );
  }

  const record = {
    id,
    status: "current",
    ingestedAt,
    observation,
  };

  appendRecord(store, record);

  let priorStatus = null;
  if (observation.priorObservationId) {
    const stale = markStale(store, observation.priorObservationId);
    priorStatus = stale.status;
  }
  store.currentBySource[seriesKey(observation)] = id;
  saveStore(storeDir, store);

  return {
    ok: true,
    refused: false,
    id,
    status: "current",
    observation,
    record,
    priorObservationId: observation.priorObservationId,
    priorStatus,
    current: listCurrent(store).map(publicRecord),
    stale: listStale(store).map(publicRecord),
    purchaseAuthority: false,
    purchaseAuthorized: false,
    liveCatalogWritten: false,
    idempotent: false,
  };
}

export function publicRecord(row) {
  return {
    id: row.id,
    status: row.status,
    digest: row.id,
    ingestedAt: row.ingestedAt,
    observation: row.observation,
  };
}

export function listCurrentResult(storeDir) {
  const store = loadStore(storeDir);
  const current = listCurrent(store).map(publicRecord);
  const stale = listStale(store).map(publicRecord);
  return {
    ok: true,
    refused: false,
    current,
    stale,
    currentIds: current.map((row) => row.id),
    staleIds: stale.map((row) => row.id),
    purchaseAuthority: false,
    purchaseAuthorized: false,
    liveCatalogWritten: false,
  };
}

export function listAllResult(storeDir) {
  const listed = listCurrentResult(storeDir);
  const store = loadStore(storeDir);
  return {
    ...listed,
    observations: Object.values(store.observations).map(publicRecord),
  };
}
