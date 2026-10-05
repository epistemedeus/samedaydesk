import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openDesk } from "../lib/index.mjs";
import { createLocalDeskServer } from "../lib/http-adapter.mjs";
import { CALLER_AFTER, CALLER_BEFORE, tempStore } from "./helpers.mjs";

describe("local HTTP adapter (not live Express)", { timeout: 120_000 }, () => {
  it("create/status/list over 127.0.0.1 against the real desk library", async () => {
    const desk = openDesk(tempStore("jrd-http-"));
    const { baseUrl, close } = await createLocalDeskServer(desk).listen();
    try {
      const createdRes = await fetch(`${baseUrl}/v1/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          engineId: "vendor-budget-impact",
          inputs: { before: CALLER_BEFORE, after: CALLER_AFTER },
        }),
      });
      const created = await createdRes.json();
      assert.equal(createdRes.status, 200);
      assert.equal(created.ok, true);
      assert.equal(created.sold, false);
      assert.equal(created.status, "completed");
      assert.match(created.requestId, /^[0-9a-f]{64}$/);

      const statusRes = await fetch(`${baseUrl}/v1/requests/${created.requestId}`);
      const status = await statusRes.json();
      assert.equal(status.requestId, created.requestId);
      assert.equal(status.sold, false);
      assert.equal(status.status, "completed");

      const listRes = await fetch(`${baseUrl}/v1/requests?engineId=vendor-budget-impact`);
      const listed = await listRes.json();
      assert.equal(listRes.status, 200);
      assert.equal(listed.sold, false);
      assert.equal(listed.requests.some((r) => r.requestId === created.requestId), true);
    } finally {
      await close();
    }
  });
});
