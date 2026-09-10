import {
  ACQUISITION_SCHEMA,
  AVAILABILITY_STATUS,
  GREXAL_IO,
  GREXAL_PUBLIC,
  LISTING_CAPTURE_SCHEMA,
} from "./constants.mjs";
import { buildPortableCatalog } from "../../03/src/catalog.mjs";
import {
  assertCanonicalListingUrl,
  assertPaidReadyGate,
  validateListingCapture,
  acquisitionError,
} from "./validate.mjs";
import { ACQUISITION_ERROR_CODES } from "./constants.mjs";
import { renderAcquisitionSectionMd } from "./site-section.mjs";

export { ACQUISITION_ERROR_CODES };

function defaultClock() {
  return Date.now();
}

function buildBudgetHandoff() {
  return {
    requiresConfirmation: true,
    listPriceUsd: GREXAL_PUBLIC.listPriceUsd,
    estimateReserveUsd: GREXAL_PUBLIC.estimateReserveUsd,
    estimateReserveIsCharge: false,
    paidInvokeExecuted: false,
    note: "STOP before marketplace Run. Confirm list price $0.02; estimate reserve $0.025 is NOT a charge. This kit never executes paid invoke.",
  };
}

function buildFreeVsPriced() {
  return [
    {
      action: "browse_marketplace_listing",
      cost: "free",
      detail: "Open public URL, confirm agentId, read listing — no key, no charge",
    },
    {
      action: "local_offline_pack",
      cost: "free",
      detail: "From preserve package: npm test / node agent/pack_evidence.js — no Grexal login, no marketplace Run",
    },
    {
      action: "marketplace_run",
      cost: "priced",
      listPriceUsd: GREXAL_PUBLIC.listPriceUsd,
      estimateReserveUsd: GREXAL_PUBLIC.estimateReserveUsd,
      estimateReserveIsCharge: false,
      detail: "Grexal marketplace Run is priced at run_completed $0.02; estimate reserve $0.025 is not a charge. Requires explicit budget confirmation before invoke.",
    },
  ];
}

function buildReadiness(listing) {
  return {
    noKey: true,
    paidInvokeExecuted: false,
    steps: [
      {
        n: "01",
        t: "Open the public marketplace URL",
        d: listing.url,
      },
      {
        n: "02",
        t: "Confirm listing identifier",
        d: `agentId=${listing.agentId} (route /marketplace/[agentId])`,
      },
      {
        n: "03",
        t: "Read the listing in the browser",
        d: "SSR is Convex-hydrated; commercial fields cited from S149 (price/name may not appear in raw HTML).",
      },
      {
        n: "04",
        t: "STOP before Run",
        d: "Do not click Run / invoke. Budget confirmation handoff is required first.",
      },
    ],
    stopBefore: "marketplace_run",
  };
}

function buildFirstRunRecipe(listing, expectedIo, budgetHandoff, paidReady) {
  return {
    title: "Grexal source-change evidence — discovery to first use",
    publicRoute: listing.url,
    listingIdentifier: listing.agentId,
    freeAction: "Open URL + confirm agentId + read listing (no key)",
    pricedAction: "Marketplace Run only after budget confirmation",
    expectedInput: expectedIo.inputs,
    expectedOutput: expectedIo.outputs,
    ioCite: expectedIo.cite,
    budgetHandoff,
    paidReady,
    localOfflineAlternative: [
      "cd <preserve grexal package>",
      "npm test",
      "node agent/pack_evidence.js --unifiedDiffFile fixtures/diff/simple.patch --buyerCriteriaFile fixtures/criteria/require-structural.json --stdout-only",
    ],
    refusePaidWithoutConfirmation: true,
    notes: [
      "Browsing/discovery is free.",
      "Marketplace Run costs $0.02 on run_completed; $0.025 reserve is not a charge.",
      "This recipe never logs into Grexal and never executes paid invoke.",
      "No adoption, revenue, or payout claims.",
    ],
  };
}

/**
 * Build actionable customer acquisition package from catalog inventory + live listing capture.
 *
 * @param {{ inventory: object, listingCapture: object, confirmation?: { confirmed?: boolean, markPaidReady?: boolean }, clock?: Function }} input
 */
