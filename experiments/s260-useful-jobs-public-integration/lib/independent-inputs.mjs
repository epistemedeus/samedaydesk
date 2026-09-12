import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function write(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  const text = typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(path, text);
  return path;
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function lockfile({ name, pkgVersion, resolved, integrity }) {
  return {
    name,
    version: pkgVersion,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name, version: pkgVersion },
      [`node_modules/${name}`]: {
        version: pkgVersion,
        resolved,
        integrity,
      },
    },
  };
}

function extractBatch({ title, description, h1, jobId }) {
  return {
    ok: true,
    product: "samedaydesk-extract-batch",
    schemaVersion: "samedaydesk.extract-batch.v0",
    quote: {
      amountAtomic: "0",
      displayUsdc: "0.00",
      meaning: "Caller-owned held extract-batch. Not a live fetch or payment.",
    },
    jobId,
    jobStatus: "completed",
    stopReason: null,
    partial: false,
    sources: [
      {
        id: "item-001",
        source: "https://example.test/d15-cold/widget",
        status: "success",
        data: {
          title,
          description,
          headings: { h1: [h1], h2: ["Notes"] },
        },
        notes: [],
        error: null,
        finalUrl: "https://example.test/d15-cold/widget",
        httpStatus: 200,
        provenance: {
          transport: "held-local-sentinel",
          requestedAt: "2026-09-12T00:00:00.000Z",
          completedAt: "2026-09-12T00:00:01.000Z",
          fetchedAt: "2026-09-12T00:00:00.000Z",
          finalUrl: "https://example.test/d15-cold/widget",
          httpStatus: 200,
          note: "Disposable sentinel. Not page-content freshness.",
        },
      },
    ],
    accounting: {
      requests: 1,
      bytes: 1200,
      wallMs: 8,
      retries: 0,
      succeeded: 1,
      partial: 0,
      failed: 0,
      unknown: 0,
      skippedDuplicate: 0,
    },
    costInputs: {
      admittedBodyBytes: 1200,
      requests: 1,
      wallMs: 8,
      hostingCosts: "none",
      modelCosts: "none",
      monetaryMargin: null,
      note: "Held local sentinel; not socket billing.",
    },
    charged: false,
    boundary: {
      guaranteedUrlSuccess: false,
      introductoryPrice: false,
      sourceFetchBeforeAuthorization: false,
      automaticRetries: false,
    },
  };
}

function routeTable(routes) {
  return {
    schema: "samedaydesk.route-table.v1",
    authority: "caller",
    publishedRouteTable: false,
    note: "Independent D15 cold-customer catalog. Not the published SDS table.",
    routes,
  };
}

function listingRoutes() {
  return {
    docs: { path: "/docs", url: "https://example.test/d15/docs", status: 200, accessibility: "ok", title: "Docs" },
    pricing: { path: "/pricing", url: "https://example.test/d15/pricing", status: 200, accessibility: "ok", title: "Pricing" },
    blog: { path: "/old-blog", url: "https://example.test/d15/old-blog", status: 200, accessibility: "ok", title: "Old Blog" },
    home: { path: "/", url: "https://example.test/d15/", status: 200, accessibility: "ok", title: "Home" },
  };
}

