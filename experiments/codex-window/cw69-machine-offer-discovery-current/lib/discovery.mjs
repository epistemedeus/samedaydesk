import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nameLinkedChain } from "./chain.mjs";
import {
  DISCOVERY_SCHEMA,
  FIXTURE_PRICE_USDC,
  LOCAL_ACQUISITION,
  LOCAL_METHOD,
  PUBLISHED_ROUTE_ATOMIC,
  PUBLISHED_ROUTE_PRICE_USDC,
} from "./constants.mjs";
import { inspectLockfileOffer } from "./inspect.mjs";
import { merchantExampleIsNotExecution } from "./samples.mjs";
import { refuse } from "./refuse.mjs";

export function buildDiscovery(options = {}) {
  const inspected = inspectLockfileOffer(options);
  const { identity, listed, resolved, paths } = inspected;
  let illustrative = { present: false, authority: false };
  try {
    const challenge = JSON.parse(readFileSync(join(paths.remoteEvidence, "lockfile-challenge.json"), "utf8"));
    illustrative = merchantExampleIsNotExecution(challenge);
  } catch {
    illustrative = { present: false, authority: false };
  }

  const discovery = {
    schema: DISCOVERY_SCHEMA,
    jobId: identity.jobId,
    identity,
    identityFingerprint: inspected.identityFingerprint,
    chain: nameLinkedChain(identity, identity.merchant),
    acquisitions: {
      offlineLocalRun: {
        kind: LOCAL_ACQUISITION,
        method: LOCAL_METHOD,
        supported: true,
        sold: false,
        purchaseAuthority: false,
        cli: identity.runtime.cliPath,
        requiredInputs: identity.runtime.requiredInputs,
        outputs: identity.runtime.outputs,
      },
      freeKit: {
        kind: "free-archive",
        version: identity.publicArchive.version,
        sha256: identity.publicArchive.sha256,
        bytes: identity.publicArchive.bytes,
        purchaseAuthority: false,
        note: "Public free archive/catalog is 1.4.1 on this checkout. Not hosted execution.",
      },
      publishedPaidHttp: {
        kind: "hosted-evidence",
        method: "POST",
        getSupported: false,
        protocols: identity.merchant.protocols,
        mppOnThisRoute: identity.merchant.mppOnThisRoute,
        priceUsdc: identity.merchant.publishedPriceUsdc || PUBLISHED_ROUTE_PRICE_USDC,
        amountAtomic: identity.merchant.challengeAmountAtomic || PUBLISHED_ROUTE_ATOMIC,
        captureStatus: identity.merchant.captureStatus,
        paid: false,
        executed: false,
        adapterSupportsThisAcquisition: false,
      },
      localFixturePrice: {
        kind: "unpublished",
        valueUsdc: FIXTURE_PRICE_USDC,
        live: false,
        note: "Local wrapper fixture price is 0.02 and non-live. Not a measured cost floor.",
      },
      costFloor: "unknown",
      monetaryMargin: "unknown",
    },
    methodPolicy: {
      adapterMethods: [LOCAL_METHOD],
      publishedRouteMethods: ["POST"],
      getOnPostOnlyRoute: "refuse",
      paidHttpToOfflineAdapter: "refuse",
      engineRootOverride: "refuse",
      unknownAcquisition: "refuse",
    },
    resolvedJob: {
      id: resolved.id,
      requiredInputs: [...(resolved.requiredInputs || [])],
      optionalInputs: [...(resolved.optionalInputs || [])],
      outputs: [...(resolved.outputs || [])],
      m01: resolved.m01 === true,
    },
    runtimeList: {
      firstOffer: listed.body?.firstOffer || null,
      jobs: listed.body?.jobs || [],
      liveSettlement: listed.body?.liveSettlement || "out-of-scope",
    },
    samplePolicy: {
      knownCopiedSamples: "refuse-as-caller-or-sale",
      explicitExample: "refuse-as-caller-or-sale",
      sampleMetadata: "refuse-as-caller-or-sale",
      illustrativeChargedOutput: "not-execution",
    },
    illustrativePaidOutput: illustrative,
    volatile: {
      generatedAt: new Date().toISOString(),
      node: process.version,
    },
    purchaseAuthority: false,
    sold: false,
  };
  return { discovery, inspected };
}

export function writeDiscovery(discovery, outPath) {
  if (!outPath) throw refuse("missing-out", "--out is required for discover");
  writeFileSync(outPath, `${JSON.stringify(discovery, null, 2)}\n`);
  return outPath;
}
