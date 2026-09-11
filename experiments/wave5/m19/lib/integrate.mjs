import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CALLER_AFTER,
  CALLER_BEFORE,
  CONSUMER_SNAPSHOT,
  PRESENCE_SNAPSHOT,
  REPO_ROOT,
  RESERVED_PAYMENT,
  SCHEMA,
  SDS52,
  WRAPPER_CLI,
  missingDependencies,
  sha256Json,
} from "./pins.mjs";
import { collectEvents, loadPresence, loadRegistryConsumer, selectContribution } from "./events.mjs";
import { isRefuse, outreachRefusal, refuse } from "./refuse.mjs";

function envelope({ transport, analysis, delivery, payment, ...rest }) {
  return {
    schema: SCHEMA,
    testedSha: SDS52,
    transport,
    analysis,
    delivery,
    payment: payment || { sold: false, liveSettlement: "out-of-scope" },
    ...rest,
  };
}

export async function submitContribution(contribution, { apply = false, live = false } = {}) {
  if (live || apply === "live") {
    throw refuse(
      "live-publish-not-authorized",
      "Live MCP Registry publish is a Root step. This kit dry-runs the exact body only.",
      { url: contribution.request?.url || null },
    );
  }
  const presence = await loadPresence();
  const pack = presence.loadFixturePack();
  const writes = [];
  const fetchImpl = presence.createFixtureFetch(pack, { writes });
  const report = await presence.runSurface("mcp-registry", {
    fetchImpl,
    apply: apply === true,
    writes,
  });

  const submittedBody = report.wouldSend?.[0]?.body || null;
  const bodyMatches =
    submittedBody && contribution.request?.body
      ? sha256Json(submittedBody) === sha256Json(contribution.request.body)
      : false;

  return envelope({
    ok: true,
    refused: false,
    command: "submit",
    transport: {
      ok: true,
      kind: "fixture-fetch",
      apply: report.apply,
      sentCount: (report.sent || []).length,
    },
    analysis: {
      kind: report.classification,
      classification: report.classification,
      refuseReason: report.refuseReason || null,
    },
    delivery: {
      complete: false,
      published: false,
      reason: report.apply === "sent" ? "fixture-write-not-live" : "dry-run",
    },
    contributionId: contribution.id,
    snapshot: contribution.snapshot,
    submitted: {
      method: contribution.request.method,
      url: contribution.request.url,
      version: submittedBody?.version || null,
      name: submittedBody?.name || null,
      bodyMatchesSelection: bodyMatches,
    },
    sent: report.sent || [],
    protectedHits: report.protectedHits || [],
  });
}

export async function consumeLatest(opts = {}) {
  const naiveUnfiltered = opts.naiveUnfiltered === true;
  const snapshot = opts.snapshot || CONSUMER_SNAPSHOT;
  const consumer = await loadRegistryConsumer();
  const unfiltered = consumer.loadFixture("search-unfiltered.json");
  const searchLatest = consumer.loadFixture("search-version-latest.json");
  const versionsLatest = consumer.loadFixture("versions-latest.json");
  const capture = consumer.loadCaptureMeta();

  if (naiveUnfiltered) {
    const hit = consumer.firstSearchHit(unfiltered);
    throw refuse(
      "unfiltered-search-not-latest",
      "Unfiltered search servers[0] is historical Railway 1.0.0, not the current latest.",
      {
        listedVersion: consumer.versionOf(hit),
        listedRemote: consumer.remoteUrl(hit),
        isLatest: consumer.officialMeta(hit).isLatest,
        currentRemote: consumer.CURRENT_REMOTE,
      },
    );
  }

  const listing = snapshot === PRESENCE_SNAPSHOT
    ? (await loadPresence()).loadFixturePack().mcpRegistry.servers[0]
    : versionsLatest;

  const version = snapshot === PRESENCE_SNAPSHOT
    ? listing.server.version
    : consumer.versionOf(listing);
  const remote = snapshot === PRESENCE_SNAPSHOT
    ? listing.server.remotes[0].url
    : consumer.remoteUrl(listing);
  const isLatest = snapshot === PRESENCE_SNAPSHOT
    ? listing._meta["io.modelcontextprotocol.registry/official"].isLatest
    : consumer.officialMeta(listing).isLatest;

  const pinMatch =
    snapshot === CONSUMER_SNAPSHOT
      ? consumer.matchesPin(versionsLatest, capture.pinnedLatest) &&
        consumer.matchesPin(searchLatest.servers[0], capture.pinnedLatest)
      : false;

  return envelope({
    ok: true,
    command: "consume",
    transport: { ok: true, kind: "fixture-read" },
    analysis: {
      kind: isLatest ? "listed-latest-in-snapshot" : "not-latest",
      snapshot,
      version,
      remote,
      isLatest,
      pinMatch,
      naiveUnfilteredLooksCurrent: consumer.firstHitLooksLikeCurrentLatest(unfiltered),
    },
    delivery: { complete: false, published: false, reason: "consume-is-read" },
    snapshot,
    listing: { version, remote, isLatest, name: listing.server?.name || null },
  });
}

