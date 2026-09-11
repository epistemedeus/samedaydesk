import assert from "node:assert/strict";
import test from "node:test";
import { X402_TITLE } from "../../../../client/src/data/machineEntry.mjs";
import { closeServer, startSdsApi, startSpaShellApp } from "../lib/http.mjs";

test("GET /x402 is a SPA shell, not an Express API route, on SDS52", async (t) => {
  const api = await startSdsApi();
  t.after(() => closeServer(api.server));
  const apiHit = await fetch(`${api.origin}/x402`, { redirect: "manual" });
  assert.equal(apiHit.status, 404);
  assert.match(await apiHit.text(), /Cannot GET \/x402/);

  const spa = await startSpaShellApp();
  t.after(() => closeServer(spa.server));
  const spaHit = await fetch(`${spa.origin}/x402`, { redirect: "manual" });
  assert.equal(spaHit.status, 200);
  const html = await spaHit.text();
  assert.match(spaHit.headers.get("content-type") || "", /html/);
  assert.match(html, /<title>Agent Payment Infrastructure: x402 and MPP \| SameDayDesk<\/title>/);
  assert.equal(X402_TITLE, "Agent Payment Infrastructure: x402 and MPP | SameDayDesk");
  assert.match(html, /<div id="root">/);
});
