import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createM01AwareGetJob } from "../../../wave5/m01/lib/d01-adapter.mjs";
import { getJob as pr51GetJob } from "../../../../server/paid-useful-jobs/lib/jobs.mjs";
import { listCurrentJobs } from "../../../wave5/m13/src/invoke.mjs";
import {
  INTEGRATED_ENGINE_PIN,
  JOB_ID,
  MERCHANT_HOST,
  MERCHANT_OPERATION_ID,
  MERCHANT_ROUTE,
  MERCHANT_SERVER_NAME,
  MERCHANT_URL,
  MERCHANT_VERSION,
  M12_COMMIT,
  M13_COMMIT,
  PUBLIC_ARCHIVE_VERSION,
  PUBLIC_CATALOG_PIN,
  STALE_MERCHANT_VERSIONS,
  WRAPPER_ARCHIVE_VERSION,
  IDENTITY_SCHEMA,
} from "./constants.mjs";
import { fingerprint } from "./canonical.mjs";
import { hashPathTree, sha256Bytes, sha256File } from "./hash.mjs";
import { rowsFromJobIds, selectExactById } from "./identity.mjs";
import { repoPaths } from "./paths.mjs";
import { refuse } from "./refuse.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fileIdentity(path) {
  if (!existsSync(path)) {
    throw refuse("missing-source", `required source missing: ${path}`, { path });
  }
  const hashed = sha256File(path);
  return { path, sha256: hashed.sha256, bytes: hashed.bytes };
}

function loadMerchant(remoteDir) {
  const capturePath = join(remoteDir, "capture.json");
  const captures = readJson(capturePath);
  const files = {};
  for (const row of captures) {
    if (!row.sha256) continue;
    const path = join(remoteDir, `${row.name}.json`);
    const hashed = sha256File(path);
    if (hashed.sha256 !== row.sha256 || hashed.bytes !== row.bytes) {
      throw refuse("hosted-evidence-mismatch", `capture ${row.name} bytes no longer match capture.json`, {
        name: row.name,
      });
    }
    files[row.name] = {
      kind: "hosted-evidence",
      name: row.name,
      url: row.url,
      method: row.method,
      status: row.status,
      sha256: hashed.sha256,
      bytes: hashed.bytes,
      capturedAt: row.capturedAt || null,
      authorizationSent: row.authorizationSent === true,
      paymentSent: row.paymentSent === true,
    };
  }
  const openapi = readJson(join(remoteDir, "openapi.json"));
  const mcp = readJson(join(remoteDir, "mcp-version.json"));
  const challenge = readJson(join(remoteDir, "lockfile-challenge.json"));
  const requestHashed = sha256File(join(remoteDir, "lockfile-request.json"));
  const lockfileCapture = captures.find((row) => row.name === "lockfile-challenge");
  if (lockfileCapture?.requestSha256 && requestHashed.sha256 !== lockfileCapture.requestSha256) {
    throw refuse("hosted-evidence-mismatch", "lockfile request digest does not match capture metadata");
  }
  const route = openapi.paths?.[MERCHANT_ROUTE];
  const protocols = (route?.post?.["x-payment-info"]?.protocols || []).flatMap((row) => Object.keys(row));
  const version = String(openapi.info?.version || "");
  const mcpVersion = String(mcp.server?.version || "");
  const serverName = mcp.server?.name || null;
  const remote = mcp.server?.remotes?.[0]?.url || null;
  const isLatestCaptureField = mcp._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest === true;
  return {
    kind: "hosted-evidence",
    version,
    mcpVersion,
    serverName,
    remote,
    route: MERCHANT_ROUTE,
    url: MERCHANT_URL,
    methods: route ? Object.keys(route) : [],
    getSupported: Boolean(route?.get),
    postSupported: Boolean(route?.post),
    operationId: route?.post?.operationId || null,
    protocols,
    mppOnThisRoute: protocols.includes("mpp"),
    captureStatus: lockfileCapture?.status ?? null,
    authorizationSent: lockfileCapture?.authorizationSent === true,
    paymentSent: lockfileCapture?.paymentSent === true,
    isLatestCaptureField,
    isLatestAuthority: false,
    staleVersionsRefused: [...STALE_MERCHANT_VERSIONS],
    publishedPriceUsdc: route?.post?.["x-payment-info"]?.price?.amount || null,
    challengeAmountAtomic: challenge.accepts?.[0]?.amount || null,
    files,
    requestSha256: requestHashed.sha256,
    health: captures.find((row) => row.name === "health") || null,
  };
}

