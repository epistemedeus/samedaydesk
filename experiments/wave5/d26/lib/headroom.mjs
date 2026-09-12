import { meminfo } from "./procstat.mjs";
import { cpus } from "node:os";

const MIN_AVAILABLE_FOR_12 = 1536 * 1024 * 1024;

export function concurrencyPlan({ requested = [1, 6, 12] } = {}) {
  const mem = meminfo();
  const cpuCount = cpus().length;
  const allowed = [];
  const skipped = [];
  for (const n of requested) {
    const need = n === 12 ? MIN_AVAILABLE_FOR_12 : 256 * 1024 * 1024 * Math.max(1, n / 6);
    if (mem.memAvailableBytes < need) {
      skipped.push({
        concurrency: n,
        reason: "mem-available-below-threshold",
        memAvailableBytes: mem.memAvailableBytes,
        needBytes: need,
      });
      continue;
    }
    allowed.push(n);
  }
  return {
    cpuCount,
    memAvailableBytes: mem.memAvailableBytes,
    memTotalBytes: mem.memTotalBytes,
    requested,
    allowed,
    skipped,
    note: "Latency/cost evidence only. Not a live loadtest. 12-way oversubscribe of 4 CPUs is accepted when RAM allows.",
  };
}
