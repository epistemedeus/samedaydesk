import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadJson } from "./load-json.mjs";
import { defaultDocumentPaths, findRepoRoot } from "./paths.mjs";
import { firstIndex, pathOfResource, selectById } from "./identity.mjs";

export const DEFAULT_JOB_ID = "vendor-budget-impact";
export const LIVE_EXTRACT_OPERATION_ID = "extractUrl";
export const LIVE_SIA_OPERATION_ID = "auditSellerIntegrity";
export const MPP_SERVICE_ID = "samedaydesk";
export const TESTED_SDS_SHA = "aeef964fa188443078958d9d6d393afae1d542ee";

async function importKernel(repoRoot, rel) {
  return import(pathToFileURL(join(repoRoot, rel)).href);
}

export async function loadKernels(repoRoot) {
  const [registry, catalog, pins] = await Promise.all([
    importKernel(repoRoot, "tools/presence/registry-consumer.mjs"),
    importKernel(repoRoot, "tools/presence/catalog.mjs"),
    importKernel(repoRoot, "server/paid-useful-jobs/lib/pins.mjs"),
  ]);
  return { registry, catalog, pins };
}

export async function loadDocuments(sources = {}) {
  const repoRoot = sources.repoRoot || findRepoRoot();
  const paths = defaultDocumentPaths(repoRoot);
  const resolved = { ...paths, ...sources, repoRoot };
  const kernels = sources.kernels || (await loadKernels(repoRoot));
  const [
    mcpVersionsLatest,
    mcpSearchLatest,
    mcpSearchUnfiltered,
    presenceMcpRegistry,
    usefulJobsDiscovery,
    usefulJobsCatalog,
    openapi,
    x402,
    mpp,
    bazaar,
  ] = await Promise.all([
    loadJson(resolved.mcpVersionsLatest),
    loadJson(resolved.mcpSearchLatest),
    loadJson(resolved.mcpSearchUnfiltered),
    loadJson(resolved.presenceMcpRegistry),
    loadJson(resolved.usefulJobsDiscovery),
    loadJson(resolved.usefulJobsCatalog),
    loadJson(resolved.openapi),
    loadJson(resolved.x402),
    loadJson(resolved.mpp),
    loadJson(resolved.bazaar),
  ]);
  return {
    repoRoot,
    kernels,
    wrapperCli: resolved.wrapperCli || paths.wrapperCli,
    mcpVersionsLatest,
    mcpSearchLatest,
    mcpSearchUnfiltered,
    presenceMcpRegistry,
    usefulJobsDiscovery,
    usefulJobsCatalog,
    openapi,
    x402,
    mpp,
    bazaar,
  };
}

