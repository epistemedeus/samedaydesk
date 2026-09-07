import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CIRCLE_USDC_BASE,
  RUNTIMES,
  ROOT,
  STATES,
  assertUnpaidRequest,
  collectStrings,
  contractFrom402,
  evmAddr,
  fetchWithTimeout,
  listRuntimeDirs,
  loadCatalog,
  loadRuntime,
  mcpTools,
  parse402Usd,
  pickPayableAccept,
} from "./lib.mjs";

const catalog = loadCatalog();
const runtimes = Object.fromEntries(RUNTIMES.map((name) => [name, loadRuntime(name)]));
const skipLive = process.env.SKIP_LIVE_BUYER_REPLAY === "1";

function pin() {
  return catalog.contract;
}

test("fixture layout is the two selected runtimes and five states each", () => {
  assert.deepEqual(listRuntimeDirs().sort(), [...RUNTIMES].sort());
  for (const name of RUNTIMES) {
    const runtime = runtimes[name];
    assert.deepEqual(Object.keys(runtime.states).sort(), [...STATES].sort());
    for (const state of STATES) {
      assert.equal(runtime.states[state].state, state, `${name} ${state}`);
    }
    assert.ok(runtime.sources.citations.length >= 5, `${name} source citations`);
    for (const citation of runtime.sources.citations) {
      assert.ok(citation.file, `${name} citation missing file`);
      assert.ok(citation.lines, `${name} ${citation.file} missing lines`);
      assert.ok(STATES.includes(citation.state) || citation.state === "discover", citation.file);
    }
  }
});

test("unpaid construct requests never carry a payment header or key", () => {
  for (const name of RUNTIMES) {
    const construct = runtimes[name].states.construct;
    assertUnpaidRequest(construct.request, assert);
    for (const header of construct.forbiddenHeaders) {
      assert.match(header, /PAYMENT-SIGNATURE|X-PAYMENT|Authorization/);
    }
    const stop = runtimes[name].states.stop;
    assert.equal(stop.reason, "no wallet");
    assert.match(stop.recorded, /no PAYMENT-SIGNATURE/i);
  }
});

test("Mcp.tsx extract price matches the committed catalog pin", () => {
  const tools = mcpTools();
  assert.equal(tools.length, 22);
  const extract = tools.find((tool) => tool.name === "extract");
  assert.ok(extract, "extract missing from Mcp.tsx");
  assert.equal(extract.price, Number(catalog.route.mcpPriceUsd));
  assert.equal(extract.price, pin().priceUsd);
  assert.equal(catalog.route.product, "extract");
  assert.equal(catalog.route.path, "/extract");
  assert.equal(catalog.route.method, "GET");
});

test("both runtimes pin the same payTo, network, price, and output schema", () => {
  const expected = pin();
  for (const name of RUNTIMES) {
    const contract = runtimes[name].states.contract.mustReceive;
    const ready = runtimes[name].states["authorize-ready"];
    assert.equal(contract.scheme, expected.scheme, name);
    assert.equal(contract.network, expected.network, name);
    assert.equal(evmAddr(contract.payTo), evmAddr(expected.payTo), name);
    assert.equal(evmAddr(contract.asset), evmAddr(expected.asset), name);
    assert.equal(contract.amount, expected.amount, name);
    assert.equal(contract.maxAmountRequired, expected.maxAmountRequired, name);
    assert.equal(contract.extra.name, expected.extra.name, name);
    assert.equal(contract.extra.version, expected.extra.version, name);
    assert.deepEqual(contract.bazaarOutputSchema.guaranteedPaths, expected.outputGuaranteedPaths);
    assert.equal(ready.consistency.atomicUsd, expected.priceUsd, name);
    assert.equal(ready.consistency.amountEqualsMaxAmountRequired, true, name);
  }
});

