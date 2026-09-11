import {
  CATALOG_PATH,
  CONSUMER_SNAPSHOT,
  DISCOVERY_PATH,
  PRESENCE_SNAPSHOT,
  SDS52,
  missingDependencies,
  sha256Json,
} from "./pins.mjs";
import { outreachRefusal, refuse } from "./refuse.mjs";

export async function loadPresence() {
  const missing = missingDependencies().filter((row) =>
    ["presence", "registryConsumer"].includes(row.name),
  );
  if (missing.length) {
    throw refuse("missing-dependency", "Presence/registry-consumer files are missing", { missing });
  }
  return import(new URL("../../../../tools/presence/lib.mjs", import.meta.url));
}

export async function loadRegistryConsumer() {
  return import(new URL("../../../../tools/presence/registry-consumer.mjs", import.meta.url));
}

export async function loadOfferCatalog() {
  const missing = missingDependencies().filter((row) =>
    ["catalog", "discovery"].includes(row.name),
  );
  if (missing.length) {
    throw refuse("missing-dependency", "Useful-jobs catalog/discovery files are missing", { missing });
  }
  const { readFileSync } = await import("node:fs");
  return {
    catalog: JSON.parse(readFileSync(CATALOG_PATH, "utf8")),
    discovery: JSON.parse(readFileSync(DISCOVERY_PATH, "utf8")),
  };
}

/**
 * Current partner/registry events from PR52 presence fixtures and the
 * MCP registry consumer capture. Two snapshots stay distinct.
 */
export async function collectEvents({ fetchImpl, fixtureDir } = {}) {
  const missing = missingDependencies();
  if (missing.length) {
    throw refuse("missing-dependency", "Required current-source files are missing", { missing });
  }

  const presence = await loadPresence();
  const consumer = await loadRegistryConsumer();
  const pack = presence.loadFixturePack(fixtureDir || presence.DEFAULT_FIXTURE_DIR);
  const writes = [];
  const impl = fetchImpl || presence.createFixtureFetch(pack, { writes });

  const surfaces = [];
  for (const surface of presence.SURFACES) {
    const report = await presence.runSurface(surface, { fetchImpl: impl, apply: false, writes });
    surfaces.push({
      surface,
      classification: report.classification,
      apply: report.apply,
      wouldSendCount: (report.wouldSend || []).length,
      protectedApplyAllowed: surface === "mcp-registry",
      analysis: report.classification,
      transport: { ok: true, kind: "fixture-fetch" },
      payment: { sold: false, liveSettlement: "out-of-scope" },
    });
  }

  const unfiltered = consumer.loadFixture("search-unfiltered.json");
  const searchLatest = consumer.loadFixture("search-version-latest.json");
  const versionsLatest = consumer.loadFixture("versions-latest.json");
  const capture = consumer.loadCaptureMeta();
  const { catalog, discovery } = await loadOfferCatalog();

  const presenceListed = pack.mcpRegistry?.servers?.[0] || null;
  const presenceListedVersion = presenceListed?.server?.version || null;
  const originCatalogVersion = pack.openapi?.info?.version || null;
  const consumerLatestVersion = consumer.versionOf(versionsLatest);
  const presenceListingSha = sha256Json(pack.mcpRegistry);
  const consumerLatestSha = capture.bodies["versions-latest.json"].sha256;

  return {
    schema: "samedaydesk.wave5.m19.events.v1",
    testedSha: SDS52,
    snapshots: {
      [PRESENCE_SNAPSHOT]: {
        capturedAt: pack.meta?.capturedAt || null,
        originCatalogVersion,
        listedMcpVersion: presenceListedVersion,
        listedRemote: presenceListed?.server?.remotes?.[0]?.url || null,
        listedIsLatest: presenceListed?._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest ?? null,
        listingSha256: presenceListingSha,
        openapiVersion: originCatalogVersion,
      },
      [CONSUMER_SNAPSHOT]: {
        capturedAt: capture.capturedAt,
        pinnedLatestVersion: capture.pinnedLatest.version,
        remote: capture.pinnedLatest.remote,
        isLatest: capture.pinnedLatest.isLatest,
        versionsLatestSha256: capture.bodies["versions-latest.json"].sha256,
        searchLatestSha256: capture.bodies["search-version-latest.json"].sha256,
        unfilteredSha256: capture.bodies["search-unfiltered.json"].sha256,
      },
    },
    unlike: {
      presenceListedVsOrigin: presenceListedVersion !== originCatalogVersion,
      presenceListedVsConsumerLatest: presenceListedVersion !== consumerLatestVersion,
      originVsConsumerLatest: originCatalogVersion !== consumerLatestVersion,
      usefulJobsVsMcpLatest: catalog.version !== consumerLatestVersion,
      listingBodiesEqual: presenceListingSha === consumerLatestSha,
    },
    surfaces,
    consumer: {
      unfilteredFirstLooksCurrent: consumer.firstHitLooksLikeCurrentLatest(unfiltered),
      unfilteredFirstVersion: consumer.versionOf(consumer.firstSearchHit(unfiltered)),
      latestSearchVersion: consumer.versionOf(searchLatest.servers[0]),
      versionsLatestVersion: consumerLatestVersion,
      latestSearchAgrees: consumer.matchesPin(searchLatest.servers[0], capture.pinnedLatest),
      versionsLatestAgrees: consumer.matchesPin(versionsLatest, capture.pinnedLatest),
    },
    offer: {
      package: catalog.package,
      version: catalog.version,
      jobs: catalog.jobs.map((job) => job.id),
      discoveryUrl: discovery.jobsCatalogUrl,
      purchaseAuthority: catalog.runtime?.purchaseAuthority === true,
      archiveSha256: discovery.sha256,
    },
  };
}

