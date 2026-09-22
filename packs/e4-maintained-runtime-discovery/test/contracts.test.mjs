import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { discoverOffer } from "../src/discover.mjs";
import { parseCatalogDocument, parseDiscoveryDocument, parseLlmsPointer } from "../src/parse-offer.mjs";
import { fetchSurface } from "../src/read.mjs";
import { MAX_BODY_BYTES, SITE_ORIGIN, SURFACES } from "../src/surfaces.mjs";
import { parseStdout, REPO_ROOT, runDiscover } from "./helpers.mjs";

const HEX = "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec";
const ARCHIVE = {
  path: "/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  url: `${SITE_ORIGIN}/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz`,
  sha256: HEX,
  bytes: 5255824,
};

function discoveryDoc(overrides = {}) {
  return {
    schema: "samedaydesk.for-agents.useful-jobs.v1",
    package: "useful-jobs",
    version: "1.4.7",
    jobs: ["lockfile-pin-delta"],
    archive: ARCHIVE,
    ...overrides,
  };
}

test("llms catalog.json path is not the human-page pointer", () => {
  const text = [
    `Machine discovery: ${SITE_ORIGIN}/discovery/useful-jobs.json`,
    `Catalog only: ${SITE_ORIGIN}/for-agents/useful-jobs/catalog.json`,
  ].join("\n");
  const parsed = parseLlmsPointer(text);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "llms_pointer_missing");
  assert.ok(parsed.failure.missing.includes(`${SITE_ORIGIN}/for-agents/useful-jobs`));
});

test("llms path needles on another origin are not pointers", () => {
  const text = "See https://evil.example/discovery/useful-jobs.json and https://evil.example/for-agents/useful-jobs";
  const parsed = parseLlmsPointer(text);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "llms_pointer_missing");
});

test("committed llms.txt still satisfies exact origin pointers", () => {
  const text = readFileSync(join(REPO_ROOT, SURFACES.llms.committedRel), "utf8");
  const parsed = parseLlmsPointer(text);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.failure || parsed));
});

test("document error field is explicit_document_error even when jobs exist", () => {
  const parsed = parseDiscoveryDocument(JSON.stringify(discoveryDoc({ error: "stale" })));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "explicit_document_error");
  assert.equal(parsed.offer, undefined);
});

test("missing version is invalid_document, not missing_archive", () => {
  const { version, ...rest } = discoveryDoc();
  const parsed = parseDiscoveryDocument(JSON.stringify(rest));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "invalid_document");
  assert.match(parsed.failure.message, /version/i);
});

test("duplicate discovery job ids are rejected", () => {
  const parsed = parseDiscoveryDocument(
    JSON.stringify(discoveryDoc({ jobs: ["lockfile-pin-delta", "lockfile-pin-delta"] })),
  );
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "empty_job_id");
});

test("off-origin jobsCatalogUrl is not copied into a success offer", () => {
  const parsed = parseDiscoveryDocument(
    JSON.stringify(discoveryDoc({ jobsCatalogUrl: "https://evil.example/catalog.json" })),
  );
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "invalid_document");
  assert.equal(parsed.offer, undefined);
});

test("off-origin page is not copied into a success offer", () => {
  const parsed = parseDiscoveryDocument(JSON.stringify(discoveryDoc({ page: "https://evil.example/jobs" })));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "invalid_document");
});

test("off-origin archive.url is not copied into a success offer", () => {
  const parsed = parseDiscoveryDocument(
    JSON.stringify(
      discoveryDoc({
        archive: { ...ARCHIVE, url: "https://evil.example/a.tgz" },
      }),
    ),
  );
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "invalid_document");
});

test("catalog firstOffer must be one of the catalog jobs", () => {
  const parsed = parseCatalogDocument(
    JSON.stringify({
      schema: "useful-jobs.catalog.v1",
      package: "useful-jobs",
      version: "1.4.7",
      firstOffer: "not-a-real-job",
      jobs: [{ id: "lockfile-pin-delta" }],
    }),
    ["lockfile-pin-delta"],
  );
  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure.class, "catalog_job_mismatch");
});

test("catalog missing version is catalog_invalid", async () => {
  const llms = readFileSync(join(REPO_ROOT, SURFACES.llms.committedRel), "utf8");
  const result = await discoverOffer({
    mode: "live",
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes("/discovery/useful-jobs.json")) {
        return new Response(JSON.stringify(discoveryDoc()), { status: 200 });
      }
      if (u.includes("/catalog.json")) {
        return new Response(
          JSON.stringify({
            schema: "useful-jobs.catalog.v1",
            package: "useful-jobs",
            jobs: [{ id: "lockfile-pin-delta" }],
          }),
          { status: 200 },
        );
      }
      if (u.includes("/llms.txt")) return new Response(llms, { status: 200 });
      return new Response("no", { status: 404 });
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "catalog_invalid");
});

test("catalog version drift is catalog_invalid, not catalog_job_mismatch", async () => {
  const llms = readFileSync(join(REPO_ROOT, SURFACES.llms.committedRel), "utf8");
  const result = await discoverOffer({
    mode: "live",
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes("/discovery/useful-jobs.json")) {
        return new Response(JSON.stringify(discoveryDoc()), { status: 200 });
      }
      if (u.includes("/catalog.json")) {
        return new Response(
          JSON.stringify({
            schema: "useful-jobs.catalog.v1",
            package: "useful-jobs",
            version: "9.9.9",
            jobs: [{ id: "lockfile-pin-delta" }],
          }),
          { status: 200 },
        );
      }
      if (u.includes("/llms.txt")) return new Response(llms, { status: 200 });
      return new Response("no", { status: 404 });
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "catalog_invalid");
  assert.match(result.failure.message, /version/i);
});

test("oversized live body is canceled at the first oversize chunk", async () => {
  let canceled = 0;
  const result = await fetchSurface(SURFACES.discovery, {
    fetchImpl: async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1).fill(0x61));
        },
        cancel() {
          canceled += 1;
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "body_too_large");
  assert.equal(canceled, 1);
});

test("CLI --fixture with a following flag is usage, not a path", () => {
  const proc = runDiscover(["--fixture", "--compact"]);
  const { json } = parseStdout(proc);
  assert.equal(proc.status, 2);
  assert.equal(json.ok, false);
  assert.equal(json.failure.class, "usage");
});