test("Agent402 parse402Usd and pickPayableAccept accept the pinned challenge", () => {
  const expected = pin();
  const body = {
    accepts: [
      {
        scheme: expected.scheme,
        network: expected.network,
        payTo: expected.payTo,
        asset: expected.asset,
        amount: expected.amount,
        maxAmountRequired: expected.maxAmountRequired,
        extra: expected.extra,
      },
    ],
  };
  assert.equal(parse402Usd(body), expected.priceUsd);
  const picked = pickPayableAccept(body.accepts);
  assert.ok(picked);
  assert.equal(picked.scheme, "exact");
  assert.equal(evmAddr(picked.asset), evmAddr(CIRCLE_USDC_BASE));
  assert.equal(pickPayableAccept([{ ...body.accepts[0], network: "eip155:1" }]), null);
  assert.equal(pickPayableAccept([{ ...body.accepts[0], scheme: "upto" }]), null);
});

test("authorize-ready fields are present and consistent across discovery surfaces", () => {
  const expected = pin();
  const agent = runtimes.agent402;
  const indexPayTo = agent.states.discover.surfaces[0].observed.payToByNetwork["eip155:8453"];
  const routerPayTo = agent.states.discover.surfaces[1].observed.firstResult.bazaarPayTos[0];
  assert.equal(evmAddr(indexPayTo), evmAddr(expected.payTo));
  assert.equal(evmAddr(routerPayTo), evmAddr(expected.payTo));
  assert.equal(agent.states.discover.surfaces[0].observed.extract.price, expected.priceUsd);
  assert.equal(agent.states.discover.surfaces[1].observed.firstResult.priceUsd, expected.priceUsd);
  assert.deepEqual(
    agent.states.discover.surfaces[0].observed.extract.responseContract.guaranteedPaths,
    expected.outputGuaranteedPaths,
  );

  const coinbase = runtimes["coinbase-x402"];
  const bazaar = coinbase.states.discover.surfaces[0].observed.accepts0;
  const wellKnown = coinbase.states.discover.surfaces[1].observed.accepts0;
  const openapi = coinbase.states.discover.surfaces[2].observed;
  assert.equal(evmAddr(bazaar.payTo), evmAddr(expected.payTo));
  assert.equal(bazaar.network, expected.network);
  assert.equal(bazaar.amount, expected.amount);
  assert.equal(evmAddr(wellKnown.payTo), evmAddr(expected.payTo));
  assert.equal(wellKnown.amount, expected.amount);
  assert.equal(openapi.price.amount, catalog.route.mcpPriceUsd);
  assert.equal(openapi.x402.network, expected.network);
  assert.equal(evmAddr(openapi.x402.asset), evmAddr(expected.asset));
  assert.deepEqual(coinbase.states.discover.surfaces[0].observed.bazaarOutputRequired, [
    "ok",
    "url",
    "title",
  ]);
});

test("stop states list a paid continuation and refuse to execute it", () => {
  for (const name of RUNTIMES) {
    const stop = runtimes[name].states.stop;
    assert.ok(stop.paidContinuationWouldNeed.length >= 4, name);
    assert.ok(stop.mustNotRun.length >= 2, name);
    const blob = collectStrings(stop.mustNotRun).join("\n");
    assert.match(blob, /PAYMENT-SIGNATURE|retry|settle/i);
  }
  const fixturesText = collectStrings({
    agent402: runtimes.agent402.states,
    coinbase: runtimes["coinbase-x402"].states,
  }).join("\n");
  assert.doesNotMatch(fixturesText, /"PAYMENT-SIGNATURE"\s*:/);
  assert.doesNotMatch(fixturesText, /-----BEGIN .*PRIVATE KEY-----/);
});

