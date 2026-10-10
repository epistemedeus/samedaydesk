import { readdirSync, readFileSync } from "node:fs";

export function pidsWithRunId(runId) {
  if (!runId) return [];
  const needle = `JOA_RUN_ID=${runId}`;
  const found = [];
  let names;
  try {
    names = readdirSync("/proc");
  } catch {
    return found;
  }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const environ = readFileSync(`/proc/${name}/environ`);
      if (environ.includes(needle) || environ.toString("utf8").includes(needle)) {
        found.push(Number(name));
      }
    } catch {
      // process exited while scanning
    }
  }
  return found;
}

export function killProcessGroup(pid, signal = "SIGKILL") {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // group may already be gone
  }
  try {
    process.kill(pid, signal);
  } catch {
    // leader may already be gone
  }
}

export async function waitUntilGone(runId, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const leftover = pidsWithRunId(runId).filter((pid) => pid !== process.pid);
    if (leftover.length === 0) return [];
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return pidsWithRunId(runId).filter((pid) => pid !== process.pid);
}