/** Same shape as D15 cold-download-110 listingInput. */
export function listingInput({ inputId, jobRef, kind, provider = "grexal" }) {
  const identity = {
    provider,
    jobRef,
    sharedEvidenceId: jobRef,
    sourceTag: "catalog",
  };
  const r = listingRoutes();
  const completeBaseline = [r.home, r.docs, r.blog, r.pricing];
  let current;
  if (kind === "partial") {
    current = {
      label: "current-d15-partial",
      capturedAt: "2026-09-12T00:00:00.000Z",
      captureIncomplete: true,
      partialCoverage: true,
      coverageComplete: false,
      routes: [r.home, r.docs],
    };
  } else if (kind === "same") {
    current = {
      label: "current-d15-same",
      capturedAt: "2026-09-12T00:00:00.000Z",
      captureIncomplete: false,
      coverageComplete: true,
      routes: completeBaseline,
    };
  } else {
    current = {
      label: "current-d15-change",
      capturedAt: "2026-09-12T00:00:00.000Z",
      captureIncomplete: false,
      coverageComplete: true,
      routes: [
        r.home,
        {
          path: "/docs",
          url: "https://example.test/d15/docs",
          status: 301,
          finalUrl: "https://example.test/d15/documentation",
          redirectLocation: "https://example.test/d15/documentation",
          accessibility: "ok",
          title: "Docs Redirect",
        },
        { path: "/changelog", url: "https://example.test/d15/changelog", status: 200, accessibility: "ok", title: "Changelog" },
      ],
    };
  }
  const discovery = {
    captureStatus: "ok",
    catalogComplete: kind !== "partial",
    listing: {
      url: "https://example.test/d15/listing",
      agentId: "d15-cold-agent",
      listingStatus: "PUBLIC_ACTIVE",
      freeVsPriced: "discovery_free_run_priced",
    },
  };
  if (kind === "mismatch") {
    discovery.identity = {
      provider: "agensi",
      jobRef: "d15-agensi-ops-1",
      sharedEvidenceId: "d15-agensi-ops-1",
      sourceTag: "agensi",
    };
    discovery.acquisitionEvidence = [
      {
        id: "acq-agensi-presented",
        kind: "linkPresented",
        sourceTag: "agensi",
        provider: "agensi",
        linkId: "d15-agensi-pending",
        jobRef: "d15-agensi-ops-1:/docs",
        sharedEvidenceId: "d15-agensi-ops-1:/docs",
        at: "2026-09-12T00:00:00.000Z",
        impliesBuyerIntent: false,
        note: "Independent agensi snapshot must not join grexal record",
      },
    ];
  }
  return {
    schema: "pilot.s185.distribution_repair_input.v1",
    inputId,
    clock: "2026-09-12T00:00:00.000Z",
    identity,
    discovery,
    record: {
      routeRegressionInput: {
        schema: "x402.r2.record.route_regression_input.v1",
        reportId: inputId,
        feedId: inputId,
        title: kind === "partial" ? "Partial incomplete current capture (cannot prove removal)" : "D15 independent listing snapshot",
        demo: true,
        sourceLabel: "independent-cold-customer",
        baseline: {
          label: "baseline-d15",
          capturedAt: "2026-09-01T00:00:00.000Z",
          routes: completeBaseline,
        },
        current,
      },
      ...(kind === "mismatch" ? { identity } : {}),
    },
    callerProvenance: {
      suppliedBy: "cold-customer",
      syntheticFixture: true,
      notMarketFact: true,
    },
  };
}

function evidencePacket({ jobId, decision, findings }) {
  return {
    schema: "s137.consumer-evidence.packet.v1",
    jobId,
    artifactKind: "freshness-receipt",
    clock: "2026-09-12T00:00:00.000Z",
    evidenceClass: "synthetic",
    offline: true,
    payment: { attempted: false },
    cost: { assignmentSpendUsd: 0, note: "Independent cold-customer packet. Not a purchase." },
    sources: [{ id: "src-headers", kind: "http-headers", path: "local/sentinel/http-headers.json" }],
    findings,
    citations: [{ id: "cit-headers", kind: "http-headers", path: "local/sentinel/http-headers.json" }],
    decision,
    limitations: decision === "fail" ? ["identity missing (independent fail path)"] : [],
    claims: {
      inventsFacts: false,
      paidEndpoint: false,
      legalAttestation: false,
      modelAsOracle: false,
      assertsCustomerDemand: false,
    },
  };
}

const OPENAPI_BEFORE = `openapi: 3.0.3
info:
  title: D15 Cold Widget API
  version: 1.0.0
paths:
  /widgets:
    get:
      operationId: listWidgets
      responses:
        "200":
          description: list widgets
  /widgets/{id}:
    get:
      operationId: getWidget
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: one widget
`;

const OPENAPI_AFTER = `openapi: 3.0.3
info:
  title: D15 Cold Widget API
  version: 1.1.0
paths:
  /widgets:
    get:
      operationId: listWidgets
      responses:
        "200":
          description: list widgets
`;

const ATOM_BEFORE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:example.test,2026:d15-cold-feed</id>
  <title>D15 cold feed</title>
  <updated>2026-09-11T00:00:00Z</updated>
  <entry>
    <id>tag:example.test,2026:d15-entry-a</id>
    <title>Alpha note</title>
    <updated>2026-09-11T00:00:00Z</updated>
    <link href="https://example.test/d15/a"/>
  </entry>
</feed>
`;

const ATOM_AFTER = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:example.test,2026:d15-cold-feed</id>
  <title>D15 cold feed</title>
  <updated>2026-09-12T00:00:00Z</updated>
  <entry>
    <id>tag:example.test,2026:d15-entry-a</id>
    <title>Alpha note</title>
    <updated>2026-09-11T00:00:00Z</updated>
    <link href="https://example.test/d15/a"/>
  </entry>
  <entry>
    <id>tag:example.test,2026:d15-entry-b</id>
    <title>Beta note</title>
    <updated>2026-09-12T00:00:00Z</updated>
    <link href="https://example.test/d15/b"/>
  </entry>
</feed>
`;

