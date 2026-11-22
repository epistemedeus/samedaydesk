import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Provider listings are optional discovery aids. The shipped direct endpoint is
// the acquisition path, even when the current guide has no external listing.
const maintained = "https://smithery.ai/servers/epistemedeus/samedaydesk-machine-commerce";
const obsolete = "https://smithery.ai/servers/epistemedeus/x402-data-gateway";
const direct = "https://agents.samedaydesk.com/mcp";
const guide = readFileSync(new URL("../../client/public/llms.txt", import.meta.url), "utf8");
function links(text) {
  return [...text.matchAll(/\[[^\]]+\]\((https:\/\/[^)\s]+)\)/g)].map((match) => match[1]);
}
function discoveryIsUsable(text) {
  const targets = links(text);
  const listings = targets.filter((url) => url.startsWith("https://smithery.ai/servers/"));
  return targets.includes(direct)
    && listings.every((url) => url === maintained)
    && !text.includes(obsolete)
    && !text.includes("Managed MCP connection");
}

test("the shipped guide keeps direct acquisition without requiring an external listing", () => {
  assert.equal(discoveryIsUsable(guide), true);
  assert.ok(links(guide).includes("https://samedaydesk.com/mcp"));
});
test("a provider listing cannot replace the canonical direct endpoint", () => {
  assert.equal(discoveryIsUsable(guide.replaceAll(direct, maintained)), false);
});
test("optional listing discovery preserves its qualified identity", () => {
  assert.equal(discoveryIsUsable(`${guide}\n[Directory listing](${maintained})`), true);
  assert.equal(discoveryIsUsable(`${guide}\n[Directory listing](${obsolete})`), false);
});
test("the guide retains current inventory, instructions and HTTP contracts", () => {
  const targets = links(guide);
  for (const target of [
    "https://samedaydesk.com/start.md",
    "https://agents.samedaydesk.com/.well-known/x402",
    "https://agents.samedaydesk.com/llms.txt",
    "https://agents.samedaydesk.com/api/actions",
    "https://samedaydesk.com/openapi.json",
  ]) assert.ok(targets.includes(target), `missing canonical machine entry: ${target}`);
});