function classifyWrapperTransport(cli) {
  if (cli.error && cli.error.code === "ENOENT") {
    return { ok: false, kind: "engine-crash", error: "wrapper-cli-missing" };
  }
  if (cli.signal) {
    return { ok: false, kind: "engine-crash", signal: cli.signal };
  }
  if (cli.status === null) {
    return { ok: false, kind: "timeout" };
  }
  try {
    JSON.parse(cli.stdout);
    return { ok: true, kind: "cli", status: cli.status };
  } catch {
    return { ok: false, kind: "engine-crash", status: cli.status, parse: "stdout-not-json" };
  }
}

export function invokeSelectedOffer({ example = false, outDir } = {}) {
  const missing = missingDependencies().filter((row) =>
    ["wrapperCli", "callerBefore", "callerAfter", "reservedPayment"].includes(row.name),
  );
  if (missing.length) {
    throw refuse("missing-dependency", "Wrapper CLI or caller fixtures are missing", { missing });
  }

  const dest = outDir || mkdtempSync(join(tmpdir(), "m19-invoke-"));
  mkdirSync(dest, { recursive: true });
  const args = example
    ? [
        WRAPPER_CLI,
        "run",
        "vendor-budget-impact",
        "--example",
        "--funding",
        "reserved-fixture",
        "--payment",
        RESERVED_PAYMENT,
        "--out-dir",
        dest,
      ]
    : [
        WRAPPER_CLI,
        "run",
        "vendor-budget-impact",
        "--before",
        CALLER_BEFORE,
        "--after",
        CALLER_AFTER,
        "--funding",
        "reserved-fixture",
        "--payment",
        RESERVED_PAYMENT,
        "--out-dir",
        dest,
      ];

  const cli = spawnSync(process.execPath, args, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const transport = classifyWrapperTransport(cli);
  let body = null;
  try {
    body = JSON.parse(cli.stdout);
  } catch {
    body = null;
  }

  const expected = ["budget-impact.json", "budget-impact.md"];
  const present = expected.filter((name) => existsSync(join(dest, name)));
  const deliveryComplete = expected.every((name) => existsSync(join(dest, name)));

  if (example) {
    return envelope({
      ok: false,
      refused: true,
      command: "invoke",
      code: body?.code || "sample-not-a-sale",
      transport: { ...transport, status: cli.status },
      analysis: {
        kind: "valid-refusal",
        code: body?.code || "sample-not-a-sale",
        sample: true,
      },
      delivery: {
        complete: false,
        expected,
        present,
        missing: expected.filter((n) => !present.includes(n)),
      },
      sold: false,
      sample: true,
      body,
    });
  }

  const analysisKind =
    !transport.ok
      ? "not-run"
      : body?.ok === true
        ? "completed"
        : body?.refused
          ? "refused"
          : "unknown";

  return envelope({
    ok: Boolean(transport.ok && body?.ok === true && deliveryComplete && body?.sold === false),
    refused: body?.refused === true,
    command: "invoke",
    transport: { ...transport, status: cli.status },
    analysis: {
      kind: analysisKind,
      jobId: body?.jobId || "vendor-budget-impact",
      engineOk: body?.engine?.ok ?? body?.ok ?? null,
      sample: body?.sample === true,
    },
    delivery: {
      complete: deliveryComplete,
      expected,
      present,
      missing: expected.filter((n) => !present.includes(n)),
      outDir: dest,
    },
    sold: body?.sold === true,
    fundingState: body?.fundingState || null,
    jobId: "vendor-budget-impact",
    testedInterface: "server/paid-useful-jobs/bin/cli.mjs",
  });
}

export function independentlyConsumed(contribution, consume) {
  if (!contribution?.request?.body || !consume?.listing) return false;
  const submittedRemote = String(contribution.request.body.remotes?.[0]?.url || "").replace(/\/$/, "");
  const listedRemote = String(consume.listing.remote || "").replace(/\/$/, "");
  return (
    consume.listing.version === contribution.request.body.version &&
    submittedRemote.length > 0 &&
    submittedRemote === listedRemote &&
    consume.listing.isLatest === true
  );
}

export async function runJourney(options = {}) {
  const missing = missingDependencies();
  if (missing.length) {
    throw refuse("missing-dependency", "Required current-source files are missing", { missing });
  }
  if (options.scan || options.outreach || options.allPartners) {
    throw outreachRefusal(options.scanKind || "multi-surface-blast");
  }

  const events = await collectEvents();
  const contribution = await selectContribution(events);
  const submitted = await submitContribution(contribution, { apply: options.apply === true, live: options.live });
  const consumePresence = await consumeLatest({ snapshot: PRESENCE_SNAPSHOT });
  const consumeConsumer = await consumeLatest({ snapshot: CONSUMER_SNAPSHOT });
  const consumed = independentlyConsumed(contribution, consumePresence);
  const invoke = options.skipInvoke ? null : invokeSelectedOffer({ example: options.example === true });

  const kitOk =
    submitted.transport.ok &&
    consumePresence.transport.ok &&
    consumeConsumer.transport.ok &&
    (options.skipInvoke || (invoke && invoke.transport.ok && invoke.analysis.kind !== "not-run"));

  return envelope({
    ok: kitOk && (options.example ? invoke?.analysis?.kind === "valid-refusal" : invoke ? invoke.ok : true),
    command: "journey",
    contribution: {
      id: contribution.id,
      snapshot: contribution.snapshot,
      listedVersion: contribution.listedVersion,
      originCatalogVersion: contribution.originCatalogVersion,
      consumerLatestVersion: contribution.consumerLatestVersion,
      unlikeConsumerLatest: contribution.unlikeConsumerLatest,
      submittedVersion: contribution.request.body.version,
      independentlyConsumed: consumed,
      listingAccepted: Boolean(contribution.request.body),
    },
    events: {
      unlike: events.unlike,
      consumerNaiveFirstLooksCurrent: events.consumer.unfilteredFirstLooksCurrent,
      surfaces: events.surfaces.map((s) => ({
        surface: s.surface,
        classification: s.classification,
        protectedApplyAllowed: s.protectedApplyAllowed,
      })),
      offer: events.offer,
    },
    submit: submitted,
    consume: {
      presenceSnapshot: consumePresence,
      consumerSnapshot: consumeConsumer,
    },
    invoke,
    remainingLiveSteps: [
      "Root: publisher JWT via existing mcp-registry login helpers; not this worker.",
      "Root: POST the exact wouldSend body to registry.modelcontextprotocol.io/v0.1/publish.",
      "Root: GET /v0.1/servers/{name}/versions/latest and search?version=latest; require isLatest and agents.samedaydesk.com remote.",
      "Do not treat unfiltered search servers[0] as latest.",
      "M12/M13 exports, when present, replace catalog.json / presence as the capability and discovery pins.",
      "No live spend, payout, partner email, or production deploy from this kit.",
    ],
  });
}

export function reportError(err) {
  if (isRefuse(err)) {
    return envelope({
      ok: false,
      refused: true,
      code: err.code,
      error: err.message,
      detail: err.detail,
      transport: { ok: true, kind: "analysis" },
      analysis: { kind: "valid-refusal", code: err.code },
      delivery: { complete: false, reason: "refused-before-delivery" },
    });
  }
  return envelope({
    ok: false,
    refused: false,
    code: "transport-or-engine-failure",
    error: err.message || String(err),
    transport: { ok: false, kind: "engine-crash" },
    analysis: { kind: "not-run" },
    delivery: { complete: false, reason: "not-run" },
  });
}

export async function applyProtectedSurface(surface) {
  const presence = await loadPresence();
  const pack = presence.loadFixturePack();
  const writes = [];
  const fetchImpl = presence.createFixtureFetch(pack, { writes });
  const report = await presence.runSurface(surface, { fetchImpl, apply: true, writes });
  return envelope({
    ok: false,
    refused: report.apply === "refused",
    command: "submit",
    surface,
    transport: { ok: true, kind: "fixture-fetch", apply: report.apply },
    analysis: {
      kind: report.apply === "refused" ? "valid-refusal" : report.classification,
      refuseReason: report.refuseReason,
      classification: report.classification,
    },
    delivery: { complete: false, published: false, reason: report.apply },
    sent: report.sent || [],
    protectedHits: report.protectedHits || [],
  });
}
