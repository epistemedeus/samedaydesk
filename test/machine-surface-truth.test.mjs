import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { offers } from "../scripts/generate-machine-layer.mjs";

const root = process.cwd();
const record = offers();
const surface = JSON.parse(
  fs.readFileSync(path.join(root, "test/fixtures/machine-surface-1.23.16.json"), "utf8"),
);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("live machine surface counts 22 dual-rail products, not 23", () => {
  assert.equal(surface.liveVersion, "1.23.16");
  assert.equal(surface.canonicalPaidActions, 22);
  assert.equal(surface.mcpTools, 22);
  assert.equal(surface.a2aRouteSkills, 22);
  assert.equal(surface.x402Items, 23);
  assert.equal(surface.x402Items - surface.canonicalPaidActions, 1);
  assert.equal(surface.circleOnMpp, false);
  assert.equal(surface.circleOnMcp, false);
  assert.equal(surface.circleOnCatalogActions, false);
  assert.equal(surface.circleProduct, "payment_offer_preflight");
  assert.equal(surface.circleAlternateRoute, "/gateway/commerce/payment-offer-preflight");
});

test("candidate 1.23.17 does not add a 23rd dual-rail product", () => {
  assert.equal(surface.candidateVersion, "1.23.17");
  assert.equal(surface.candidateChangesPaidActionCount, false);
});

test("homepage figure matches canonical paid actions, not raw x402 item length", () => {
  const page = record.homepage;
  assert.equal(page.hero_ticket.figure, "22 paid actions");
  assert.equal(page.proof[0].figure, "22 paid actions");
  assert.equal(page.hero_ticket.rail, "x402 + MPP");
  assert.match(page.hero_ticket.footnote, /Availability, not buyer demand/);
  assert.match(page.hero_ticket.footnote, /Circle Gateway/);
  assert.match(page.hero_ticket.footnote, /not a 23rd product/);
  assert.equal(page.hero_ticket.href, "https://agents.samedaydesk.com/.well-known/x402");

  const home = read("client/public/home.html");
  assert.ok(home.includes("22 paid actions"));
  assert.ok(home.includes("<p class=\"amount\">22</p>"));
  assert.ok(!home.includes("23 paid actions"));
  assert.ok(!home.includes("<p class=\"amount\">23</p>"));
  assert.ok(home.includes(page.hero_ticket.footnote));
  assert.ok(home.includes("one settled labor receipt"));
  assert.ok(!home.includes("settled receipts."));
  for (const banned of ["independent use", "independent buyer", "independent buyers", "banked revenue"]) {
    assert.ok(!home.toLowerCase().includes(banned), `homepage still contains ${banned}`);
  }
});

test("homepage-linked crawler files do not restore the old GEO thesis or a priced homepage", () => {
  const agents = read("client/public/for-agents.html");
  assert.ok(agents.includes("The homepage has no public price list."));
  assert.ok(agents.includes("https://agents.samedaydesk.com/"));
  assert.ok(agents.includes("22 paid actions on x402 and MPP"));
  assert.ok(agents.includes("samedaydesk-agent-tools"));
  assert.ok(agents.includes("version 1.2.0"));
  assert.ok(agents.includes("Read <code>POST /mcp</code> <code>initialize</code> for the live version"));
  assert.ok(agents.includes("not the 22-tool Base USDC merchant"));
  assert.ok(agents.includes("Circle Gateway is listed as an alternate x402 rail"));
  assert.ok(agents.includes("/mpp-openapi.json"));
  assert.ok(!agents.includes("x402-url-extractor-production.up.railway.app"));
  assert.ok(!agents.includes("the four offers with prices"));
  assert.ok(!agents.includes("human services and their prices are on the"));
  assert.ok(agents.includes("no comparison table"));
  assert.ok(!agents.includes("the comparison table, and every FAQ"));
  assert.ok(agents.includes("Those pages are not the homepage offer"));
  assert.ok(agents.includes("Do not treat merchant availability as independent use"));

  const card = read("client/public/.well-known/agent-card.json");
  const parsed = JSON.parse(card);
  assert.equal(parsed.mcp_endpoint, "https://samedaydesk.com/mcp");
  assert.match(parsed.description, /desk for agent-era commerce/);
  assert.ok(!parsed.description.includes("checks what AI answers"));
  assert.ok(parsed.description.includes("https://agents.samedaydesk.com/"));
  assert.deepEqual(parsed.capabilities, []);
  assert.deepEqual(parsed.skills, []);

  const manifest = JSON.parse(read("client/public/site.webmanifest"));
  assert.equal(manifest.description, "A desk for agent-era commerce.");
  assert.ok(!manifest.description.includes("checks what AI answers"));
});
