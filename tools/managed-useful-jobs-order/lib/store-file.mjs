import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { OrderRefuse } from "./errors.mjs";
import { liveOtherHolder, pidAlive, sleepSync } from "./pid.mjs";
import { DEFAULT_MAX_ADMISSIONS } from "./acquisition-constants.mjs";
import { sameAdmissionIdentity } from "./acquisition-identity.mjs";

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

function acquisitionPath(dir, executionId) {
  return join(dir, "acquisition", `${executionId}.json`);
}

function parseAcquisition(raw, executionId) {
  if (raw == null || raw === "") {
    throw new OrderRefuse("corrupt-replay", "acquisition record is empty", {
      falsifier: "F-ORDER",
      httpStatus: 409,
      detail: { executionId },
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new OrderRefuse("corrupt-replay", "acquisition record is not JSON", {
      falsifier: "F-ORDER",
      httpStatus: 409,
      detail: { executionId, error: String(err?.message || err) },
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OrderRefuse("corrupt-replay", "acquisition record must be a JSON object", {
      falsifier: "F-ORDER",
      httpStatus: 409,
      detail: { executionId },
    });
  }
  return parsed;
}

function countAdmissionsSync(dir) {
  const acq = join(dir, "acquisition");
  if (!existsSync(acq)) return 0;
  return readdirSync(acq).filter((name) => name.endsWith(".json") && !name.includes(".tmp")).length;
}

function readAcquisitionSync(dir, executionId) {
  const path = acquisitionPath(dir, executionId);
  if (!existsSync(path)) return null;
  return parseAcquisition(readFileSync(path, "utf8"), executionId);
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

async function withLockAsync(dir, orderId, fn) {
  const lockDir = lockDirFor(dir, orderId);
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, "pid"), `${process.pid}\n`);
      try {
        return await fn();
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

export function createFileStore(dir, options = {}) {
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "acquisition"), { recursive: true });
  mkdirSync(join(dir, "artifacts"), { recursive: true, mode: 0o700 });
  const executionsPath = join(dir, "executions.jsonl");
  const maxAdmissions =
    Number.isSafeInteger(options.maxAdmissions) && options.maxAdmissions > 0
      ? options.maxAdmissions
      : DEFAULT_MAX_ADMISSIONS;

  return {
    kind: "file",
    dir,
    artifactRoot: join(dir, "artifacts"),
    maxAdmissions,
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
        if (liveOtherHolder(existing, record)) {
          return { kind: "held", record: existing };
        }
        const adopted = {
          ...existing,
          ...record,
          status: "reserved",
          holderPid: process.pid,
          holderToken: record.holderToken,
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
          if (entry.executionId) existing.inFlightExecutionId = entry.executionId;
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
    async getAcquisition(executionId) {
      return readAcquisitionSync(dir, executionId);
    },
    async countAdmissions() {
      return countAdmissionsSync(dir);
    },
    async withAcquisitionLock(executionId, fn) {
      return withLockAsync(dir, `acq-${executionId}`, fn);
    },
    async saveAcquisitionUnlocked(record) {
      mkdirSync(join(dir, "acquisition"), { recursive: true });
      writeAtomic(acquisitionPath(dir, record.executionId), record);
      return record;
    },
    async admitAcquisition(record, { maxAdmissions: cap } = {}) {
      const limit = Number.isSafeInteger(cap) && cap > 0 ? cap : maxAdmissions;
      return withLock(dir, "_acq-capacity", () => {
        const existing = readAcquisitionSync(dir, record.executionId);
        if (existing) {
          if (sameAdmissionIdentity(existing, record)) return { kind: "identical", record: existing };
          return { kind: "conflict", record: existing };
        }
        if (countAdmissionsSync(dir) >= limit) {
          return { kind: "capacity" };
        }
        mkdirSync(join(dir, "acquisition"), { recursive: true });
        const stored = { ...record, state: record.state || "pending" };
        const fd = openSync(acquisitionPath(dir, record.executionId), "wx");
        try {
          writeFileSync(fd, `${JSON.stringify(stored, null, 2)}\n`);
        } finally {
          closeSync(fd);
        }
        return { kind: "created", record: stored };
      });
    },
  };
}

export { unlinkSync };
