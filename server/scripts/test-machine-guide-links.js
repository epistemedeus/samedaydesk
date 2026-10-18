import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

// The implementation serverInfo.name is not the discovery provider's listing ID.
const maintained = "https://smithery.ai/servers/epistemedeus/samedaydesk-machine-commerce";
const obsolete = "https://smithery.ai/servers/epistemedeus/x402-data-gateway";
const direct = "https://agents.samedaydesk.com/mcp";
const guide = readFileSync(new URL("../../client/public/llms.txt", import.meta.url), "utf8");
function listingLinks(text) {
  return [...text.matchAll(/\[[^\]]+\]\((https:\/\/smithery\.ai\/servers\/[^)\s]+)\)/g)].map(m => m[1]);
}
test("the shipped machine guide names the maintained external listing", () => {
  assert.deepEqual(listingLinks(guide), [maintained]);
  assert.equal(guide.includes(obsolete), false);
});
test("a server implementation name cannot silently replace the listing identity", () => {
  const changed = guide.replace(maintained, obsolete);
  assert.notDeepEqual(listingLinks(changed), [maintained]);
});
test("listing discovery does not replace the no-key canonical MCP entry", () => {
  assert.ok(guide.includes(direct));
  assert.ok(guide.indexOf(direct) < guide.indexOf(maintained));
});
