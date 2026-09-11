export function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

export function liveOtherHolder(existing, incoming) {
  if (!existing || existing.status === "complete") return false;
  if (!existing.holderToken || existing.holderToken === incoming?.holderToken) return false;
  return pidAlive(existing.holderPid);
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
