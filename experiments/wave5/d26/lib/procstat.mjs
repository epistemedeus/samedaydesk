import { readdirSync, readFileSync } from "node:fs";

export function clkTck() {
  const fromEnv = Number(process.env.CLK_TCK);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 100;
}

export function readPidSample(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const close = stat.lastIndexOf(")");
  const rest = stat.slice(close + 2).split(" ");
  const field = (n) => rest[n - 3];
  let vmRss = 0;
  let vmHwm = 0;
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    vmRss = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] || 0) * 1024;
    vmHwm = Number(/VmHWM:\s+(\d+)/.exec(status)?.[1] || 0) * 1024;
  } catch {
    vmRss = Number(field(24) || 0) * 4096;
  }
  const utime = Number(field(14) || 0);
  const stime = Number(field(15) || 0);
  const cutime = Number(field(16) || 0);
  const cstime = Number(field(17) || 0);
  return {
    pid: Number(pid),
    ppid: Number(field(4) || 0),
    utime,
    stime,
    cutime,
    cstime,
    selfTicks: utime + stime,
    childTicks: cutime + cstime,
    rssBytes: vmRss,
    hwmBytes: vmHwm,
  };
}

export function listChildren(rootPid) {
  const root = Number(rootPid);
  const byPpid = new Map();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const sample = readPidSample(name);
      if (!byPpid.has(sample.ppid)) byPpid.set(sample.ppid, []);
      byPpid.get(sample.ppid).push(sample.pid);
    } catch {
      // process exited
    }
  }
  const out = [];
  const stack = [...(byPpid.get(root) || [])];
  while (stack.length) {
    const pid = stack.pop();
    out.push(pid);
    for (const child of byPpid.get(pid) || []) stack.push(child);
  }
  return out;
}

export function sampleTree(rootPid) {
  const pids = [Number(rootPid), ...listChildren(rootPid)];
  const samples = [];
  for (const pid of pids) {
    try {
      samples.push(readPidSample(pid));
    } catch {
      // exited
    }
  }
  const root = samples.find((s) => s.pid === Number(rootPid));
  const liveChildren = samples.filter((s) => s.pid !== Number(rootPid));
  const cpuTicks = (root ? root.selfTicks + root.childTicks : 0)
    + liveChildren.reduce((sum, s) => sum + s.selfTicks, 0);
  const rssBytes = samples.reduce((sum, s) => sum + s.rssBytes, 0);
  const hwmBytes = samples.reduce((sum, s) => sum + s.hwmBytes, 0);
  return { rootPid: Number(rootPid), pids, samples, cpuTicks, rssBytes, hwmBytes };
}

export function ticksToSeconds(ticks, tck = clkTck()) {
  return Number(ticks) / tck;
}

export function ticksToMs(ticks, tck = clkTck()) {
  return (Number(ticks) / tck) * 1000;
}

export function meminfo() {
  const text = readFileSync("/proc/meminfo", "utf8");
  const num = (key) => Number(new RegExp(`${key}:\\s+(\\d+)`).exec(text)?.[1] || 0) * 1024;
  return {
    memTotalBytes: num("MemTotal"),
    memFreeBytes: num("MemFree"),
    memAvailableBytes: num("MemAvailable"),
  };
}

export async function measureDuring(rootPid, work, { intervalMs = 20 } = {}) {
  const tck = clkTck();
  const started = process.hrtime.bigint();
  const before = sampleTree(rootPid);
  let peakRss = before.rssBytes;
  let peakHwm = before.hwmBytes;
  const timer = setInterval(() => {
    try {
      const now = sampleTree(rootPid);
      if (now.rssBytes > peakRss) peakRss = now.rssBytes;
      if (now.hwmBytes > peakHwm) peakHwm = now.hwmBytes;
    } catch {
      // ignore
    }
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  let result;
  let error;
  try {
    result = await work();
  } catch (err) {
    error = err;
  }
  clearInterval(timer);
  const ended = process.hrtime.bigint();
  const after = sampleTree(rootPid);
  if (after.rssBytes > peakRss) peakRss = after.rssBytes;
  if (after.hwmBytes > peakHwm) peakHwm = after.hwmBytes;
  const wallNs = ended - started;
  const wallMs = Number(wallNs) / 1e6;
  const cpuTicks = Math.max(0, after.cpuTicks - before.cpuTicks);
  const payload = {
    wallMs,
    cpuMs: ticksToMs(cpuTicks, tck),
    cpuSeconds: ticksToSeconds(cpuTicks, tck),
    wallSeconds: wallMs / 1000,
    peakRssBytes: peakRss,
    peakHwmBytes: peakHwm,
    clkTck: tck,
    beforeTicks: before.cpuTicks,
    afterTicks: after.cpuTicks,
  };
  if (error) {
    error.measurement = payload;
    throw error;
  }
  return { result, ...payload };
}
