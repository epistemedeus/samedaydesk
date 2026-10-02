import { Server } from "node:http";
import { probeLoopback, snapshotAddress } from "./loopback-probe.mjs";

const original = Server.prototype.listen;
const hosts = ["127.0.0.1", "::1"];

Server.prototype.listen = function (...args) {
  const timeline = [{ phase: "before-listen", address: snapshotAddress(this.address()) }];
  let syncAddress = null;
  let syncRecorded = false;
  this.once("listening", async () => {
    timeline.push({
      phase: "sync-after-listen-call",
      address: syncRecorded ? syncAddress : null,
    });
    const bound = snapshotAddress(this.address());
    timeline.push({ phase: "listening", address: bound });
    const probes = {};
    if (bound && Number.isInteger(bound.port)) {
      for (const host of hosts) {
        probes[host] = await probeLoopback(host, bound.port, "/api/health", { expectService: "samedaydesk" });
      }
    }
    process.send?.({
      kind: "entry",
      path: "/api/health",
      port: bound?.port ?? null,
      timeline,
      probes,
    });
  });
  const returned = original.apply(this, args);
  syncAddress = snapshotAddress(this.address());
  syncRecorded = true;
  return returned;
};
