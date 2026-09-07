import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before, beforeEach } from "node:test";
import express from "express";

import {
  FIXPACK_AMOUNT_CENTS,
  FIXPACK_CURRENCY,
  FIXPACK_HUMAN_BUY_URL,
  FIXPACK_MCP_BUY_URL,
  FIXPACK_OFFER_SLUG,
  FIXPACK_PAYMENT_LINK_IDS_ENV,
  configuredFixPackPaymentLinkIds,
  fixPackLicenseDeps,
  paymentLinkIdFromSession,
  sessionEntitlesFixPack,
  sessionHasExactFixPackPaidState,
  sessionMatchesTrustedFixPackIds,
  validateFixPackLicense,
} from "../lib/fixpack-license.js";
import {
  completeContainsFullSections,
  generateCompleteFixPack,
  generateStarterFixPack,
  starterContainsOnlyAdvertisedSections,
} from "../lib/fixpack-artifact.js";
import mcpRouter from "../routes/mcp.js";

const TRUSTED_PLINK = "plink_fixPackTrustedFixture";
const FOREIGN_PLINK = "plink_otherProductFixture";
const SAMPLE_HTML = `<!doctype html><html><head>
<title>Example Co | Demo Site</title>
<meta name="description" content="Example company does useful things for customers everywhere online today.">
</head><body><h1>Example Co</h1><a href="/about">About</a></body></html>`;

function paidSession(overrides = {}) {
  return {
    id: "cs_test_fixpack_paid",
    payment_status: "paid",
    currency: FIXPACK_CURRENCY,
    amount_total: FIXPACK_AMOUNT_CENTS,
    payment_link: TRUSTED_PLINK,
    metadata: {},
    ...overrides,
  };
}

function fakeStripe(sessionsById, linksById = {}) {
  return {
    checkout: {
      sessions: {
        retrieve: async (id) => {
          const session = sessionsById[id];
          if (!session) {
            const err = new Error("No such checkout.session");
            err.statusCode = 404;
            throw err;
          }
          return session;
        },
      },
    },
    paymentLinks: {
      retrieve: async (id) => {
        const link = linksById[id];
        if (!link) {
          const err = new Error("No such payment_link");
          err.statusCode = 404;
          throw err;
        }
        return link;
      },
    },
  };
}

let server;
let mcpUrl;
let originalFetch;
let originalDeps;

before(async () => {
  originalFetch = globalThis.fetch;
  originalDeps = {
    getStripe: fixPackLicenseDeps.getStripe,
    isConfigured: fixPackLicenseDeps.isConfigured,
  };
  globalThis.fetch = async (url, init) => {
    const href = typeof url === "string" ? url : String(url?.url || url);
    if (href.includes("example.com")) {
      return new Response(SAMPLE_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    return originalFetch(url, init);
  };

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/mcp", mcpRouter);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  mcpUrl = `http://127.0.0.1:${port}/mcp`;
});

beforeEach(() => {
  fixPackLicenseDeps.getStripe = originalDeps.getStripe;
  fixPackLicenseDeps.isConfigured = originalDeps.isConfigured;
});

after(async () => {
  globalThis.fetch = originalFetch;
  fixPackLicenseDeps.getStripe = originalDeps.getStripe;
  fixPackLicenseDeps.isConfigured = originalDeps.isConfigured;
  if (!server) return;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function callFixPack({ license, url = "https://example.com" } = {}) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: {
        name: "generate_complete_fix_pack",
        arguments: license === undefined ? { url } : { url, license },
      },
    }),
  });
  const json = await response.json();
  return { response, json, text: json?.result?.content?.[0]?.text || "" };
}

test("configured Fix Pack Payment Link IDs accept only exact plink_ values", () => {
  assert.equal(configuredFixPackPaymentLinkIds({}).size, 0);
  assert.equal(configuredFixPackPaymentLinkIds({
    [FIXPACK_PAYMENT_LINK_IDS_ENV]: "https://buy.stripe.com/example",
  }).size, 0);
  assert.deepEqual(
    [...configuredFixPackPaymentLinkIds({
      [FIXPACK_PAYMENT_LINK_IDS_ENV]: ` ${TRUSTED_PLINK}, ${FOREIGN_PLINK}, bad `,
    })].sort(),
    [FOREIGN_PLINK, TRUSTED_PLINK].sort(),
  );
});

