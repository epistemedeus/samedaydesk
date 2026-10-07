import { randomBytes } from "node:crypto";
import { open, readFile, rename, unlink, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { markClaimed } from "./claim.mjs";
import { WatchError } from "./errors.mjs";

const SCHEMA = "sds.managed-watch.store.v1";

function empty() {
  return { schema: SCHEMA, grants: [], watches: {} };
}

function keyOf(projectId, taskId) {
  return `${projectId}\u0000${taskId}`;
}

async function readState(file) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!parsed || parsed.schema !== SCHEMA || !Array.isArray(parsed.grants) || !parsed.watches) {
      throw new WatchError("store_unavailable", "watch store schema mismatch", 503);
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return empty();
    if (error instanceof WatchError) throw error;
    throw new WatchError("store_unavailable", "watch store is unreadable", 503);
  }
}

async function atomicWrite(file, state) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const handle = await open(tmp, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(state)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file);
}

function lockAlive(info) {
  if (!info || !Number.isInteger(info.pid)) return false;
  if (info.pid === process.pid) return true;
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function withFileLock(lockPath, fn) {
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        return await fn();
      } finally {
        await unlink(lockPath).catch(() => {});
      }
    } catch (error) {
      if (error?.code !== "EEXIST") {
        if (error instanceof WatchError) throw error;
        throw new WatchError("store_unavailable", "watch store lock failed", 503);
      }
      let info = null;
      try {
        info = JSON.parse(await readFile(lockPath, "utf8"));
      } catch {
        info = null;
      }
      if (!lockAlive(info)) {
        await unlink(lockPath).catch(() => {});
        continue;
      }
      if (Date.now() - started > 10_000) throw new WatchError("lock_timeout", "watch store lock timed out", 503);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
}

export async function openFileWatchStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "watch-store.json");
  const lockPath = path.join(directory, "watch-store.lock");
  let chain = Promise.resolve();
  function enqueue(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {});
    return run;
  }
  async function mutate(fn) {
    return enqueue(() => withFileLock(lockPath, async () => {
      const draft = structuredClone(await readState(file));
      const result = await fn(draft);
      try {
        await atomicWrite(file, draft);
      } catch (error) {
        if (error instanceof WatchError) throw error;
        throw new WatchError("store_unavailable", "watch store write failed", 503);
      }
      return result;
    }));
  }
  return {
    kind: "file",
    directory,
    async findGrant(tokenHash, nowIso) {
      const state = await readState(file);
      const grant = state.grants.find((row) => row.tokenHash === tokenHash);
      if (!grant || grant.revokedAt) return null;
      if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.parse(nowIso)) return null;
      return { id: grant.id, projectId: grant.projectId, role: grant.role, expiresAt: grant.expiresAt };
    },
    async getWatch(projectId, taskId) {
      const state = await readState(file);
      const watch = state.watches[keyOf(projectId, taskId)];
      return watch ? structuredClone(watch) : null;
    },
    async insertWatch(watch) {
      return mutate((draft) => {
        const key = keyOf(watch.projectId, watch.taskId);
        if (draft.watches[key]) return { ok: false };
        draft.watches[key] = watch;
        return { ok: true };
      });
    },
    async claimDue({ nowIso, workerId, projectId = null, leaseMs }) {
      return mutate((draft) => {
        const due = Object.values(draft.watches)
          .filter((watch) => watch.status === "scheduled" && watch.nextDueAt <= nowIso)
          .filter((watch) => projectId == null || watch.projectId === projectId)
          .sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt));
        const watch = due[0];
        if (!watch) return null;
        const action = markClaimed(watch, { nowIso, workerId, leaseMs });
        watch.version += 1;
        return { action, watch: structuredClone(watch) };
      });
    },
    async listRunning() {
      const state = await readState(file);
      return Object.values(state.watches).filter((watch) => watch.status === "running").map((watch) => structuredClone(watch));
    },
    async compareAndSave(watch, expectedVersion) {
      return mutate((draft) => {
        const key = keyOf(watch.projectId, watch.taskId);
        const current = draft.watches[key];
        if (!current || current.version !== expectedVersion) return { ok: false, watch: current ? structuredClone(current) : null };
        const next = structuredClone(watch);
        next.version = expectedVersion + 1;
        draft.watches[key] = next;
        return { ok: true, watch: structuredClone(next) };
      });
    },
    async nextDueAt(projectId = null) {
      const state = await readState(file);
      const times = Object.values(state.watches)
        .filter((watch) => watch.status === "scheduled")
        .filter((watch) => projectId == null || watch.projectId === projectId)
        .map((watch) => Date.parse(watch.nextDueAt))
        .filter((value) => Number.isFinite(value));
      if (times.length === 0) return null;
      return Math.min(...times);
    },
    async storageBytes() {
      try {
        return (await stat(file)).size;
      } catch {
        return 0;
      }
    },
    async seedGrant(grant) {
      return mutate((draft) => {
        draft.grants.push(grant);
        return grant;
      });
    },
    async close() {},
  };
}

export { keyOf };