export function buildAcquisitionPackage(input = {}) {
  const clock = input.clock || defaultClock;
  if (!input.inventory) {
    throw acquisitionError(ACQUISITION_ERROR_CODES.MISSING_REQUIREMENT, "inventory required");
  }
  if (!input.listingCapture) {
    throw acquisitionError(ACQUISITION_ERROR_CODES.MISSING_REQUIREMENT, "listingCapture required");
  }

  const listingCapture = validateListingCapture({
    schema: input.listingCapture.schema || LISTING_CAPTURE_SCHEMA,
    ...input.listingCapture,
  });

  const catalog = buildPortableCatalog(input.inventory, { clock });
  const grexal = (catalog.packages || []).find((p) => p.kind === "grexal_agent_package" || p.id?.includes("grexal"));
  const agensi = (catalog.packages || []).find((p) => p.kind === "agensi_free_skill" || p.id?.includes("agensi"));

  if (!grexal || grexal.availability?.status !== AVAILABILITY_STATUS.ACTIVE_PUBLIC) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.MISSING_REQUIREMENT,
      "Grexal package must be active_public in inventory",
      { got: grexal?.availability?.status ?? null },
    );
  }
  if (grexal.availability.agentId !== GREXAL_PUBLIC.agentId) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.INVENTED_URL,
      "inventory Grexal agentId mismatch vs canonical listing",
    );
  }
  if (agensi && agensi.availability?.status !== AVAILABILITY_STATUS.PENDING_REVIEW) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.FORBIDDEN_CLAIM,
      "Agensi must remain pending_review until provider changes (installs=0 WAIT)",
      { got: agensi.availability?.status },
    );
  }
  if (agensi && agensi.availability?.installs !== 0) {
    throw acquisitionError(
      ACQUISITION_ERROR_CODES.FORBIDDEN_CLAIM,
      "Agensi installs must stay 0 until provider re-verified",
      { got: agensi.availability?.installs },
    );
  }

  const listing = {
    url: assertCanonicalListingUrl(listingCapture.observedUrl),
    agentId: GREXAL_PUBLIC.agentId,
    deploymentId: GREXAL_PUBLIC.deploymentId,
    deploymentVersion: GREXAL_PUBLIC.deploymentVersion,
    httpStatus: listingCapture.httpStatus,
    matchedPath: listingCapture.matchedPath,
    capturedAt: listingCapture.capturedAt,
    ssrEmbedsCommercialFields: listingCapture.ssrEmbedsCommercialFields === true,
    commercialFieldsSourcedFrom: "S149",
    pricing: {
      run_completed_usd: GREXAL_PUBLIC.listPriceUsd,
      estimate_reserve_usd: GREXAL_PUBLIC.estimateReserveUsd,
      estimateReserveIsCharge: false,
    },
    category: GREXAL_PUBLIC.category,
    tags: [...GREXAL_PUBLIC.tags],
    homepage: GREXAL_PUBLIC.homepage,
    customerExecutionRevenuePayout: false,
  };

  const budgetHandoff = buildBudgetHandoff();
  const gate = assertPaidReadyGate(input.confirmation || {}, budgetHandoff);
  const freeVsPriced = buildFreeVsPriced();
  const readiness = buildReadiness(listing);
  const firstRunRecipe = buildFirstRunRecipe(listing, GREXAL_IO, budgetHandoff, gate.paidReady);
  const acquisitionSectionMd = renderAcquisitionSectionMd({ listing, freeVsPriced, budgetHandoff });

  return {
    schema: ACQUISITION_SCHEMA,
    generatedAt: new Date(clock()).toISOString(),
    readiness,
    firstRunRecipe,
    acquisitionSectionMd,
    freeVsPriced,
    budgetHandoff,
    listing,
    paidReady: gate.paidReady,
    confirmation: {
      confirmed: input.confirmation?.confirmed === true,
      markPaidReady: input.confirmation?.markPaidReady === true,
      gateReason: gate.reason,
    },
    catalogStatus: catalog.status,
    packages: {
      grexal: {
        id: grexal.id,
        availability: grexal.availability.status,
        agentId: grexal.availability.agentId,
      },
      agensi: agensi
        ? {
            id: agensi.id,
            availability: agensi.availability.status,
            installs: agensi.availability.installs,
            tier: agensi.availability.tier || "Free",
          }
        : null,
    },
    mutationBoundary: {
      grexalLogin: false,
      paidInvoke: false,
      inventsAdoption: false,
      startsNlDistribution06: false,
      ownerOfPublicSiteMerge: "Root",
    },
    evidenceRefs: [
      "evidence/listing-recheck-20260910T124127Z.json",
      "/workspace/pilot/receipts/scale-bot-0909/r2-team/receipts-grexal-s149.json",
    ],
  };
}
