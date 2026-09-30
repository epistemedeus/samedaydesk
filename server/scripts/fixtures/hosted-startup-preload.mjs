import { Server } from "node:http";
import { isIpv4TcpAddress } from "../../lib/hosted-listen.js";
import { probeFamily4Health } from "../../lib/hosted-family4.js";

const original = Server.prototype.listen;

// Publish a port only after family-4 127.0.0.1 has accepted /api/health.
// The listening callback's address().port is not that proof: a connect
// before accept, a close, or a dead child is ECONNREFUSED.
Server.prototype.listen = function (...args) {
  this.once("listening", () => { void publish(this); });
  return original.apply(this, args);
};

function send(payload) {
  if (typeof process.send !== "function") return;
  process.send(payload);
}

async function publish(server) {
  const bound = server.address();
  const port = isIpv4TcpAddress(bound) ? bound.port : null;
  if (process.env.HOSTED_STARTUP_CLOSE_BEFORE_ACCEPT === "1" && port) {
    server.close(() => {
      void probeFamily4Health(port).then((sameChild) => {
        send({
          port,
          bound,
          accepted: false,
          sameChild,
        });
      });
    });
    return;
  }
  const sameChild = port
    ? await probeFamily4Health(port)
    : { ok: false, code: "address-null", status: null, service: null };
  if (process.env.HOSTED_STARTUP_EXIT_AFTER_SEND === "1") {
    process.once("message", (command) => {
      if (command === "exit-now") process.exit(0);
    });
  }
  send({
    port,
    bound: bound ?? null,
    accepted: sameChild.ok === true,
    sameChild,
  });
}
