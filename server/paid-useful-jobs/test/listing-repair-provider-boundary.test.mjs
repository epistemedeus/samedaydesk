import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  declaredProvider,
  isCaptureIncomplete,
  isUnsupportedProvider,
  mapListingRepairStatus,
} from "../release/apps/listing-repair-packet/listing-repair-boundary.mjs";

function listingInput({ provider = "grexal", kind = "change" } = {}) {
  const identity = {
    provider,
    jobRef: "boundary-job",
    sharedEvidenceId: "boundary-job",
    sourceTag: "catalog",
  };
  const home = { path: "/", url: "https://example.test/", status: 200, accessibility: "ok", title: "Home" };
  const docs = { path: "/docs", url: "https://example.test/docs", status: 200, accessibility: "ok", title: "Docs" };
  const blog = { path: "/old-blog", url: "https://example.test/old-blog", status: 200, accessibility: "ok", title: "Old Blog" };
  const pricing = { path: "/pricing", url: "https://example.test/pricing", status: 200, accessibility: "ok", title: "Pricing" };
  const completeBaseline = [home, docs, blog, pricing];
  let current;
  if (kind === "partial") {
    current = {
      label: "current-partial",
      capturedAt: "2026-09-12T00:00:00.000Z",
      captureIncomplete: true,
      partialCoverage: true,
      coverageComplete: false,
      routes: [home, docs],
    };
  } else {
    current = {
      label: "current-complete",
      capturedAt: "2026-09-12T00:00:00.000Z",
      captureIncomplete: false,
      coverageComplete: true,
      routes: [
        home,
        {
          path: "/docs",
          url: "https://example.test/docs",
          status: 301,
          finalUrl: "https://example.test/documentation",
          accessibility: "ok",
          title: "Docs Redirect",
        },
      ],
    };
  }
  const discovery = {
    captureStatus: "ok",
    catalogComplete: kind !== "partial",
    listing: {
      url: "https://example.test/listing",
      agentId: "boundary-agent",
      listingStatus: "PUBLIC_ACTIVE",
      freeVsPriced: "discovery_free_run_priced",
    },
  };
  if (kind === "mismatch") {
    discovery.identity = {
      provider: "agensi",
      jobRef: "agensi-ops-1",
      sharedEvidenceId: "agensi-ops-1",
      sourceTag: "agensi",
    };
  }
  return {
    schema: "pilot.s185.distribution_repair_input.v1",
    identity,
    discovery,
    record: {
      routeRegressionInput: {
        schema: "x402.r2.record.route_regression_input.v1",
        baseline: { label: "baseline", capturedAt: "2026-09-01T00:00:00.000Z", routes: completeBaseline },
        current,
      },
    },
  };
}

describe("listing-repair provider-neutral boundary", () => {
  it("treats grexal and agensi incomplete capture as partial", () => {
    for (const provider of ["grexal", "agensi"]) {
      const input = listingInput({ provider, kind: "partial" });
      assert.equal(isCaptureIncomplete(input), true);
      const mapped = mapListingRepairStatus({
        underlying: { status: "partial", ok: true },
        input,
      });
      assert.equal(mapped.status, "partial", provider);
      assert.equal(mapped.code, "incomplete-capture");
    }
  });

  it("does not promote unknown provider + incomplete capture to actionable", () => {
    const input = listingInput({ provider: "d15cold", kind: "partial" });
    input.identity.provider = "d15cold";
    assert.equal(declaredProvider(input), "d15cold");
    assert.equal(isUnsupportedProvider("d15cold"), true);
    const mapped = mapListingRepairStatus({
      underlying: { status: "unknown", ok: true },
      input,
    });
    assert.equal(mapped.status, "partial");
    assert.notEqual(mapped.status, "actionable");
    assert.equal(mapped.code, "incomplete-capture");
  });

  it("keeps supported complete diagnosed captures actionable", () => {
    for (const provider of ["grexal", "agensi"]) {
      const mapped = mapListingRepairStatus({
        underlying: { status: "diagnosed", ok: true },
        input: listingInput({ provider, kind: "change" }),
      });
      assert.equal(mapped.status, "actionable", provider);
      assert.equal(mapped.refused, false);
    }
  });

  it("refuses a complete capture with an unsupported declared provider", () => {
    const mapped = mapListingRepairStatus({
      underlying: { status: "diagnosed", ok: true },
      input: listingInput({ provider: "d15cold", kind: "change" }),
    });
    assert.equal(mapped.status, "refused");
    assert.equal(mapped.code, "unsupported-provider");
    assert.match(mapped.reason, /unsupported|grexal\|agensi/i);
  });

  it("refuses grexal vs agensi identity mismatch on complete capture", () => {
    const mapped = mapListingRepairStatus({
      underlying: { status: "mismatch", ok: false },
      input: listingInput({ provider: "grexal", kind: "mismatch" }),
    });
    assert.equal(mapped.status, "refused");
    assert.equal(mapped.code, "mismatch");
  });

  it("maps missing provider + engine unknown to partial, ignoring ok:true", () => {
    const input = listingInput({ provider: "grexal", kind: "change" });
    delete input.identity.provider;
    const mapped = mapListingRepairStatus({
      underlying: { status: "unknown", ok: true },
      input,
    });
    assert.equal(declaredProvider(input), null);
    assert.equal(isUnsupportedProvider(null), false);
    assert.equal(mapped.status, "partial");
    assert.notEqual(mapped.status, "actionable");
    assert.equal(mapped.code, "unknown");
  });

  it("does not treat engine ok:true as actionable without diagnosed", () => {
    const mapped = mapListingRepairStatus({
      underlying: { status: "unknown", ok: true },
      input: listingInput({ provider: "grexal", kind: "change" }),
    });
    assert.equal(mapped.status, "partial");
  });
});
