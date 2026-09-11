import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { OrderRefuse } from "./errors.mjs";
import { pidAlive, sleepSync } from "./pid.mjs";

function fileFor(dir, orderId) {
  return join(dir, `${orderId}.json`);
}

function lockDirFor(dir, orderId) {
  return join(dir, `${orderId}.lock`);
}

function parseRecord(raw, orderId) {
  if (raw == null || raw === "") {
    throw new OrderRefuse("corrupt-replay", "order store record is empty", {
      falsifier: "F-ORDER",
      httpStatus: 409,
      detail: { orderId },
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new OrderRefuse("corrupt-replay", "order store record is not JSON", {
      falsifier: "F-ORDER",
      httpStatus: 409,
      detail: { orderId, error: String(err?.message || err) },
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OrderRefuse("corrupt-replay", "order store record must be a JSON object", {
      falsifier: "F-ORDER",
      httpStatus: 409,
      detail: { orderId },
    });
  }
  const status = parsed.status || (parsed.result ? "complete" : "reserved");
  return { ...parsed, status };
}

function writeAtomic(dest, record) {
  const tmp = `${dest}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(tmp, dest);
}

function withLock(dir, orderId, fn) {
  const lockDir = lockDirFor(dir, orderId);
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, "pid"), `${process.pid}\n`);
      try {
        return fn();
      } finally {
        rmSync(lockDir, { recursive: true, force: true });
      }
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (Date.now() - started > 120_000) {
        throw new OrderRefuse("reservation-timeout", `timed out locking orderId ${orderId}`, {
          httpStatus: 504,
          detail: { orderId },
        });
      }
      try {
        const holder = Number(readFileSync(join(lockDir, "pid"), "utf8").trim());
        if (!pidAlive(holder)) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        /* lock exists without a readable pid; wait */
      }
      sleepSync(20);
    }
  }
}

export function createFileStore(dir) {
  mkdirSync(dir, { recursive: true });
  const executionsPath = join(dir, "executions.jsonl");

  return {
    kind: "file",
    dir,
    async get(orderId) {
      const path = fileFor(dir, orderId);
      if (!existsSync(path)) return null;
      const raw = readFileSync(path, "utf8");
      return parseRecord(raw, orderId);
    },
    async reserve(record) {
      return withLock(dir, record.orderId, () => {
        const path = fileFor(dir, record.orderId);
        if (!existsSync(path)) {
          const stored = {
            ...record,
            status: "reserved",
            holderPid: process.pid,
            result: null,
            executionCount: 0,
          };
          const fd = openSync(path, "wx");
          try {
            writeFileSync(fd, `${JSON.stringify(stored, null, 2)}\n`);
          } finally {
            closeSync(fd);
          }
          return { kind: "created", record: stored };
        }
        const existing = parseRecord(readFileSync(path, "utf8"), record.orderId);
        if (existing.termsHash !== record.termsHash) {
          return { kind: "conflict", record: existing };
        }
        if (existing.status === "complete" && existing.result) {
          return { kind: "replay", record: existing };
        }
        if (pidAlive(existing.holderPid) && existing.holderPid !== process.pid) {
          return { kind: "held", record: existing };
        }
        const adopted = {
          ...existing,
          ...record,
          status: "reserved",
          holderPid: process.pid,
          result: null,
        };
        writeAtomic(path, adopted);
        return { kind: "adopt", record: adopted };
      });
    },
    async recordExecution(entry) {
      withLock(dir, entry.orderId, () => {
        const path = fileFor(dir, entry.orderId);
        if (existsSync(path)) {
          const existing = parseRecord(readFileSync(path, "utf8"), entry.orderId);
          existing.executionCount = (existing.executionCount || 0) + 1;
          writeAtomic(path, existing);
        }
        appendFileSync(
          executionsPath,
          `${JSON.stringify({ ...entry, holderPid: process.pid, at: new Date().toISOString() })}\n`,
        );
      });
    },
    async complete(orderId, result) {
      return withLock(dir, orderId, () => {
        const path = fileFor(dir, orderId);
        if (!existsSync(path)) {
          throw new OrderRefuse("missing-reservation", `cannot complete missing order ${orderId}`);
        }
        const existing = parseRecord(readFileSync(path, "utf8"), orderId);
        const stored = {
          ...existing,
          status: "complete",
          holderPid: process.pid,
          result,
        };
        writeAtomic(path, stored);
        return stored;
      });
    },
    async listExecutions(orderId = null) {
      if (!existsSync(executionsPath)) return [];
      return readFileSync(executionsPath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((row) => !orderId || row.orderId === orderId);
    },
    async put(record) {
      const outcome = await this.reserve(record);
      if (outcome.kind === "conflict") {
        throw new OrderRefuse(
          "f-order",
          "orderId is immutable; swapped files require a new orderId",
          {
            falsifier: "F-ORDER",
            httpStatus: 409,
            detail: {
              orderId: record.orderId,
              storedTermsHash: outcome.record.termsHash,
              requestedTermsHash: record.termsHash,
            },
          },
        );
      }
      if (outcome.kind === "replay") {
        return { replayed: true, record: outcome.record };
      }
      if (record.result) {
        await this.complete(record.orderId, record.result);
      }
      return { replayed: false, record };
    },
    async close() {},
  };
}

export { unlinkSync };
