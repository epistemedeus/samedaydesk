#!/usr/bin/env node
/** Stamp ≥30 fixtures (≥6 adversarial) for the 1.4.7 listing-repair oracle. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_CLOCK_ISO,
  OK_LISTING_URL,
  PACKET_AS_OF_ISO,
  PACKET_SCHEMA,
  SOURCE_SCHEMA,
  STALE_AS_OF_ISO,
  STALE_OBSERVED_AT_ISO,
} from "./constants.mjs";
import { snapshotDigest } from "./digest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function write(rel, value) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`);
  return rel;
}

const okSnapshot = {
  url: OK_LISTING_URL,
  agentId: "agent-alpha",
  listingStatus: "PendingReview",
  title: "Operator Alpha",
  freeVsPriced: "discovery_free_run_priced",
  routes: {
    "/changelog": { path: "/changelog", present: true },
    "/docs": { path: "/docs", present: true },
    "/pricing": { path: "/pricing", present: true },
  },
};
const okDigest = snapshotDigest(okSnapshot);

function sourceOf(file, snapshot, observedAt = DEMO_CLOCK_ISO, url = OK_LISTING_URL) {
  const out = { schema: SOURCE_SCHEMA };
  if (typeof url === "string" && url.trim()) out.url = url.trim();
  out.file = file;
  out.observedAt = observedAt;
  out.digest = snapshotDigest(snapshot);
  out.snapshot = snapshot;
  return out;
}

function packetShell(extra) {
  return {
    schema: PACKET_SCHEMA,
    appId: "listing-repair-packet",
    status: "actionable",
    summary: "Listing repair packet status=diagnosed",
    actions: [
      {
        priority: "high",
        kind: "owner-repair",
        note: "listingStatus: PendingReview → PUBLIC_ACTIVE (source-bound field correction)",
        sourceRefs: ["field:listingStatus"],
        field: "listingStatus",
        from: "PendingReview",
        to: "PUBLIC_ACTIVE",
      },
    ],
    gaps: ["Route repair is owner guidance — not invented revenue or lost-customer proof"],
    notMarketFact: true,
    notCustomerDemand: true,
    noPurchaseAuthority: true,
    caller: {
      exampleMode: false,
      sampleLabel: "caller-input",
      notMarketFact: true,
      notCustomerDemand: true,
    },
    underlying: { tool: "distribution-repair", status: "diagnosed", ok: true },
    generatedAt: DEMO_CLOCK_ISO,
    sourceLinked: true,
    asOf: PACKET_AS_OF_ISO,
    sourceObservation: {
      url: OK_LISTING_URL,
      file: "fixtures/ok/ok-source.json",
      observedAt: DEMO_CLOCK_ISO,
      digest: okDigest,
    },
    claimedLane: "suggestion",
    evidence: true,
    suggestion: true,
    publish: false,
    ...extra,
  };
}

const files = [];

// --- sources ---
files.push(write("fixtures/ok/ok-source.json", sourceOf("fixtures/ok/ok-source.json", okSnapshot)));

const newerSnapshot = { ...okSnapshot, title: "Operator Alpha (refreshed capture)" };
files.push(write("fixtures/ok/newer-source.json", sourceOf("fixtures/ok/newer-source.json", newerSnapshot, "2026-09-11T16:00:00.000Z")));

const alreadyCorrectSnapshot = { ...okSnapshot, listingStatus: "PUBLIC_ACTIVE" };
files.push(
  write(
    "fixtures/reject/already-correct.source.json",
    sourceOf("fixtures/reject/already-correct.source.json", alreadyCorrectSnapshot),
  ),
);
files.push(
  write(
    "fixtures/reject/stale-observed-at.source.json",
    sourceOf("fixtures/reject/stale-observed-at.source.json", okSnapshot, STALE_OBSERVED_AT_ISO),
  ),
);

// --- ok packets ---
files.push(write("fixtures/ok/ok.packet.json", packetShell({})));
files.push(
  write(
    "fixtures/ok/ok-route.packet.json",
    packetShell({
      actions: [
        {
          priority: "high",
          kind: "owner-repair",
          note: "/docs: update_listed_route_or_redirect_target",
          sourceRefs: ["route:/docs"],
        },
      ],
    }),
  ),
);
files.push(
  write(
    "fixtures/ok/ok-multi-action.packet.json",
    packetShell({
      actions: [
        {
          priority: "high",
          kind: "owner-repair",
          note: "listingStatus fix",
          sourceRefs: ["field:listingStatus"],
          field: "listingStatus",
          from: "PendingReview",
          to: "PUBLIC_ACTIVE",
        },
        {
          priority: "medium",
          kind: "review-diagnosis",
          note: "Inspect joined acquisition links",
          sourceRefs: ["route:/pricing"],
        },
      ],
    }),
  ),
);
files.push(
  write(
    "fixtures/ok/ok-partial-status.packet.json",
    packetShell({
      status: "partial",
      actions: [
        {
          priority: "high",
          kind: "complete-capture",
          note: "Partial/incomplete inputs; cannot claim global unlisting",
        },
      ],
      claimedLane: "suggestion",
    }),
  ),
);
files.push(
  write(
    "fixtures/ok/ok-refused-status.packet.json",
    packetShell({
      status: "refused",
      actions: [
        {
          priority: "high",
          kind: "fix-identity-or-source-join",
          note: "Mismatched or refused join; do not invent identity",
        },
      ],
    }),
  ),
);
files.push(
  write(
    "fixtures/ok/ok-resolve-unknown.packet.json",
    packetShell({
      actions: [{ priority: "medium", kind: "resolve-unknown", note: "route:/docs: unknown redirect target" }],
    }),
  ),
);

// --- reject core (acceptance commands) ---
files.push(
  write(
    "fixtures/reject/stale-observed-at.packet.json",
    packetShell({ asOf: STALE_AS_OF_ISO, sourceObservation: {
      url: OK_LISTING_URL,
      file: "fixtures/reject/stale-observed-at.source.json",
      observedAt: STALE_OBSERVED_AT_ISO,
      digest: okDigest,
    }}),
  ),
);
files.push(
  write(
    "fixtures/reject/fabricated-sample.packet.json",
    packetShell({
      caller: { exampleMode: true, sampleLabel: "explicit-example", notMarketFact: true, notCustomerDemand: true },
      claimedLane: "accepted_correction",
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/publish-attempt.packet.json",
    packetShell({
      publish: true,
      publishTo: "https://samedaydesk.com/for-agents/useful-jobs/catalog.json",
      claimedLane: "publish",
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/invented-field.packet.json",
    packetShell({
      actions: [
        {
          priority: "high",
          kind: "owner-repair",
          note: "invented revenue field",
          sourceRefs: ["field:inventedRevenueUsd"],
          field: "inventedRevenueUsd",
          from: 0,
          to: 99999,
        },
      ],
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/noop.packet.json",
    packetShell({
      actions: [
        {
          priority: "high",
          kind: "owner-repair",
          note: "no-op already correct",
          sourceRefs: ["field:listingStatus"],
          field: "listingStatus",
          from: "PUBLIC_ACTIVE",
          to: "PUBLIC_ACTIVE",
        },
      ],
      sourceObservation: {
        url: OK_LISTING_URL,
        file: "fixtures/reject/already-correct.source.json",
        observedAt: DEMO_CLOCK_ISO,
        digest: snapshotDigest(alreadyCorrectSnapshot),
      },
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/missing-source.packet.json",
    packetShell({ sourceObservation: undefined }),
  ),
);
files.push(
  write(
    "fixtures/reject/legacy-corrections-only.packet.json",
    packetShell({
      actions: [],
      corrections: [{ field: "listingStatus", from: "PendingReview", to: "PUBLIC_ACTIVE" }],
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/empty-actions-actionable.packet.json",
    packetShell({ actions: [], status: "actionable" }),
  ),
);
files.push(
  write(
    "fixtures/reject/stale-digest.packet.json",
    packetShell({}), // same packet vs newer-source
  ),
);
files.push(
  write(
    "fixtures/reject/from-mismatch.packet.json",
    packetShell({
      actions: [
        {
          priority: "high",
          kind: "owner-repair",
          note: "from does not match source",
          sourceRefs: ["field:listingStatus"],
          field: "listingStatus",
          from: "WRONG_STATUS",
          to: "PUBLIC_ACTIVE",
        },
      ],
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/invalid-kind.packet.json",
    packetShell({
      actions: [{ priority: "high", kind: "deploy-catalog", note: "not an owner-repair kind" }],
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/route-ref-missing.packet.json",
    packetShell({
      actions: [
        {
          priority: "high",
          kind: "owner-repair",
          note: "route not in snapshot",
          sourceRefs: ["route:/does-not-exist"],
        },
      ],
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/forbidden-completion.packet.json",
    packetShell({ completionLabel: "actual_completion", notes: ["actual_completion"] }),
  ),
);
files.push(
  write(
    "fixtures/reject/locator-mismatch.packet.json",
    packetShell({
      sourceObservation: {
        url: "https://example.test/listing/OTHER",
        file: "fixtures/ok/ok-source.json",
        observedAt: DEMO_CLOCK_ISO,
        digest: okDigest,
      },
    }),
  ),
);
files.push(
  write(
    "fixtures/reject/live-write-flag.packet.json",
    packetShell({ liveWrite: "https://samedaydesk.com/api/catalog", networkPublish: true }),
  ),
);

// sample copy of example shape
files.push(
  write(
    "fixtures/sample/example-packet.json",
    packetShell({
      caller: { exampleMode: true, sampleLabel: "explicit-example" },
      claimedLane: "accepted_correction",
    }),
  ),
);

// --- adversarial (≥6) ---
const adversarial = [
  ["adv-claim-publish-lane.packet.json", packetShell({ claimedLane: "publish", publish: false, sdsWrite: "https://samedaydesk.com/x" })],
  ["adv-sample-label-only.packet.json", packetShell({ caller: { exampleMode: false, sampleLabel: "SAMPLE" }, claimedLane: "accepted_correction" })],
  ["adv-synthetic-fixture.packet.json", packetShell({ labelledSample: true, callerProvenance: { syntheticFixture: true, sampleLabel: "sample" } })],
  ["adv-purchase-authority-true.packet.json", packetShell({ purchaseAuthority: true, noPurchaseAuthority: false })],
  ["adv-market-fact-lie.packet.json", packetShell({ notMarketFact: false, notCustomerDemand: false, summary: "Proven customer demand + lost revenue $50k" })],
  ["adv-global-unlist-claim.packet.json", packetShell({
    actions: [{ priority: "high", kind: "owner-repair", note: "Globally unlisted from all catalogs forever", sourceRefs: ["route:/docs"] }],
    gaps: [],
    summary: "Global unlisting achieved",
    notMarketFact: true,
  })],
  ["adv-digest-tamper.packet.json", packetShell({
    sourceObservation: {
      url: OK_LISTING_URL,
      file: "fixtures/ok/ok-source.json",
      observedAt: DEMO_CLOCK_ISO,
      digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
  })],
  ["adv-https-source-in-packet.packet.json", packetShell({
    publishTo: "https://samedaydesk.com/for-agents/useful-jobs",
  })],
];

for (const [name, body] of adversarial) {
  files.push(write(`fixtures/adversarial/${name}`, body));
}

// extra ok/reject to clear 30 case bar (each packet+paired source case counts)
const extras = [
  ["fixtures/ok/ok-informational.packet.json", packetShell({ status: "informational", actions: [{ priority: "medium", kind: "review-diagnosis", note: "informational only" }] })],
  ["fixtures/reject/missing-actions-informational.packet.json", packetShell({ status: "informational", actions: [] })],
  ["fixtures/reject/corrections-and-empty-actions.packet.json", packetShell({
    actions: [],
    corrections: [{ field: "title", from: "Operator Alpha", to: "Renamed" }],
  })],
  ["fixtures/reject/labelled-sample-unlabelled.packet.json", packetShell({
    labelledSample: true,
    caller: { exampleMode: false, sampleLabel: "caller-input", notMarketFact: true, notCustomerDemand: true },
  })],
  ["fixtures/reject/observed-at-mismatch.packet.json", packetShell({
    sourceObservation: {
      url: OK_LISTING_URL,
      file: "fixtures/ok/ok-source.json",
      observedAt: "2026-09-11T11:00:00.000Z",
      digest: okDigest,
    },
  })],
];
for (const [rel, body] of extras) files.push(write(rel, body));

const emptyRoutesSnapshot = {
  url: OK_LISTING_URL,
  agentId: "agent-alpha",
  listingStatus: "PendingReview",
  title: "Operator Alpha",
  freeVsPriced: "discovery_free_run_priced",
};
const emptyRoutesDigest = snapshotDigest(emptyRoutesSnapshot);
files.push(
  write(
    "fixtures/reject/empty-routes.source.json",
    sourceOf("fixtures/reject/empty-routes.source.json", emptyRoutesSnapshot),
  ),
);
files.push(
  write(
    "fixtures/reject/empty-routes.packet.json",
    packetShell({
      actions: [
        {
          priority: "high",
          kind: "owner-repair",
          note: "/docs: update_listed_route_or_redirect_target",
          sourceRefs: ["route:/docs"],
        },
      ],
      sourceObservation: {
        url: OK_LISTING_URL,
        file: "fixtures/reject/empty-routes.source.json",
        observedAt: DEMO_CLOCK_ISO,
        digest: emptyRoutesDigest,
      },
    }),
  ),
);

files.push(
  write(
    "fixtures/reject/decoy/ok-source.json",
    sourceOf("fixtures/reject/decoy/ok-source.json", okSnapshot, DEMO_CLOCK_ISO, null),
  ),
);
files.push(
  write(
    "fixtures/reject/basename-locator.packet.json",
    packetShell({
      sourceObservation: {
        file: "fixtures/ok/ok-source.json",
        observedAt: DEMO_CLOCK_ISO,
        digest: okDigest,
      },
    }),
  ),
);

writeFileSync(join(root, "fixtures/MANIFEST.json"), JSON.stringify({
  schema: "sds.listing_repair_verifier.fixtures.v1",
  stampedAt: new Date().toISOString(),
  files,
  counts: {
    files: files.length,
    ok: files.filter((f) => f.includes("/ok/")).length,
    reject: files.filter((f) => f.includes("/reject/")).length,
    adversarial: files.filter((f) => f.includes("/adversarial/")).length,
    cold: files.filter((f) => f.includes("/cold/")).length,
    sample: files.filter((f) => f.includes("/sample/")).length,
  },
  note: "Fixture cases for Helm bar: each *.packet.json is a case; sources are supporting.",
}, null, 2) + "\n");

console.log(JSON.stringify({ stamped: files.length, files }, null, 2));