test("exact paid state rejects unpaid, wrong currency, and non-exact amounts", () => {
  assert.equal(sessionHasExactFixPackPaidState(paidSession()), true);
  assert.equal(sessionHasExactFixPackPaidState(paidSession({ payment_status: "unpaid" })), false);
  assert.equal(sessionHasExactFixPackPaidState(paidSession({ currency: "eur" })), false);
  assert.equal(sessionHasExactFixPackPaidState(paidSession({ amount_total: 4900 })), false);
  assert.equal(sessionHasExactFixPackPaidState(paidSession({ amount_total: 3899 })), false);
});

test("amount-only paid sessions without trusted offer binding are denied", async () => {
  const foreign = paidSession({ payment_link: FOREIGN_PLINK, amount_total: 4900 });
  assert.equal(sessionMatchesTrustedFixPackIds(foreign, {
    trustedPaymentLinkIds: new Set([TRUSTED_PLINK]),
  }), false);
  assert.equal(await sessionEntitlesFixPack(foreign, {
    trustedPaymentLinkIds: new Set([TRUSTED_PLINK]),
    resolveBuyUrl: async () => FIXPACK_HUMAN_BUY_URL, // must not matter: amount wrong
  }), false);

  const enoughCentsWrongProduct = paidSession({ payment_link: FOREIGN_PLINK });
  assert.equal(await sessionEntitlesFixPack(enoughCentsWrongProduct, {
    trustedPaymentLinkIds: new Set([TRUSTED_PLINK]),
    resolveBuyUrl: async () => "https://buy.stripe.com/unrelatedProduct",
  }), false);
});

test("trusted Payment Link, stamped offer, product id, and legacy buy URL all entitle", async () => {
  assert.equal(sessionMatchesTrustedFixPackIds(paidSession(), {
    trustedPaymentLinkIds: new Set([TRUSTED_PLINK]),
  }), true);

  assert.equal(sessionMatchesTrustedFixPackIds(paidSession({
    payment_link: null,
    metadata: { offer: FIXPACK_OFFER_SLUG },
  }), {
    trustedPaymentLinkIds: new Set(),
  }), true);

  assert.equal(sessionMatchesTrustedFixPackIds(paidSession({
    payment_link: null,
    line_items: { data: [{ price: { product: "prod_fixPackTrusted" } }] },
  }), {
    trustedPaymentLinkIds: new Set(),
    trustedProductIds: new Set(["prod_fixPackTrusted"]),
  }), true);

  assert.equal(await sessionEntitlesFixPack(paidSession({ payment_link: "plink_legacyHuman" }), {
    trustedPaymentLinkIds: new Set(),
    resolveBuyUrl: async (id) => {
      assert.equal(id, "plink_legacyHuman");
      return FIXPACK_HUMAN_BUY_URL;
    },
  }), true);

  assert.equal(await sessionEntitlesFixPack(paidSession({ payment_link: "plink_mcpInstant" }), {
    trustedPaymentLinkIds: new Set(),
    resolveBuyUrl: async () => FIXPACK_MCP_BUY_URL,
  }), true);
});

