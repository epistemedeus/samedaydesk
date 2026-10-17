import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const OFFERED_CLIENTS = Object.freeze([1, 8, 32, 128]);
export const AXES = Object.freeze(["concurrency", "corpus", "backlog"]);
export const CORPUS_ROWS_PER_CLIENT = 8;
export const CORPUS_BODY_BYTES = 256;
export const BACKLOG_ITEMS_PER_CLIENT = 4;

export const CLUSTER = Object.freeze({
  maxConnections: 24,
  sharedBuffers: "32MB",
  workMem: "2MB",
  fsync: true,
  synchronousCommit: true,
  listenHost: "127.0.0.1",
});

export const WORKLOAD_PLAN = Object.freeze({
  offeredClients: [...OFFERED_CLIENTS],
  axes: [...AXES],
  corpusRowsPerClient: CORPUS_ROWS_PER_CLIENT,
  corpusBodyBytes: CORPUS_BODY_BYTES,
  backlogItemsPerClient: BACKLOG_ITEMS_PER_CLIENT,
  traffic: "synthetic",
  cluster: { ...CLUSTER },
});

export function loadPins() {
  const path = fileURLToPath(new URL("../PINS.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadBudgets() {
  const path = fileURLToPath(new URL("../budgets.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

export function corpusBody() {
  return "x".repeat(CORPUS_BODY_BYTES);
}

export function unitsFor(axis, offeredClients) {
  if (axis === "concurrency") return offeredClients;
  if (axis === "corpus") return offeredClients * CORPUS_ROWS_PER_CLIENT;
  if (axis === "backlog") return offeredClients * BACKLOG_ITEMS_PER_CLIENT;
  throw new Error(`unknown axis ${axis}`);
}
