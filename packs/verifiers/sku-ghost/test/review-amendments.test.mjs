import assert from "node:assert/strict";
import test from "node:test";
import { getOffer } from "../../../../server/pricing.js";
import { parseArgs } from "../src/cli.mjs";
import { fail } from "../src/failures.mjs";
import {
  centsOfAdvertisement,
  parseClientCatalog,
  parseLlmsPricedLines,
} from "../src/parse.mjs";
import { verifySkuGhost } from "../src/verify.mjs";
import { REPO_ROOT, runSkuGhost, parseStdout } from "./helpers.mjs";

test("ghost slug with a real product name is still ghost_sku", async () => {
  assert.equal(getOffer("sku_ghost_premium"), null);
  const result = await verifySkuGhost({
    mode: "fixture",
    fixtureRaw: JSON.stringify({
      ok: true,
      advertised: [
        {
          slug: "sku_ghost_premium",
          name: "Agent Workflow Integration",
          priceUsd: 149,
          surface: "probe",
        },
      ],
    }),
    repoRoot: REPO_ROOT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "ghost_sku");
  assert.equal(result.ghosts[0].slug, "sku_ghost_premium");
});

test("inherited Object keys are ghosts, not live SKUs", async () => {
  assert.equal(getOffer("toString"), null);
  assert.equal(getOffer("constructor"), null);
  const missingAmount = await verifySkuGhost({
    mode: "fixture",
    fixtureRaw: JSON.stringify({ ok: true, advertised: [{ slug: "toString", surface: "probe" }] }),
    repoRoot: REPO_ROOT,
  });
  assert.equal(missingAmount.ok, false);
  assert.equal(missingAmount.failure.class, "ghost_sku");

  const withCents = await verifySkuGhost({
    mode: "fixture",
    fixtureRaw: JSON.stringify({
      ok: true,
      advertised: [{ slug: "constructor", amountCents: 1, surface: "probe" }],
    }),
    repoRoot: REPO_ROOT,
  });
  assert.equal(withCents.ok, false);
  assert.equal(withCents.failure.class, "ghost_sku");
});

test("CLI --committed --edit-prices is sku_change_refused", () => {
  const proc = runSkuGhost(["--committed", "--edit-prices"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2, proc.stderr || proc.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.failure.class, "sku_change_refused");
});

test("CLI --help --publish does not launder publish_attempted", () => {
  const proc = runSkuGhost(["--help", "--publish"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2);
  assert.equal(json.failure.class, "publish_attempted");
});

test("--fixture then --committed runs committed surfaces, not the fixture", () => {
  const parsed = parseArgs([
    "--fixture",
    "packs/verifiers/sku-ghost/fixtures/seeded/ghost-sku.json",
    "--committed",
  ]);
  assert.equal(parsed.args.mode, "committed");
  assert.equal(parsed.args.fixturePath, null);

  const proc = runSkuGhost([
    "--fixture",
    "packs/verifiers/sku-ghost/fixtures/seeded/ghost-sku.json",
    "--committed",
  ]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.mode, "committed");
  assert.deepEqual(json.ghosts, []);
});

test("fail() extra cannot overwrite class or message", () => {
  const result = fail("ghost_sku", "Advertised SKU slug is not in server/pricing.js OFFERS", {
    class: "usage",
    message: "laundered",
    ghosts: [{ slug: "x" }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "ghost_sku");
  assert.match(result.failure.message, /not in server\/pricing\.js/);
  assert.equal(result.ghosts[0].slug, "x");
});

test("fixture price field is dollars like the homepage catalog", () => {
  assert.equal(centsOfAdvertisement({ price: 149 }), 14900);
  assert.equal(centsOfAdvertisement({ price: 999 }), 99900);
  assert.equal(centsOfAdvertisement({ amountCents: 14900 }), 14900);
  assert.equal(centsOfAdvertisement({ priceUsd: 0.05 }), 5);
});

test("llms parser accepts $149.00 as well as $149.", () => {
  const rows = parseLlmsPricedLines(
    "## Start here\n- Agent Workflow Integration: $149.00\n\n## Agent interfaces\n",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "agent_workflow");
  assert.equal(rows[0].amountCents, 14900);
});

test("catalog parser reads single-quoted slug/name/price", () => {
  const rows = parseClientCatalog(
    "const x = { slug: 'agent_workflow', name: 'Agent Workflow Integration', price: 149 };",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "agent_workflow");
  assert.equal(rows[0].amountCents, 14900);
});