export async function selectContribution(events, { surface = "mcp-registry", kind } = {}) {
  if (kind === "grexal-marketplace-scan" || kind === "multi-surface-blast" || kind === "invented-partner") {
    throw outreachRefusal(kind);
  }
  if (surface && surface !== "mcp-registry") {
    if (surface === "bazaar" || surface === "mpp") {
      throw refuse(
        "protected-field-write",
        "Bazaar and MPP writes carry price, payTo, asset, or network. Not a supported contribution.",
        { surface },
      );
    }
    if (surface === "agentverse") {
      throw refuse(
        "unsupported-contribution",
        "Agentverse status writes are not the selected maintained distribution for this kit.",
        { surface },
      );
    }
    throw refuse("unknown-surface", `unknown surface ${surface}`, { surface });
  }

  const presence = await loadPresence();
  const pack = presence.loadFixturePack();
  const writes = [];
  const fetchImpl = presence.createFixtureFetch(pack, { writes });
  const report = await presence.runSurface("mcp-registry", { fetchImpl, apply: false, writes });
  const request = (report.wouldSend || [])[0] || null;
  if (!request) {
    throw refuse("no-supported-contribution", "mcp-registry wouldSend is empty", {
      classification: report.classification,
    });
  }

  const originVersion = events.snapshots[PRESENCE_SNAPSHOT].originCatalogVersion;
  const listedVersion = events.snapshots[PRESENCE_SNAPSHOT].listedMcpVersion;
  const consumerLatest = events.snapshots[CONSUMER_SNAPSHOT].pinnedLatestVersion;

  return {
    id: "mcp-registry-version-only",
    surface: "mcp-registry",
    snapshot: PRESENCE_SNAPSHOT,
    serverName: presence.MCP_SERVER_NAME,
    listedVersion,
    originCatalogVersion: originVersion,
    consumerLatestVersion: consumerLatest,
    unlikeConsumerLatest: originVersion !== consumerLatest,
    request: {
      method: request.method,
      url: request.url,
      body: request.body,
      note: request.note,
    },
    protectedWrite: false,
    livePublishAuthorized: false,
    payment: { sold: false, liveSettlement: "out-of-scope" },
  };
}
