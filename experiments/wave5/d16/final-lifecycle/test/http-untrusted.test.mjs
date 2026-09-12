import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, describe, it } from "node:test";
import { PINNED_IMPLEMENTATION } from "../lib/contract.mjs";
import { d01Module, isolateDir, sharedColdKit, wipeSharedKit } from "../lib/kit.mjs";
import { killIsolate } from "../lib/process.mjs";

describe("local CLI inputs vs untrusted loopback HTTP", { timeout: 60_000 }, () => {
  it("POST /execute lockfile with stale caller outDir uses runOutDir as identity; sold stays false", async () => {
    const kit = sharedColdKit();
    const { createExecutionServer, listenExecutionServer } = await import(
      pathToFileURL(d01Module("server/paid-useful-jobs/lib/http.mjs")).href
    );
    const { server } = createExecutionServer();
    const { origin } = await listenExecutionServer(server, { host: "127.0.0.1", port: 0 });
    const callerOut = isolateDir("w5-d16-final-http-stale-");
    writeFileSync(join(callerOut, "pin-delta.json"), '{"stale":true}\n');
    writeFileSync(join(callerOut, "pin-delta.md"), "HTTP-STALE-MD\n");
    try {
      const posted = await fetch(`${origin}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "lockfile-pin-delta",
          inputs: {
            before: join(kit, "samples/lockfile/h04-pub-lock-01/before.json"),
            after: join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
          },
          outDir: callerOut,
        }),
      });
      assert.equal(posted.status, 200);
      const body = await posted.json();
      assert.equal(body.contract, PINNED_IMPLEMENTATION.contract);
      assert.equal(body.ok, true, body.error);
      assert.equal(body.sold, false);
      assert.equal(body.purchaseAuthority, false);
      assert.equal(body.transport, "ok");
      assert.equal(body.delivery?.complete, true);
      assert.ok(body.runOutDir);
      assert.notEqual(body.runOutDir, callerOut);
      assert.equal(body.outDir, callerOut);
      assert.equal(existsSync(join(body.runOutDir, "pin-delta.json")), true);
      assert.notEqual(JSON.parse(readFileSync(join(callerOut, "pin-delta.json"), "utf8")).stale, true);
      assert.equal(readFileSync(join(callerOut, "pin-delta.md"), "utf8").includes("HTTP-STALE-MD"), false);
      const got = await fetch(`${origin}${body.retrieval.path}`);
      assert.equal(got.status, 200);
      const stored = await got.json();
      assert.equal(stored.executionId, body.executionId);
      assert.equal(stored.sold, false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  after(() => {
    wipeSharedKit();
    killIsolate("w5-d16-final-");
  });
});
