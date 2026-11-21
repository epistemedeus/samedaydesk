import { randomBytes } from "node:crypto";
import { open, readFile, rename, unlink, mkdir } from "node:fs/promises";
import path from "node:path";

import { MonitorError } from "./errors.mjs";
import { emptyState, STATE_SCHEMA } from "./transition.mjs";

function finish(result) {
  return result === undefined ? undefined : structuredClone(result);
}

export function createMemoryStore(initial = emptyState()) {
  let state = structuredClone(initial);
  let chain = Promise.resolve();
  return {
    kind: "memory",
    async transact(fn) {
      const run = chain.then(async () => {
        const draft = structuredClone(state);
        const result = await fn(draft);
        state = draft;
        return finish(result);
      });
      chain = run.then(
        () => {},
        () => {},
      );
      return run;
    },
    async read() {
      return this.transact(async (draft) => structuredClone(draft));
    },
  };
}

async function loadState(file) {
  try {
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text);
    if (!parsed || parsed.schema !== STATE_SCHEMA) {
      throw new MonitorError("state file schema is not change-monitor.state.v1", { code: "state_schema" });
    }
    return parsed;
  } catch (error) {
    if (error && error.code === "ENOENT") return emptyState();
    throw error;
  }
}

async function atomicWrite(file, state) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file);
}

function lockHeldByLiveProcess(info) {
  if (!info || !Number.isInteger(info.pid)) return false;
  if (info.pid === process.pid) return true;
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquire(lockPath) {
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      } finally {
        await handle.close();
      }
      return;
    } catch (error) {
      if (!error || error.code !== "EEXIST") throw error;
      let info = null;
      try {
        info = JSON.parse(await readFile(lockPath, "utf8"));
      } catch {
        info = null;
      }
      if (!lockHeldByLiveProcess(info)) {
        await unlink(lockPath).catch(() => {});
        continue;
      }
      if (Date.now() - started > 15000) {
        throw new MonitorError("state lock timed out", { code: "lock_timeout" });
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

export async function openFileStore(file) {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true });
  const lockPath = `${file}.lock`;
  let chain = Promise.resolve();
  const store = {
    kind: "file",
    file,
    async transact(fn) {
      const run = chain.then(async () => {
        await acquire(lockPath);
        try {
          const current = await loadState(file);
          const draft = structuredClone(current);
          const result = await fn(draft);
          if (JSON.stringify(draft) !== JSON.stringify(current)) await atomicWrite(file, draft);
          return finish(result);
        } finally {
          await unlink(lockPath).catch(() => {});
        }
      });
      chain = run.then(
        () => {},
        () => {},
      );
      return run;
    },
    async read() {
      return store.transact(async (draft) => structuredClone(draft));
    },
  };
  return store;
}