function assertMerchantIdentity(merchant) {
  if (merchant.version !== MERCHANT_VERSION || merchant.mcpVersion !== MERCHANT_VERSION) {
    throw refuse("stale-or-wrong-merchant-version", "hosted merchant version is not the captured 1.23.49 identity", {
      openapi: merchant.version,
      mcp: merchant.mcpVersion,
      expected: MERCHANT_VERSION,
    });
  }
  if (STALE_MERCHANT_VERSIONS.includes(merchant.version)) {
    throw refuse("stale-merchant-version", "1.23.45 is a stale registry fixture, not current identity");
  }
  if (merchant.serverName !== MERCHANT_SERVER_NAME) {
    throw refuse("wrong-merchant-name", "MCP server name does not match captured identity", {
      serverName: merchant.serverName,
    });
  }
  let host = null;
  try {
    host = new URL(merchant.remote).host;
  } catch {
    host = null;
  }
  if (host !== MERCHANT_HOST) {
    throw refuse("wrong-merchant-remote", "MCP remote is not agents.samedaydesk.com", {
      remote: merchant.remote,
    });
  }
  if (merchant.getSupported) {
    throw refuse("unexpected-get-on-post-only-route", "captured lockfile route must remain POST-only");
  }
  if (merchant.operationId !== MERCHANT_OPERATION_ID) {
    throw refuse("wrong-operation-id", "published operationId is not compareLockfilePinDelta", {
      operationId: merchant.operationId,
    });
  }
  if (merchant.isLatestAuthority === true) {
    throw refuse("false-latest-authority", "isLatest is a capture-time field and must not be treated as authority");
  }
}

