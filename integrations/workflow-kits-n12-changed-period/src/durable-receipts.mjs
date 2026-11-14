// The existing receipt store backed by one local SQLite DB, not a money ledger.
// The committed row is the local output effect. There is no downstream dispatch.
import { DatabaseSync } from "node:sqlite";
import { closeSync, lstatSync, openSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { RECEIPT_KIND, ledgerKeyOf } from "./ledger.mjs";

const APPLICATION = 1396986691;
const V = 1;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const identity = value => typeof value === "string" && value.length > 0 &&
  value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);

export function openDurableApplyReceipts(file) {
  if (!isAbsolute(file ?? "")) throw new Error("absolute receipt database required");
  file = resolve(file);
  const dir = dirname(file);
  const folder = lstatSync(dir);
  if (!folder.isDirectory() || realpathSync(dir) !== dir || (folder.mode & 0o077))
    throw new Error("owner-only canonical receipt directory required");
  try { closeSync(openSync(file, "wx", 0o600)); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const st = lstatSync(file);
  if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077))
    throw new Error("owner-only regular receipt database required");
  const db = new DatabaseSync(file);
  const tx = fn => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* preserve the original error */ }
      throw error;
    }
  };
  try {
    db.exec("PRAGMA busy_timeout=4000; PRAGMA synchronous=FULL;");
    tx(() => {
      const app = db.prepare("PRAGMA application_id").get().application_id;
      const version = db.prepare("PRAGMA user_version").get().user_version;
      if (app === APPLICATION && version === V) return;
      if (app !== 0 || version !== 0 ||
          db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().n)
        throw new Error("foreign or unsupported receipt database");
      db.exec(`
        CREATE TABLE apply_receipt (
          ledger_key TEXT PRIMARY KEY,
          context_id TEXT NOT NULL,
          period_id TEXT NOT NULL,
          record_key TEXT NOT NULL,
          body TEXT NOT NULL,
          UNIQUE(context_id, period_id, record_key)
        ) STRICT;
        PRAGMA application_id=${APPLICATION};
        PRAGMA user_version=${V};
      `);
    });
    const byKey = db.prepare("SELECT body FROM apply_receipt WHERE ledger_key=?");
    const byIdentity = db.prepare("SELECT body FROM apply_receipt WHERE context_id=? AND period_id=? AND record_key=?");
    const select = db.prepare("SELECT body FROM apply_receipt ORDER BY period_id, record_key, context_id");
    const insert = db.prepare("INSERT INTO apply_receipt VALUES (?,?,?,?,?)");
    const decode = row => row ? Object.freeze(JSON.parse(row.body)) : null;
    return {
      durable: true,
      get(key) { return decode(byKey.get(key)); },
      forPeriodRecord(periodId, recordKey, contextId) {
        if (!identity(contextId)) throw new Error("receipt context is required");
        return decode(byIdentity.get(contextId, periodId, recordKey));
      },
      apply(draft) {
        const { ledgerKey, contextId, periodId, recordKey, idempotencyKey, termsVersion,
          taskId, followsTaskId, captureId, ingestionDigest, mappingVersion, platform, output, appliedAt } = draft;
        if (![contextId, periodId, recordKey, taskId, captureId, mappingVersion, platform, appliedAt].every(identity) ||
            !DIGEST.test(idempotencyKey) || !DIGEST.test(termsVersion) || ledgerKey !== ledgerKeyOf(idempotencyKey, recordKey))
          throw new Error("invalid apply receipt identity");
        return tx(() => {
          const same = decode(byKey.get(ledgerKey));
          if (same) {
            if (same.contextId !== contextId || same.periodId !== periodId || same.recordKey !== recordKey)
              throw new Error("apply receipt key belongs to a different record");
            return { applied: false, receipt: same };
          }
          const earlier = decode(byIdentity.get(contextId, periodId, recordKey));
          if (earlier) return { applied: false, conflict: true, receipt: earlier };
          const receipt = Object.freeze({ kind: RECEIPT_KIND, ledgerKey, idempotencyKey, recordKey, periodId, taskId,
            contextId, followsTaskId, termsVersion, captureId, ingestionDigest, mappingVersion, platform, output, appliedAt, applyCount: 1 });
          insert.run(ledgerKey, contextId, periodId, recordKey, JSON.stringify(receipt));
          return { applied: true, receipt };
        });
      },
      effects() { return db.prepare("SELECT count(*) AS n FROM apply_receipt").get().n; },
      snapshot() { return select.all().map(decode); },
      close() { db.close(); },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