test("apex server source still does not host the paid extract route", () => {
  const index = readFileSync(join(ROOT, "server/index.js"), "utf8");
  assert.equal(index.includes("paymentMiddleware"), false);
  const pricing = readFileSync(join(ROOT, "server/pricing.js"), "utf8");
  assert.match(pricing, /machine_payment_route:\s*\{\s*amount:\s*49900/);
});

async function liveUnpaidExtract() {
  const url = catalog.route.exampleUrl;
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  assert.equal(response.status, 402, `expected 402 from ${url}, got ${response.status}`);
  assert.ok(response.headers.get("payment-required"), "missing PAYMENT-REQUIRED");
  const body = await response.json();
  return { response, body };
}

test(
  "live unpaid GET /extract matches the fixture payTo, network, price, and schema",
  { skip: skipLive ? "SKIP_LIVE_BUYER_REPLAY=1" : false },
  async () => {
    const expected = pin();
    const { body } = await liveUnpaidExtract();
    const observed = contractFrom402(body);
    assert.equal(observed.x402Version, expected.x402Version);
    assert.equal(observed.scheme, expected.scheme);
    assert.equal(observed.network, expected.network);
    assert.equal(evmAddr(observed.payTo), evmAddr(expected.payTo));
    assert.equal(evmAddr(observed.asset), evmAddr(expected.asset));
    assert.equal(observed.amount, expected.amount);
    assert.equal(observed.maxAmountRequired, expected.maxAmountRequired);
    assert.equal(observed.extraName, expected.extra.name);
    assert.equal(observed.extraVersion, expected.extra.version);
    assert.equal(observed.serviceName, expected.serviceName);
    assert.match(observed.resourceUrl, /\/extract/);
    assert.equal(parse402Usd(body), expected.priceUsd);
    for (const path of expected.outputGuaranteedPaths) {
      assert.ok(observed.guaranteedPaths.includes(path) || observed.exampleKeys.includes(path), path);
    }
  },
);

test(
  "live Agent402 verified index still advertises the same extract pin",
  { skip: skipLive ? "SKIP_LIVE_BUYER_REPLAY=1" : false },
  async () => {
    const expected = pin();
    const url = runtimes.agent402.states.discover.surfaces[0].request.url;
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
    assert.equal(response.status, 200, url);
    const body = await response.json();
    assert.equal(body.origin, catalog.route.origin);
    assert.equal(evmAddr(body.payToByNetwork["eip155:8453"]), evmAddr(expected.payTo));
    const extract = (body.tools || []).find((tool) => tool.route === "/extract");
    assert.ok(extract, "extract missing from Agent402 index");
    assert.equal(extract.price, expected.priceUsd);
    assert.deepEqual(extract.responseContract.guaranteedPaths, expected.outputGuaranteedPaths);
    assert.ok(body.networks.includes(expected.network));
  },
);

test(
  "live Bazaar search and well-known manifest still advertise the same extract pin",
  { skip: skipLive ? "SKIP_LIVE_BUYER_REPLAY=1" : false },
  async () => {
    const expected = pin();
    const bazaarUrl = runtimes["coinbase-x402"].states.discover.surfaces[0].request.url;
    const bazaarRes = await fetchWithTimeout(bazaarUrl, { headers: { Accept: "application/json" } });
    assert.equal(bazaarRes.status, 200, bazaarUrl);
    const bazaar = await bazaarRes.json();
    const row = (bazaar.resources || []).find((item) =>
      String(item.resource || "").includes("/extract"),
    );
    assert.ok(row, "Bazaar search returned no extract resource");
    const accept = pickPayableAccept(row.accepts);
    assert.ok(accept, "Bazaar extract row has no payable accept");
    assert.equal(evmAddr(accept.payTo), evmAddr(expected.payTo));
    assert.equal(accept.network, expected.network);
    assert.equal(accept.amount, expected.amount);
    const required =
      row.extensions?.bazaar?.schema?.properties?.output?.properties?.example?.required;
    if (required) {
      for (const path of expected.outputGuaranteedPaths) {
        assert.ok(required.includes(path), path);
      }
    }

    const wellKnownUrl = runtimes["coinbase-x402"].states.discover.surfaces[1].request.url;
    const wkRes = await fetchWithTimeout(wellKnownUrl, { headers: { Accept: "application/json" } });
    assert.equal(wkRes.status, 200, wellKnownUrl);
    const wk = await wkRes.json();
    const item = (wk.items || []).find((entry) => entry.resource?.routeTemplate === "/extract");
    assert.ok(item, "well-known x402 missing /extract");
    const wkAccept = pickPayableAccept(item.accepts);
    assert.ok(wkAccept);
    assert.equal(evmAddr(wkAccept.payTo), evmAddr(expected.payTo));
    assert.equal(wkAccept.amount, expected.amount);
    assert.equal(wkAccept.extra?.name, expected.extra.name);
  },
);