export function inspectLockfileOffer(options = {}) {
  const paths = repoPaths(options.repoRoot);
  const jobId = options.jobId || JOB_ID;
  if (jobId !== JOB_ID) {
    throw refuse("unsupported-job", `this adapter's executable path is ${JOB_ID} only`, { jobId });
  }
  if (options.engineRoot) {
    throw refuse("engine-root-override", "engine-root override is refused; in-tree engine identity is required", {
      engineRoot: options.engineRoot,
    });
  }
  if (!existsSync(paths.wrapperCli)) {
    throw refuse("cli-missing", `wrapper CLI missing at ${paths.wrapperCli}`, { path: paths.wrapperCli });
  }
  if (!existsSync(paths.engineBin)) {
    throw refuse("engine-bin-missing", `engine executable missing at ${paths.engineBin}`, { path: paths.engineBin });
  }
  if (!existsSync(paths.catalog)) {
    throw refuse("catalog-missing", `useful-jobs catalog missing at ${paths.catalog}`);
  }

  const catalogFile = fileIdentity(paths.catalog);
  const catalog = JSON.parse(readFileSync(paths.catalog));
  const catalogRows = Array.isArray(catalog.jobs) ? catalog.jobs : [];
  const selectedCatalog = selectExactById(catalogRows, jobId);
  if (!selectedCatalog) {
    throw refuse("unknown-job", `job ${jobId} is not in the public useful-jobs catalog`);
  }

  const listed = listCurrentJobs({ repoRoot: paths.repoRoot, cli: paths.wrapperCli });
  if (listed.failureClass === "transport" || listed.status !== 0) {
    throw refuse(listed.code || "cli-list-failed", listed.error || "current CLI list failed", {
      status: listed.status,
      outcome: listed.outcome,
    });
  }
  const jobIds = listed.body?.jobs || [];
  const selectedRuntime = selectExactById(rowsFromJobIds(jobIds), jobId);
  if (!selectedRuntime) {
    throw refuse("runtime-catalog-mismatch", `job ${jobId} is not in the current wrapper list`);
  }
  const resolveJob = createM01AwareGetJob(pr51GetJob);
  const resolved = resolveJob(jobId);
  const m01CatalogFile = fileIdentity(paths.m01Catalog);
  const m01Catalog = JSON.parse(readFileSync(paths.m01Catalog, "utf8"));
  const m01Engine = (m01Catalog.engines || []).find((row) => row.id === jobId);
  if (!m01Engine) {
    throw refuse("m01-engine-missing", `M01 catalog does not list ${jobId}`);
  }
  const engineBin = fileIdentity(paths.engineBin);
  const engineTree = hashPathTree(paths.engineRoot);
  const cliFile = fileIdentity(paths.wrapperCli);
  const discoveryFile = fileIdentity(paths.discovery);
  const publicDiscovery = JSON.parse(readFileSync(paths.discovery, "utf8"));
  const wrapperMeta = readJson(paths.wrapperArchiveMeta);
  const merchant = loadMerchant(paths.remoteEvidence);
  assertMerchantIdentity(merchant);

  const publicPin = selectedCatalog.pin?.sha || null;
  const integratedPin = m01Engine.pin?.sha || null;
  const identity = {
    schema: IDENTITY_SCHEMA,
    jobId,
    catalog: {
      path: "client/public/for-agents/useful-jobs/catalog.json",
      sha256: catalogFile.sha256,
      bytes: catalogFile.bytes,
      version: catalog.version || null,
      publicPinSha: publicPin,
    },
    publicArchive: {
      kind: "source-capture",
      version: publicDiscovery.version || PUBLIC_ARCHIVE_VERSION,
      sha256: publicDiscovery.archive?.sha256 || publicDiscovery.sha256 || null,
      bytes: publicDiscovery.archive?.bytes || publicDiscovery.bytes || null,
      purchaseAuthority: publicDiscovery.purchaseAuthority === true,
    },
    engine: {
      kind: "source-capture",
      pinSha: integratedPin,
      ownedPath: "tools/lockfile-pin-delta/",
      binPath: "tools/lockfile-pin-delta/bin/lockfile-delta.mjs",
      binSha256: engineBin.sha256,
      binBytes: engineBin.bytes,
      treeSha256: engineTree.sha256,
      treeFileCount: engineTree.fileCount,
    },
    runtime: {
      kind: "source-capture",
      cliPath: "server/paid-useful-jobs/bin/cli.mjs",
      cliSha256: cliFile.sha256,
      cliBytes: cliFile.bytes,
      listJobCount: jobIds.length,
      firstOffer: listed.body?.firstOffer || null,
      listSha256: sha256Bytes(Buffer.from(JSON.stringify(jobIds), "utf8")),
      requiredInputs: [...(resolved.requiredInputs || [])],
      optionalInputs: [...(resolved.optionalInputs || [])],
      outputs: [...(resolved.outputs || [])],
    },
    wrapperArchive: {
      kind: "source-capture",
      version: WRAPPER_ARCHIVE_VERSION,
      sha256: wrapperMeta.sha256,
      bytes: wrapperMeta.bytes,
      note: "Legacy wrapper archive acquisition remains 1.0.0; selected M01 execution uses the in-tree engine.",
    },
    m01: {
      catalogSha256: m01CatalogFile.sha256,
      catalogBytes: m01CatalogFile.bytes,
      pinSha: integratedPin,
    },
    merchant: {
      kind: "hosted-evidence",
      version: merchant.version,
      serverName: merchant.serverName,
      remote: merchant.remote,
      route: merchant.route,
      url: merchant.url,
      methods: merchant.methods,
      getSupported: merchant.getSupported,
      operationId: merchant.operationId,
      protocols: merchant.protocols,
      mppOnThisRoute: merchant.mppOnThisRoute,
      captureStatus: merchant.captureStatus,
      authorizationSent: merchant.authorizationSent,
      paymentSent: merchant.paymentSent,
      isLatestCaptureField: merchant.isLatestCaptureField,
      isLatestAuthority: false,
      openapiSha256: merchant.files.openapi?.sha256 || null,
      mcpSha256: merchant.files["mcp-version"]?.sha256 || null,
      x402Sha256: merchant.files.x402?.sha256 || null,
      challengeSha256: merchant.files["lockfile-challenge"]?.sha256 || null,
      requestSha256: merchant.requestSha256,
      publishedPriceUsdc: merchant.publishedPriceUsdc,
      challengeAmountAtomic: merchant.challengeAmountAtomic,
    },
    consumers: {
      m12Commit: M12_COMMIT,
      m13Commit: M13_COMMIT,
      note: "Imported evidence; not rewritten by this adapter.",
    },
    publicDiscovery: {
      path: "client/public/discovery/useful-jobs.json",
      sha256: discoveryFile.sha256,
      bytes: discoveryFile.bytes,
    },
    pinsDistinct: {
      publicCatalogPin: publicPin,
      integratedEnginePin: integratedPin,
      wrapperArchiveVersion: WRAPPER_ARCHIVE_VERSION,
      publicArchiveVersion: publicDiscovery.version || PUBLIC_ARCHIVE_VERSION,
      merchantVersion: merchant.version,
      publicPinEqualsIntegrated: publicPin === integratedPin,
      expectedPublicCatalogPin: PUBLIC_CATALOG_PIN,
      expectedIntegratedEnginePin: INTEGRATED_ENGINE_PIN,
    },
  };

  return {
    paths,
    jobId,
    catalog,
    selectedCatalog,
    resolved,
    listed,
    merchant,
    identity,
    identityFingerprint: fingerprint(identity),
  };
}

export function assertIdentityMatch(stored, fresh, label = "identity") {
  const storedFp = fingerprint(stored);
  const freshFp = fingerprint(fresh);
  if (storedFp !== freshFp) {
    throw refuse("identity-changed", `${label} no longer matches freshly inspected frozen source`, {
      stored: storedFp,
      fresh: freshFp,
    });
  }
}
