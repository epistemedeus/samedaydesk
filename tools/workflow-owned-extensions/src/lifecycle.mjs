import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONSUMER, PACKAGE_VERSION, resolveConsumer } from "./pins.mjs";
import { extensionRecord } from "./status.mjs";

export function registerExtension({ store, consumer = DEFAULT_CONSUMER, version = PACKAGE_VERSION, clock } = {}) {
  const resolved = resolveConsumer(consumer);
  if (!resolved.ok) return resolved;
  if (!store) return { ok: false, message: "register requires a local store directory" };
  const existing = readCurrent(store, resolved.consumer.key);
  if (existing?.record && existing.record.removed !== true) {
    if (existing.record.version === version) {
      return { ok: true, action: "unchanged", record: existing.record };
    }
    return { ok: false, message: "an active extension already exists; use update" };
  }
  const built = extensionRecord({ consumer: resolved.consumer.key, version, clock, previousVersions: historyVersions(existing) });
  if (!built.ok) return built;
  writeCurrent(store, resolved.consumer.key, built.record);
  return { ok: true, action: "registered", record: built.record };
}

export function updateExtension({ store, consumer = DEFAULT_CONSUMER, version, clock } = {}) {
  const resolved = resolveConsumer(consumer);
  if (!resolved.ok) return resolved;
  if (!store) return { ok: false, message: "update requires a local store directory" };
  if (typeof version !== "string" || version.trim() === "") {
    return { ok: false, message: "update requires an explicit version" };
  }
  const existing = readCurrent(store, resolved.consumer.key);
  if (!existing?.record || existing.record.removed) {
    return { ok: false, message: "update requires an active registered extension" };
  }
  if (existing.record.version === version) {
    return { ok: false, message: "update requires a different version" };
  }
  const previousVersions = [
    ...historyVersions(existing),
    { version: existing.record.version, updatedAt: existing.record.updatedAt, supersededAt: clock },
  ];
  writeHistory(store, resolved.consumer.key, existing.record);
  const built = extensionRecord({
    consumer: resolved.consumer.key,
    version,
    clock,
    previousVersions,
  });
  if (!built.ok) return built;
  built.record.createdAt = existing.record.createdAt;
  writeCurrent(store, resolved.consumer.key, built.record);
  return { ok: true, action: "updated", record: built.record };
}

export function removeExtension({ store, consumer = DEFAULT_CONSUMER, clock } = {}) {
  const resolved = resolveConsumer(consumer);
  if (!resolved.ok) return resolved;
  if (!store) return { ok: false, message: "remove requires a local store directory" };
  const existing = readCurrent(store, resolved.consumer.key);
  if (!existing?.record) {
    return { ok: false, message: "remove requires a registered extension" };
  }
  if (existing.record.removed) {
    return { ok: true, action: "already_removed", record: existing.record };
  }
  const record = {
    ...existing.record,
    removed: true,
    removedAt: clock,
    updatedAt: clock,
  };
  writeCurrent(store, resolved.consumer.key, record);
  return { ok: true, action: "removed", record };
}

export function readExtension({ store, consumer = DEFAULT_CONSUMER } = {}) {
  const resolved = resolveConsumer(consumer);
  if (!resolved.ok) return resolved;
  if (!store) return { ok: false, message: "status requires a local store directory" };
  const existing = readCurrent(store, resolved.consumer.key);
  if (!existing?.record) {
    return { ok: false, message: "no extension is registered in that store" };
  }
  return { ok: true, action: "status", record: existing.record };
}

function paths(store, consumerKey) {
  const root = join(store, consumerKey);
  return {
    root,
    current: join(root, "current.json"),
    history: join(root, "history"),
  };
}

function readCurrent(store, consumerKey) {
  try {
    return JSON.parse(readFileSync(paths(store, consumerKey).current, "utf8"));
  } catch {
    return null;
  }
}

function writeCurrent(store, consumerKey, record) {
  const target = paths(store, consumerKey);
  mkdirSync(target.root, { recursive: true });
  writeFileSync(target.current, `${JSON.stringify({ record }, null, 2)}\n`);
}

function writeHistory(store, consumerKey, record) {
  const target = paths(store, consumerKey);
  mkdirSync(target.history, { recursive: true });
  const name = `${record.version.replaceAll("/", "_")}.json`;
  writeFileSync(join(target.history, name), `${JSON.stringify({ record }, null, 2)}\n`);
}

function historyVersions(existing) {
  if (!existing?.record?.previousVersions) return [];
  return [...existing.record.previousVersions];
}
