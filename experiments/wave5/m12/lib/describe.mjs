import { FIRST_JOURNEY_JOB, OFFER_ID, OFFER_SCHEMA } from "./schema.mjs";

function jobRecord(job, outcomesById) {
  const outcome = outcomesById.get(job.id);
  return {
    id: job.id,
    title: job.title,
    summary: job.summary,
    requiredInputs: [...job.requiredInputs],
    optionalInputs: [...(job.optionalInputs || [])],
    outputs: [...job.outputs],
    exampleFlag: job.exampleFlag || "--example",
    notes: job.notes || "",
    outcome: outcome?.outcome || null,
    sampleAvailable: job.sampleAvailable === true,
    freeSample: job.freeSample === true,
  };
}

function selectedJobIds(sources) {
  if (sources.m01.status === "bound" && Array.isArray(sources.m01.doc.jobIds) && sources.m01.doc.jobIds.length) {
    return { jobIds: sources.m01.doc.jobIds.map(String), selectionSource: "m01" };
  }
  return {
    jobIds: sources.catalog.jobs.map((j) => j.id),
    selectionSource: "sds52-catalog",
  };
}

export function describeSelectedOffer(sources) {
  const { wrapper, catalog, outcomes, discovery } = sources;
  const outcomesById = new Map((outcomes.jobs || []).map((j) => [j.id, j]));
  const catalogById = new Map(catalog.jobs.map((j) => [j.id, j]));
  const { jobIds, selectionSource } = selectedJobIds(sources);
  const jobsById = {};
  for (const id of jobIds) {
    const job = catalogById.get(id);
    if (!job) continue;
    jobsById[id] = jobRecord(job, outcomesById);
  }
  const firstJourneyJob = jobIds.includes(FIRST_JOURNEY_JOB) ? FIRST_JOURNEY_JOB : jobIds[0] || null;

  const extractLive = {
    productId: "extract",
    kind: "live-published",
    amountUsdc: String(wrapper.LIVE_EXTRACT_PRICE_USDC),
    payTo: wrapper.LIVE_PAY_TO,
    publishedToLiveCatalog: true,
    belongsToSelectedOffer: false,
    mcpName: "extract",
  };
  const siaLive = {
    productId: "seller-integrity-audit",
    kind: "live-published",
    amountUsdc: String(wrapper.LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC),
    payTo: wrapper.LIVE_PAY_TO,
    publishedToLiveCatalog: true,
    belongsToSelectedOffer: false,
    mcpName: "seller_integrity_audit",
    openapiPath: "/commerce/seller-integrity-audit",
  };

  const d26 = sources.d26;
  let proposed;
  if (d26.status === "bound") {
    proposed = {
      productId: "wave5-proposed",
      kind: "proposed-cost-backed",
      status: "measured",
      belongsToSelectedOffer: true,
      publishedToLiveCatalog: false,
      amountUsdc: String(d26.doc.proposedPriceUsdc),
      variableCostUsdc: String(d26.doc.variableCostUsdc),
      paymentFeesUsdc: String(d26.doc.paymentFeesUsdc),
      nonLossmaking: d26.doc.nonLossmaking === true,
      sourcePath: d26.path,
    };
  } else {
    proposed = {
      productId: "wave5-proposed",
      kind: "proposed-cost-backed",
      status: d26.status,
      belongsToSelectedOffer: true,
      publishedToLiveCatalog: false,
      amountUsdc: null,
      sourcePath: d26.path,
      note: "No cost-backed price is advertised until W5-D26 publishes a measured floor.",
    };
  }

  return {
    schema: OFFER_SCHEMA,
    offerId: sources.m01.status === "bound" && sources.m01.doc.offerId ? sources.m01.doc.offerId : OFFER_ID,
    title: "SameDayDesk supplied-input useful jobs",
    summary:
      "Caller-supplied files through the SDS52 local wrapper and the published useful-jobs 1.0.0 engines. Not a live catalog sale. SAMPLE/--example is not a paid sale.",
    selectionSource,
    firstJourneyJob,
    jobIds,
    jobsById,
    prices: {
      selected: [
        {
          productId: "useful-jobs-offline",
          kind: "free-offline",
          amountUsdc: "0",
          belongsToSelectedOffer: true,
          publishedToLiveCatalog: false,
          purchaseAuthority: discovery.purchaseAuthority === true,
          paidHostedClaim: discovery.paidHostedClaim === true,
          liveSettlement: "out-of-scope",
        },
        {
          productId: "paid-useful-jobs-wrapper-fixture",
          kind: "fixture-labelled",
          amountUsdc: String(wrapper.FIXTURE_PRICE_USDC),
          live: false,
          publishedToLiveCatalog: false,
          belongsToSelectedOffer: true,
          sold: false,
          purchaseAuthority: false,
          note: "Non-live labelled fixture. Not extract $0.005 or seller-integrity-audit $0.01.",
        },
        proposed,
      ],
      adjacentLive: [extractLive, siaLive],
    },
    limits: {
      maxInputBytes: 1_048_576,
      node: catalog.runtime?.node || ">=22",
      network: catalog.runtime?.network || "offline-first",
      purchaseAuthority: false,
      schedulerDaemon: false,
      liveSettlement: "out-of-scope",
      sampleNotASale: true,
      sold: false,
    },
    identities: {
      catalogSha256: sources.catalogSha256,
      outcomesSha256: sources.outcomesSha256,
      archiveSha256: wrapper.USEFUL_JOBS_ARCHIVE_SHA256,
      archiveBytes: wrapper.USEFUL_JOBS_ARCHIVE_BYTES,
      archiveIdentity: `${wrapper.USEFUL_JOBS_ARCHIVE_SHA256}:${wrapper.USEFUL_JOBS_ARCHIVE_BYTES}`,
    },
    runtime: {
      wrapperContract: wrapper.contract,
      hasCreateExecutor: wrapper.hasCreateExecutor,
      hasExecutionHttp: wrapper.hasHttp,
      cli: "server/paid-useful-jobs/bin/cli.mjs",
      liveSettlement: "out-of-scope",
    },
    bindings: {
      m01: { status: sources.m01.status, path: sources.m01.path, error: sources.m01.error || null },
      d26: { status: sources.d26.status, path: sources.d26.path, error: sources.d26.error || null },
      d01: {
        status: wrapper.hasCreateExecutor ? "present-on-checkout" : "unbound-on-tested-pin",
        contract: wrapper.contract,
      },
    },
    outcomeFields: {
      transport: "process/acquire/engine lifecycle",
      analysis: "domain report; informational or refused can be useful",
      delivery: "expected artifacts from this run",
      payment: "sold remains false; fundingState is not a live sale",
    },
  };
}
