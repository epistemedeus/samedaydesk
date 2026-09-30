import { writeSync } from "node:fs";
import { Server } from "node:http";
import { isIpv4TcpAddress } from "../../lib/hosted-listen.js";
import { probeFamily4Health } from "../../lib/hosted-family4.js";

const original = Server.prototype.listen;

Server.prototype.listen = function (...args) {
  const before = this.address();
  const returned = original.apply(this, args);
  const syncAfter = this.address();
  this.once("listening", () => {
    const bound = this.address();
    void report(before, syncAfter, bound);
  });
  return returned;
};

async function report(before, syncAfter, bound) {
  const sameChild = isIpv4TcpAddress(bound)
    ? await probeFamily4Health(bound.port)
    : { ok: false, code: "address-null", status: null, service: null };
  const payload = {
    before: before ?? null,
    syncAfter: syncAfter ?? null,
    bound: bound ?? null,
    sameChild,
    pid: process.pid,
  };
  if (process.env.HOSTED_FAMILY4_FD3 === "1") writeSync(3, JSON.stringify(payload) + "\n");
  if (typeof process.send !== "function") return;
  if (process.env.HOSTED_FAMILY4_EXIT_AFTER_SEND === "1") {
    process.once("message", (command) => {
      if (command === "exit-now") process.exit(0);
    });
  }
  process.send(payload);
}
