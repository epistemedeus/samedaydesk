import assert from "node:assert/strict";
import net from "node:net";
import { describe, it } from "node:test";

function probePostgres({ host = "127.0.0.1", port = 5432, timeoutMs = 400 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (ok, reason) => {
      socket.destroy();
      resolve({
        ok,
        reason,
        host,
        port,
        evidenceClass: ok ? "local-runtime" : "untested-external",
      });
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true, "tcp-connect"));
    socket.on("timeout", () => finish(false, "timeout"));
    socket.on("error", (err) => finish(false, err.code || String(err.message)));
  });
}

describe("postgres probe", () => {
  it("does not fake a database; records fixture vs local-runtime honestly", async () => {
    const probe = await probePostgres();
    assert.equal(typeof probe.ok, "boolean");
    assert.ok(probe.reason);
    if (!probe.ok) {
      assert.equal(probe.evidenceClass, "untested-external");
    }
  });
});
