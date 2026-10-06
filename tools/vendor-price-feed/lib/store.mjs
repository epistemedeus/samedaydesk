import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STORE_FILENAME } from "./pins.mjs";
import { FeedRefuse } from "./refuse.mjs";

export function storePath(storeDir) {
  return join(storeDir, STORE_FILENAME);
}

export function emptyStore() {
  return {
    schema: "samedaydesk.vendor-price-feed.v1",
    purchaseAuthority: false,
    liveCatalogWritten: false,
    observations: {},
    currentBySource: {},
  };
}

export function loadStore(storeDir) {
  const path = storePath(storeDir);
  if (!existsSync(path)) return emptyStore();
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw.observations)) {
    throw new FeedRefuse("corrupt-store", "observation store is not an append-only map");
  }
  raw.observations = raw.observations || {};
  raw.currentBySource = raw.currentBySource || {};
  raw.purchaseAuthority = false;
  raw.liveCatalogWritten = false;
  return raw;
}

export function saveStore(storeDir, store) {
  mkdirSync(storeDir, { recursive: true });
  const path = storePath(storeDir);
  const next = {
    schema: "samedaydesk.vendor-price-feed.v1",
    purchaseAuthority: false,
    liveCatalogWritten: false,
    observations: store.observations,
    currentBySource: store.currentBySource,
  };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  return path;
}

export function getRecord(store, id) {
  return store.observations[id] || null;
}

export function listRecords(store) {
  return Object.values(store.observations).sort((a, b) =>
    a.observation.observedAt.localeCompare(b.observation.observedAt),
  );
}

export function listCurrent(store) {
  return listRecords(store).filter((row) => row.status === "current");
}

export function listStale(store) {
  return listRecords(store).filter((row) => row.status === "stale");
}

/**
 * Append-only insert. Replacing an existing id with different bytes is overwrite.
 */
export function appendRecord(store, record) {
  const existing = store.observations[record.id];
  if (existing) {
    const same =
      JSON.stringify(existing.observation) === JSON.stringify(record.observation) &&
      existing.status === record.status;
    if (!same) {
      throw new FeedRefuse("history-overwrite", "refusing to overwrite an existing observation");
    }
    return { store, record: existing, idempotent: true };
  }
  store.observations[record.id] = record;
  return { store, record, idempotent: false };
}

export function markStale(store, id) {
  const row = store.observations[id];
  if (!row) {
    throw new FeedRefuse("invalid-prior-observation", `prior observation ${id} is not in the store`);
  }
  store.observations[id] = { ...row, status: "stale" };
  return store.observations[id];
}

export function replaceRecord() {
  throw new FeedRefuse("history-overwrite", "observation history is append-only; replace is refused");
}

export function writeLiveCatalogFile() {
  throw new FeedRefuse(
    "live-sds-price-mutation",
    "vendor-price-feed cannot write live SDS catalog price files",
  );
}
