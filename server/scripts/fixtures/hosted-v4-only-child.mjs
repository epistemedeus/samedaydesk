import http from "node:http";
import { probeLoopback, snapshotAddress } from "./loopback-probe.mjs";

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
});
const timeline = [{ phase: "before-listen", address: snapshotAddress(server.address()) }];
server.listen(0, "0.0.0.0", async () => {
  const bound = snapshotAddress(server.address());
  timeline.push({ phase: "listening", address: bound });
  const probes = {};
  for (const host of ["127.0.0.1", "::1"]) {
    probes[host] = await probeLoopback(host, bound.port, "/");
  }
  process.send?.({ kind: "v4", path: "/", port: bound.port, timeline, probes });
});
timeline.push({ phase: "sync-after-listen-call", address: snapshotAddress(server.address()) });