export function discoverFromDocuments(docs, { jobId = DEFAULT_JOB_ID } = {}) {
  const { registry, catalog: catalogMod, pins } = docs.kernels;
  const naive = registry.firstSearchHit(docs.mcpSearchUnfiltered);
  const latestHits = registry.latestSearchHits(docs.mcpSearchLatest);
  const latest = docs.mcpVersionsLatest;
  const presenceListed = registry.firstSearchHit(docs.presenceMcpRegistry);
  const catalog = catalogMod.mergeSellerCatalog(docs.openapi, docs.x402);
  const operations = catalogMod.paidOperationsFromOpenApi(docs.openapi).operations;
  const jobs = docs.usefulJobsCatalog?.jobs || [];
  const selectedJob = selectById(jobs, jobId);
  const index0Job = firstIndex(jobs);
  const extractOp = selectById(operations, LIVE_EXTRACT_OPERATION_ID, { idKey: "operationId" });
  const siaOp = selectById(operations, LIVE_SIA_OPERATION_ID, { idKey: "operationId" });
  const mppServices = docs.mpp?.services || [];
  const mppById = selectById(mppServices, MPP_SERVICE_ID);
  const mppIndex0 = firstIndex(mppServices);
  const bazaarResources = docs.bazaar?.resources || [];
  const bazaarIndex0 = firstIndex(bazaarResources);
  const currentOriginHost = "agents.samedaydesk.com";
  const bazaarCurrentExtract =
    bazaarResources.find((row) => {
      try {
        const url = new URL(row.resource);
        return url.host === currentOriginHost && pathOfResource(row.resource) === "/extract";
      } catch {
        return false;
      }
    }) || null;

  const naiveIsCurrent = registry.firstHitLooksLikeCurrentLatest(docs.mcpSearchUnfiltered);
  const latestRemote = registry.remoteUrl(latest);
  const presenceVersion = registry.versionOf(presenceListed);
  const latestVersion = registry.versionOf(latest);

  return {
    schema: "samedaydesk.w5-m13.discovery.v1",
    testedKernel: {
      repo: "epistemedeus/samedaydesk",
      sha: TESTED_SDS_SHA,
      ref: "fable/f08-paid-wrappers",
      pr: 52,
      wrapper: "server/paid-useful-jobs/bin/cli.mjs",
    },
    mcp: {
      serverName: registry.SERVER_NAME,
      current: {
        version: latestVersion,
        remote: latestRemote,
        isLatest: registry.officialMeta(latest).isLatest === true,
        websiteUrl: latest?.server?.websiteUrl || null,
      },
      searchLatestAgrees:
        latestHits.length === 1 &&
        registry.remoteUrl(latestHits[0]) === latestRemote &&
        registry.versionOf(latestHits[0]) === latestVersion,
      naiveFirstHit: {
        version: registry.versionOf(naive),
        remote: registry.remoteUrl(naive),
        isLatest: registry.officialMeta(naive).isLatest === true,
      },
      naiveFirstHitIsCurrent: naiveIsCurrent,
      presenceListingVersion: presenceVersion,
      presenceListingMatchesLatest: presenceVersion === latestVersion,
    },
    jobs: {
      catalogVersion: docs.usefulJobsCatalog?.version || null,
      ids: jobs.map((job) => job.id),
      selected: selectedJob
        ? {
            id: selectedJob.id,
            title: selectedJob.title,
            requiredInputs: selectedJob.requiredInputs,
            outputs: selectedJob.outputs,
            purchaseAuthority: docs.usefulJobsDiscovery?.purchaseAuthority === true,
          }
        : null,
      index0Id: index0Job?.id || null,
      selectedIsIndex0: selectedJob != null && index0Job?.id === selectedJob.id,
    },
    liveOperations: {
      extractUrl: extractOp
        ? {
            operationId: extractOp.operationId,
            path: extractOp.path,
            priceUsd: extractOp.priceUsd,
          }
        : null,
      auditSellerIntegrity: siaOp
        ? {
            operationId: siaOp.operationId,
            path: siaOp.path,
            priceUsd: siaOp.priceUsd,
          }
        : null,
    },
    mpp: {
      serviceCount: mppServices.length,
      selectedById: mppById ? { id: mppById.id, url: mppById.url } : null,
      listed: Boolean(mppById),
      index0Id: mppIndex0?.id || null,
    },
    bazaar: {
      resourceCount: bazaarResources.length,
      index0Resource: bazaarIndex0?.resource || null,
      currentExtract: bazaarCurrentExtract?.resource || null,
      index0IsCurrentExtract: Boolean(
        bazaarCurrentExtract && bazaarIndex0 && bazaarIndex0.resource === bazaarCurrentExtract.resource,
      ),
    },
    catalogOrigin: catalog.origin,
    unlikeOffers: {
      liveExtractUsd: pins.LIVE_EXTRACT_PRICE_USDC,
      liveSellerIntegrityAuditUsd: pins.LIVE_SELLER_INTEGRITY_AUDIT_PRICE_USDC,
      fixtureWrapperUsd: pins.FIXTURE_PRICE_USDC,
      freeOfflinePurchaseAuthority: docs.usefulJobsDiscovery?.purchaseAuthority === true,
    },
    remainingBindings: {
      m12: "W5-M12 machine-readable capability/pricing document is not in this tree; live prices come from OpenAPI x-payment-info and fixture wrapper prices from PR52 pins. Do not treat those documents as one hash.",
      d24: "W5-D24 clean-environment package install is not in this tree; invoke uses the in-repo PR52 CLI path.",
      liveMcpInvoke: "Discovered MCP remote is not invoked here. Live settle and paid MCP calls are out of scope.",
    },
    invoke: selectedJob
      ? {
          kind: "paid-useful-jobs-cli",
          jobId: selectedJob.id,
          cli: docs.wrapperCli,
          liveSettlement: "out-of-scope",
        }
      : null,
  };
}

export function assertUnlikeOffers(discovery) {
  const u = discovery.unlikeOffers;
  return {
    liveExtractNotFixture: u.liveExtractUsd !== u.fixtureWrapperUsd,
    liveSiaNotFixture: u.liveSellerIntegrityAuditUsd !== u.fixtureWrapperUsd,
    liveExtractNotSia: u.liveExtractUsd !== u.liveSellerIntegrityAuditUsd,
    mcpPresenceNotForcedLatest: discovery.mcp.presenceListingMatchesLatest === false,
    naiveNotCurrent: discovery.mcp.naiveFirstHitIsCurrent === false,
  };
}
