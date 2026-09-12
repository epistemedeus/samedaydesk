import { cpus, loadavg, hostname } from "node:os";
import { readFileSync } from "node:fs";
import {
  DEFAULT_H04_ROOT,
  DEFAULT_MERCHANT_ROOT,
  H04_SHA,
  MERCHANT_SHA,
  MERCHANT_VERSION,
  SCHEMA_ENVIRONMENT,
} from "./pins.mjs";
import { clkTck, meminfo } from "./procstat.mjs";

export function captureEnvironment({
  merchantRoot = DEFAULT_MERCHANT_ROOT,
  h04Root = DEFAULT_H04_ROOT,
  extra = {},
} = {}) {
  const cpu = cpus();
  const mem = meminfo();
  return {
    schema: SCHEMA_ENVIRONMENT,
    capturedAt: new Date().toISOString(),
    hostname: hostname(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    execPath: process.execPath,
    pid: process.pid,
    cwd: process.cwd(),
    clkTck: clkTck(),
    cpuCount: cpu.length,
    cpuModel: cpu[0]?.model || null,
    loadavg: loadavg(),
    memTotalBytes: mem.memTotalBytes,
    memFreeBytes: mem.memFreeBytes,
    memAvailableBytes: mem.memAvailableBytes,
    merchantRoot,
    merchantSha: MERCHANT_SHA,
    merchantVersion: MERCHANT_VERSION,
    h04Root,
    h04Sha: H04_SHA,
    method: {
      handler: "spawn merchant server.js against injectable fake facilitator on 127.0.0.1",
      cpu: "/proc/<pid>/stat utime+stime plus reaped cutime/cstime and live descendant self ticks",
      rss: "polled /proc status VmRSS for merchant plus descendants during the request",
      wall: "process.hrtime.bigint around fetch",
      notProductionCapacity: true,
      noPublicEndpointLoad: true,
      noLivePayment: true,
    },
    ...extra,
  };
}

export function readOsRelease() {
  try {
    return readFileSync("/etc/os-release", "utf8").trim();
  } catch {
    return null;
  }
}