test("validateFixPackLicense uses checkout.sessions.retrieve on the real export path", async () => {
  const sessions = {
    cs_test_ok: paidSession({ id: "cs_test_ok" }),
    cs_test_unpaid: paidSession({ id: "cs_test_unpaid", payment_status: "unpaid" }),
    cs_test_foreign: paidSession({ id: "cs_test_foreign", payment_link: FOREIGN_PLINK }),
  };
  const stripeClient = fakeStripe(sessions, {
    [TRUSTED_PLINK]: { url: FIXPACK_MCP_BUY_URL },
    [FOREIGN_PLINK]: { url: "https://buy.stripe.com/otherOffer" },
  });

  assert.equal(await validateFixPackLicense("cs_test_ok", {
    stripeClient,
    configured: () => true,
    trustedPaymentLinkIds: new Set([TRUSTED_PLINK]),
  }), true);
  assert.equal(await validateFixPackLicense("cs_test_unpaid", {
    stripeClient,
    configured: () => true,
    trustedPaymentLinkIds: new Set([TRUSTED_PLINK]),
  }), false);
  assert.equal(await validateFixPackLicense("cs_test_foreign", {
    stripeClient,
    configured: () => true,
    trustedPaymentLinkIds: new Set([TRUSTED_PLINK]),
  }), false);
  assert.equal(await validateFixPackLicense("not_a_session", {
    stripeClient,
    configured: () => true,
    trustedPaymentLinkIds: new Set([TRUSTED_PLINK]),
  }), false);
  assert.equal(paymentLinkIdFromSession(sessions.cs_test_ok), TRUSTED_PLINK);
});

test("starter artifact is narrower than the complete paid pack", async () => {
  const starter = await generateStarterFixPack("https://example.com");
  const complete = await generateCompleteFixPack("https://example.com");
  assert.equal(starterContainsOnlyAdvertisedSections(starter), true);
  assert.equal(completeContainsFullSections(complete), true);
  assert.equal(starter.includes('"@type": "FAQPage"'), false);
  assert.equal(complete.includes('"@type": "FAQPage"'), true);
  assert.equal(starter.includes("## 4. sitemap.xml"), false);
  assert.equal(complete.includes("## 4. sitemap.xml"), true);
});

test("MCP route denies invalid or foreign licenses and returns only the free starter", async () => {
  fixPackLicenseDeps.isConfigured = () => true;
  fixPackLicenseDeps.getStripe = () => fakeStripe({
    cs_test_foreign: paidSession({ id: "cs_test_foreign", payment_link: FOREIGN_PLINK, amount_total: 9900 }),
    cs_test_unpaid: paidSession({ id: "cs_test_unpaid", payment_status: "unpaid" }),
  }, {
    [FOREIGN_PLINK]: { url: "https://buy.stripe.com/otherOffer" },
  });

  const missing = await callFixPack({});
  assert.equal(missing.response.status, 200);
  assert.equal(missing.json.result.isError, true);
  assert.match(missing.text, /No license provided/);
  assert.equal(starterContainsOnlyAdvertisedSections(missing.text), true);
  assert.equal(missing.text.includes("FAQPage"), false);

  const foreign = await callFixPack({ license: "cs_test_foreign" });
  assert.equal(foreign.json.result.isError, true);
  assert.match(foreign.text, /couldn't be verified as a paid Fix Pack/);
  assert.equal(starterContainsOnlyAdvertisedSections(foreign.text), true);

  const unpaid = await callFixPack({ license: "cs_test_unpaid" });
  assert.equal(unpaid.json.result.isError, true);
  assert.equal(starterContainsOnlyAdvertisedSections(unpaid.text), true);
});

test("MCP route grants the complete pack for a legitimate trusted Fix Pack license", async () => {
  fixPackLicenseDeps.isConfigured = () => true;
  fixPackLicenseDeps.getStripe = () => fakeStripe({
    cs_test_ok: paidSession({ id: "cs_test_ok" }),
  }, {
    [TRUSTED_PLINK]: { url: FIXPACK_MCP_BUY_URL },
  });

  const paid = await callFixPack({ license: "cs_test_ok" });
  assert.equal(paid.response.status, 200);
  assert.equal(paid.json.result.isError, undefined);
  assert.match(paid.text, /Verified\. Your complete AI-Readiness Fix Pack/);
  assert.equal(completeContainsFullSections(paid.text), true);
});

test("MCP route still lists free readiness and TaskMarket tools", async () => {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const json = await response.json();
  const names = json.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, [
    "check_ai_readiness",
    "generate_complete_fix_pack",
    "plan_taskmarket_delegation",
    "browse_taskmarket_tasks",
    "track_taskmarket_task",
  ]);
});
