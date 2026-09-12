import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { KIT_SCHEMA } from "../lib/pins.mjs";
import { parseJson, SDS52_CALLER, spawnD28, startServe } from "./helpers.mjs";

describe("packet HTTP process", { timeout: 180_000 }, () => {
  it("serve process answers health, packet, readback, return, deployed", async () => {
    const packetDir = mkdtempSync(join(tmpdir(), "d28-http-"));
    const packed = spawnD28([
      "pack",
      "--out-dir",
      packetDir,
      "--before",
      SDS52_CALLER.before,
      "--after",
      SDS52_CALLER.after,
      "--payment",
      SDS52_CALLER.payment,
    ]);
    assert.equal(packed.status, 0, packed.stderr + packed.stdout);

    const { child, originPromise } = startServe(packetDir);
    try {
      const origin = await originPromise;
      const health = await (await fetch(`${origin}/health`)).json();
      assert.equal(health.ok, true);
      assert.equal(health.kit, KIT_SCHEMA);
      assert.equal(health.deployed, false);

      const packet = await (await fetch(`${origin}/packet`)).json();
      assert.equal(packet.schema, KIT_SCHEMA);
      assert.equal(packet.firstJob.jobId, "vendor-budget-impact");
      assert.equal(packet.settlement.sold, false);

      const rb = await fetch(`${origin}/readback`);
      assert.equal(rb.status, 200);
      const readback = await rb.json();
      assert.equal(readback.ok, true);

      const ret = await (await fetch(`${origin}/return`)).json();
      assert.equal(ret.returnSignal, "absent");
      assert.equal(ret.liveReturn, "absent");
      assert.equal(ret.usefulSecondJob, false);

      const deployed = await (await fetch(`${origin}/deployed`)).json();
      assert.equal(deployed.deployed, false);
      assert.equal(deployed.artifact, "absent");

      const missing = await fetch(`${origin}/not-a-route`);
      assert.equal(missing.status, 404);
      const missingBody = await missing.json();
      assert.equal(missingBody.code, "not-found");
    } finally {
      child.kill("SIGTERM");
    }
  });
});
