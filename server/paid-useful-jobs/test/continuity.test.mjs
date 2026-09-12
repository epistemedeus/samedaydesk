import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyIndexingContinuityPatches,
  applyIndexingPayloadContinuity,
  buildDeclaredIndexing,
  canonicalResourceUrlFromOriginAndPath,
  getLastIndexingContinuityDiagnostic,
  isExactEvmV2IndexingContinuitySupported,
  planIndexingPayloadContinuity,
  registerIndexingPayloadContinuity,
  resolveDeclaredResourceUrl,
} from "../lib/continuity.mjs";
import {
  attachContinuity,
  createLocalNonSettlingResourceServer,
  declaredRouteMetadata,
} from "../lib/envelope.mjs";

const DECLARED_RESOURCE = {
  url: "https://samedaydesk.com/paid-useful-jobs/vendor-budget-impact",
  description: "fixture",
  mimeType: "application/json",
  serviceName: "SameDayDesk",
  tags: ["fixture"],
};

const DECLARED_BAZAAR = {
  info: { input: { type: "http", method: "POST" } },
  schema: { type: "object" },
};

const REQUIREMENTS = {
  scheme: "exact",
  network: "eip155:8453",
  amount: "20000",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0x0000000000000000000000000000000000000F08",
  maxTimeoutSeconds: 300,
};

function basePayload(overrides = {}) {
  return {
    x402Version: 2,
    accepted: structuredClone(REQUIREMENTS),
    payload: {
      authorization: { from: "0xabc", to: "0xdef", value: "20000", nonce: "0x1", validAfter: "1", validBefore: "9" },
      signature: "0xsig",
    },
    resource: structuredClone(DECLARED_RESOURCE),
    extensions: {
      bazaar: structuredClone(DECLARED_BAZAAR),
      unrelated: { keep: true },
      "payment-identifier": { id: "pid" },
    },
    ...overrides,
  };
}

function authorityFingerprint(payload) {
  return JSON.stringify({
    payload: payload.payload,
    accepted: payload.accepted,
    unrelated: payload.extensions?.unrelated,
    paymentIdentifier: payload.extensions?.["payment-identifier"],
  });
}

