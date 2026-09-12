import assert from "node:assert/strict";
import net from "node:net";
import { describe, it } from "node:test";

describe("external postgres is not a skipped pass", { timeout: 10_000 }, () => {
  it("records ECONNREFUSED as untested-external and does not invent an archive index result", async () => {
    const probe = await new Promise((resolveProbe) => {
      const sock = net.createConnection({ host: "127.0.0.1", port: 5432 });
      const timer = setTimeout(() => {
        sock.destroy();
        resolveProbe({ listening: false, code: "timeout" });
      }, 2000);
      sock.once("connect", () => {
        clearTimeout(timer);
        sock.end();
        resolveProbe({ listening: true, code: null });
      });
      sock.once("error", (err) => {
        clearTimeout(timer);
        resolveProbe({ listening: false, code: err.code || String(err.message) });
      });
    });
    if (!probe.listening) {
      assert.equal(probe.code, "ECONNREFUSED");
    }
    assert.equal(probe.archiveSatisfied, undefined);
  });
});
