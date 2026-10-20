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
test("the Smithery line keeps the qualified listing and sends acquisition to the direct endpoint", () => {
  const line = "- [Optional Smithery directory listing](https://smithery.ai/servers/epistemedeus/samedaydesk-machine-commerce): Public directory entry. Acquire the MCP endpoint directly at https://agents.samedaydesk.com/mcp with no Smithery account, key, or proxy.";
  assert.deepEqual(guide.split("\n").filter((row) => row.includes("smithery.ai")), [line]);
  assert.equal(guide.includes("Managed MCP connection"), false);
  assert.equal(guide.includes(obsolete), false);
  assert.ok(line.includes(maintained));
  assert.ok(line.includes(direct));
  assert.ok(line.includes("no Smithery account"));
  assert.ok(guide.includes("- [Paid machine gateway MCP](https://agents.samedaydesk.com/mcp): Paid MCP tools from the canonical SameDayDesk machine gateway. Live MCP inventory is authoritative."));
  assert.ok(guide.includes("- [Homepage](https://samedaydesk.com/): Agent-commerce build catalog, flat prices, acceptance guarantee, and Stripe order links."));
  assert.ok(guide.includes("- [EIN.LLC](https://ein.llc/): US LLC formation and EIN activation."));
});