describe("indexing continuity (merchant PR54 hook pattern)", () => {
  it("accepts v2 exact eip155 only", () => {
    assert.equal(isExactEvmV2IndexingContinuitySupported(basePayload(), REQUIREMENTS), true);
    assert.equal(isExactEvmV2IndexingContinuitySupported({ ...basePayload(), x402Version: 1 }, REQUIREMENTS), false);
    assert.equal(
      isExactEvmV2IndexingContinuitySupported(basePayload(), { ...REQUIREMENTS, scheme: "upto" }),
      false,
    );
    assert.equal(
      isExactEvmV2IndexingContinuitySupported(basePayload(), { ...REQUIREMENTS, network: "solana:mainnet" }),
      false,
    );
  });

  it("uses public origin + path and ignores Host", () => {
    assert.equal(
      canonicalResourceUrlFromOriginAndPath("https://samedaydesk.com", "/paid-useful-jobs/vendor-budget-impact"),
      "https://samedaydesk.com/paid-useful-jobs/vendor-budget-impact",
    );
    const poisoned = {
      request: {
        adapter: {
          getPath: () => "/paid-useful-jobs/vendor-budget-impact",
          getUrl: () => "https://evil.example/paid-useful-jobs/vendor-budget-impact",
        },
      },
    };
    assert.equal(
      resolveDeclaredResourceUrl(poisoned, { publicOrigin: "https://samedaydesk.com" }),
      "https://samedaydesk.com/paid-useful-jobs/vendor-budget-impact",
    );
  });

  it("plans atomic fills for omitted resource and bazaar without mutating until apply", () => {
    const payload = basePayload();
    delete payload.resource;
    delete payload.extensions.bazaar;
    const before = authorityFingerprint(payload);
    const planned = planIndexingPayloadContinuity(payload, {
      resource: DECLARED_RESOURCE,
      extensions: { bazaar: DECLARED_BAZAAR },
    });
    assert.equal(planned.provenance.resource, "filled");
    assert.equal(planned.provenance.bazaar, "filled");
    assert.equal(planned.provenance.declinedPayment, false);
    assert.equal(payload.resource, undefined);
    assert.equal(authorityFingerprint(payload), before);
    applyIndexingContinuityPatches(payload, planned.patches);
    assert.equal(payload.resource.url, DECLARED_RESOURCE.url);
    assert.deepEqual(payload.extensions.bazaar, DECLARED_BAZAAR);
    assert.equal(payload.extensions.unrelated.keep, true);
    assert.equal(payload.payload.signature, "0xsig");
  });

  it("retains wrong-typed resource/bazaar without declining", () => {
    const payload = basePayload({ resource: "https://samedaydesk.com/paid-useful-jobs/vendor-budget-impact" });
    payload.extensions.bazaar = "not-an-object";
    const planned = planIndexingPayloadContinuity(payload, {
      resource: DECLARED_RESOURCE,
      extensions: { bazaar: DECLARED_BAZAAR },
    });
    assert.deepEqual(planned.patches, {});
    assert.equal(planned.provenance.resource, "present_wrong_type_retained");
    assert.equal(planned.provenance.bazaar, "present_wrong_type_retained");
    assert.equal(planned.provenance.declinedPayment, false);
  });

  it("skips v1 without mutation", () => {
    const payload = basePayload({ x402Version: 1 });
    delete payload.resource;
    const before = JSON.stringify(payload);
    const result = applyIndexingPayloadContinuity(payload, { resource: DECLARED_RESOURCE }, REQUIREMENTS);
    assert.equal(result.skipped, true);
    assert.equal(JSON.stringify(payload), before);
  });

  it("registers onBeforeVerify/onBeforeSettle and does not reassign verify/settle", async () => {
    const hooks = { beforeVerify: [], beforeSettle: [] };
    const fakeServer = {
      verifyPayment: async () => ({ isValid: true }),
      settlePayment: async () => ({ success: true }),
      onBeforeVerify(hook) {
        hooks.beforeVerify.push(hook);
        return this;
      },
      onBeforeSettle(hook) {
        hooks.beforeSettle.push(hook);
        return this;
      },
    };
    const originalVerify = fakeServer.verifyPayment;
    const originalSettle = fakeServer.settlePayment;
    registerIndexingPayloadContinuity(fakeServer, {
      resolveDeclaredResource: () => DECLARED_RESOURCE,
    });
    assert.equal(fakeServer.verifyPayment, originalVerify);
    assert.equal(fakeServer.settlePayment, originalSettle);

    const payload = basePayload();
    delete payload.resource;
    delete payload.extensions.bazaar;
    const context = {
      paymentPayload: payload,
      requirements: REQUIREMENTS,
      declaredExtensions: { bazaar: DECLARED_BAZAAR },
      transportContext: {
        request: {
          adapter: {
            getPath: () => "/paid-useful-jobs/vendor-budget-impact",
            getUrl: () => "https://evil.example/poison",
          },
        },
      },
    };
    await hooks.beforeVerify[0](context);
    await hooks.beforeSettle[0](context);
    assert.equal(payload.resource.url, DECLARED_RESOURCE.url);
    assert.equal(payload.payload.signature, "0xsig");
    assert.equal(getLastIndexingContinuityDiagnostic().provenance.declinedPayment, false);
  });

  it("local envelope never live-settles", async () => {
    const server = attachContinuity(createLocalNonSettlingResourceServer(), {
      jobId: "vendor-budget-impact",
    });
    await assert.rejects(() => server.settlePayment({}), /out of scope/);
    const declared = declaredRouteMetadata("vendor-budget-impact");
    assert.equal(declared.live, false);
    assert.equal(declared.publishedToLiveCatalog, false);
    assert.match(declared.resource.url, /samedaydesk.com\/paid-useful-jobs\/vendor-budget-impact/);
  });

  it("buildDeclaredIndexing uses resolver only", () => {
    const declared = buildDeclaredIndexing(
      { request: { adapter: { getUrl: () => "https://evil.example/r", getPath: () => "/r" } } },
      { bazaar: DECLARED_BAZAAR },
      () => ({ url: "https://samedaydesk.com/paid-useful-jobs/r" }),
    );
    assert.equal(declared.resource.url, "https://samedaydesk.com/paid-useful-jobs/r");
  });
});