export function ensureIndependentInputs(root) {
  mkdirSync(root, { recursive: true });

  const lockBefore = lockfile({
    name: "left-pad",
    pkgVersion: "1.3.0",
    resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
    integrity: "sha512-ixXg6toUfIZkO4l8CoeuF8oU4f1ep04EI9CmwOqAT4r5TjZOnQeQybnsj0OP5nXM0hTTN0lC+1m+gzuP89TzYoQ==",
  });
  const lockAfter = lockfile({
    name: "left-pad",
    pkgVersion: "1.3.1",
    resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.1.tgz",
    integrity: "sha512-i1vKzUvd5o0j4fRqXrtkJKwIQnXkqLh6YzX4AhNbWP9n/fPKuqFAKEPxwRTzIbluZo+dh3nYsKBQ0atcGQP+yA==",
  });

  const schemaBefore = {
    $schema: "http://json-schema.org/draft-04/schema#",
    type: "object",
    properties: {
      event: { type: "string" },
      payload: { type: "object" },
    },
  };
  const schemaAfter = {
    $schema: "http://json-schema.org/draft-04/schema#",
    type: "object",
    properties: {
      event: { type: "number" },
      payload: { type: "object" },
    },
  };

  const routesBefore = routeTable([
    { path: "/widgets", title: "Widgets", canonical: "https://example.test/widgets" },
    { path: "/docs", title: "Docs", canonical: "https://example.test/docs" },
  ]);
  const routesAfter = routeTable([
    { path: "/widgets", title: "Widgets", canonical: "https://example.test/widgets" },
    { path: "/docs", title: "Documentation", canonical: "https://example.test/docs" },
    { path: "/changelog", title: "Changelog", canonical: "https://example.test/changelog" },
  ]);

  const pageBefore = extractBatch({
    title: "Widget status",
    description: "Local widget status page.",
    h1: "Widget status",
    jobId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const pageAfter = extractBatch({
    title: "Widget status (updated)",
    description: "Local widget status page with a new heading.",
    h1: "Widget status updated",
    jobId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });

  const pricingBefore = {
    rows: [
      { field: "d15-cold-input", value: 1.5, unit: "USD/1M-tokens" },
      { field: "d15-cold-output", value: 6.0, unit: "USD/1M-tokens" },
    ],
  };
  const pricingAfter = {
    rows: [
      { field: "d15-cold-input", value: 2.5, unit: "USD/1M-tokens" },
      { field: "d15-cold-output", value: 6.0, unit: "USD/1M-tokens" },
    ],
  };

  const usedOps = {
    operations: [
      { method: "get", path: "/widgets" },
      { method: "get", path: "/widgets/{id}" },
    ],
  };

  const paths = {
    lock: {
      before: write(join(root, "lock/before.json"), lockBefore),
      afterChange: write(join(root, "lock/after-change.json"), lockAfter),
      afterSame: write(join(root, "lock/after-same.json"), lockBefore),
      html: write(join(root, "lock/not-a-lock.html"), "<html><body>not a lockfile</body></html>\n"),
    },
    schema: {
      before: write(join(root, "schema/before.json"), schemaBefore),
      afterChange: write(join(root, "schema/after-change.json"), schemaAfter),
      afterSame: write(join(root, "schema/after-same.json"), schemaBefore),
      used: write(join(root, "schema/used.json"), { pointers: ["/properties/event"] }),
      openapi: write(join(root, "schema/openapi.json"), {
        openapi: "3.0.3",
        info: { title: "D15 Cold OpenAPI", version: "1.0.0" },
        paths: {
          "/widgets": {
            get: { responses: { "200": { description: "ok" } } },
          },
        },
      }),
    },
    route: {
      before: write(join(root, "route/before.json"), routesBefore),
      afterChange: write(join(root, "route/after-change.json"), routesAfter),
      afterSame: write(join(root, "route/after-same.json"), routesBefore),
    },
    page: {},
    openapi: {
      before: write(join(root, "openapi/before.yaml"), OPENAPI_BEFORE),
      afterChange: write(join(root, "openapi/after-change.yaml"), OPENAPI_AFTER),
      afterSame: write(join(root, "openapi/after-same.yaml"), OPENAPI_BEFORE),
      used: write(join(root, "openapi/used.json"), usedOps),
    },
    pricing: {
      before: write(join(root, "pricing/before.json"), pricingBefore),
      afterChange: write(join(root, "pricing/after-change.json"), pricingAfter),
      afterSame: write(join(root, "pricing/after-same.json"), pricingBefore),
    },
    feed: {
      before: write(join(root, "feed/before.xml"), ATOM_BEFORE),
      afterChange: write(join(root, "feed/after-change.xml"), ATOM_AFTER),
      afterSame: write(join(root, "feed/after-same.xml"), ATOM_BEFORE),
    },
    evidence: {
      pass: write(
        join(root, "evidence/pass.json"),
        evidencePacket({
          jobId: "d15-cold-evidence-pass",
          decision: "pass",
          findings: [{ id: "headers-present", summary: "etag present on sentinel", citationIds: ["cit-headers"] }],
        }),
      ),
      fail: write(
        join(root, "evidence/fail.json"),
        evidencePacket({
          jobId: "d15-cold-evidence-fail",
          decision: "fail",
          findings: [],
        }),
      ),
      foreign: write(join(root, "evidence/foreign.json"), { status: "pass" }),
    },
    listing: {
      change: write(
        join(root, "listing/change.json"),
        listingInput({ inputId: "d15-listing-change", jobRef: "d15-listing-change", kind: "change" }),
      ),
      same: write(
        join(root, "listing/same.json"),
        listingInput({ inputId: "d15-listing-same", jobRef: "d15-listing-same", kind: "same" }),
      ),
      partial: write(
        join(root, "listing/partial.json"),
        listingInput({ inputId: "d15-listing-partial", jobRef: "d15-listing-partial", kind: "partial" }),
      ),
      mismatch: write(
        join(root, "listing/mismatch.json"),
        listingInput({ inputId: "d15-listing-mismatch", jobRef: "d15-listing-mismatch", kind: "mismatch" }),
      ),
    },
  };

  paths.page.jobChange = write(join(root, "page-job-local/job.json"), {
    id: "d15-page-change",
    title: "Independent widget title watch",
    clock: "2026-09-12T00:00:00.000Z",
    fields: ["title", "description", "headings"],
    limits: { maxStaleMs: 86400000 },
    before: "./before.json",
    after: "./after.json",
  });
  write(join(root, "page-job-local/before.json"), pageBefore);
  write(join(root, "page-job-local/after.json"), pageAfter);

  paths.page.jobSame = write(join(root, "page-job-same/job.json"), {
    id: "d15-page-same",
    title: "Independent widget no-change watch",
    clock: "2026-09-12T00:00:00.000Z",
    fields: ["title", "description", "headings"],
    limits: { maxStaleMs: 86400000 },
    before: "./before.json",
    after: "./after.json",
  });
  write(join(root, "page-job-same/before.json"), pageBefore);
  write(join(root, "page-job-same/after.json"), pageBefore);

  const repeatBeforeText = `${JSON.stringify(pricingBefore, null, 2)}\n`;
  const repeatAfterText = `${JSON.stringify(pricingAfter, null, 2)}\n`;
  write(join(root, "repeat/files/before.json"), repeatBeforeText);
  write(join(root, "repeat/files/after.json"), repeatAfterText);
  const nextRun = {
    recipeId: "pricing-row-unit",
    family: "pricing-row-unit",
    parser: "s134-pricing-table-change",
    inputs: { before: "./before.json", after: "./after.json" },
    retain: ["units", "coverage"],
    schema: "s176.next-run-manifest.v1",
    currentInputs: {
      before: {
        path: "./before.json",
        bytes: Buffer.byteLength(repeatBeforeText),
        sha256: sha256Text(repeatBeforeText),
        observedAt: "2026-09-12T00:00:00.000Z",
        attribution: "independent cold-customer",
      },
      after: {
        path: "./after.json",
        bytes: Buffer.byteLength(repeatAfterText),
        sha256: sha256Text(repeatAfterText),
        observedAt: "2026-09-12T00:00:00.000Z",
        attribution: "independent cold-customer",
      },
      used: null,
    },
    paidValueClaim: false,
    freeOffline: true,
  };
  paths.repeat = {
    nextRun: write(join(root, "repeat/files/next-run.json"), nextRun),
    nextRunMismatch: write(join(root, "repeat/mismatch/next-run.json"), {
      ...nextRun,
      currentInputs: {
        ...nextRun.currentInputs,
        after: {
          ...nextRun.currentInputs.after,
          path: "./after.json",
          sha256: "0".repeat(64),
        },
      },
    }),
    filesDir: join(root, "repeat/files"),
  };
  write(join(root, "repeat/mismatch/before.json"), repeatBeforeText);
  write(join(root, "repeat/mismatch/after.json"), repeatAfterText);

  return paths;
}
