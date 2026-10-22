import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { discoverFromDocuments, loadDocuments, loadKernels } from "../src/discover.mjs";
import { findRepoRoot } from "../src/paths.mjs";

function serve(root) {
  const files = {
    "/v0.1/servers/io.github.epistemedeus%2Fx402-data-gateway/versions/latest": join(
      root,
      "tools/presence/fixtures/mcp-registry-consumer/versions-latest.json",
    ),
    "/v0.1/servers": join(root, "tools/presence/fixtures/mcp-registry-consumer/search-unfiltered.json"),
    "/discovery/useful-jobs.json": join(root, "client/public/discovery/useful-jobs.json"),
    "/for-agents/useful-jobs/catalog.json": join(root, "client/public/for-agents/useful-jobs/catalog.json"),
    "/openapi.json": join(root, "fixtures/presence/catalog/openapi.json"),
    "/.well-known/x402.json": join(root, "fixtures/presence/catalog/x402.json"),
    "/listings/mcp-registry.json": join(root, "fixtures/presence/listings/mcp-registry.json"),
    "/listings/mpp-services.json": join(root, "fixtures/presence/listings/mpp-services.json"),
    "/listings/bazaar-merchant.json": join(root, "fixtures/presence/listings/bazaar-merchant.json"),
    "/search-latest.json": join(
      root,
      "tools/presence/fixtures/mcp-registry-consumer/search-version-latest.json",
    ),
  };
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const raw = req.url || "/";
      let file = null;
      if (raw.includes("versions/latest")) file = files["/v0.1/servers/io.github.epistemedeus%2Fx402-data-gateway/versions/latest"];
      else if (raw.includes("/v0.1/servers") && raw.includes("version=latest")) file = files["/search-latest.json"];
      else if (raw.includes("/v0.1/servers")) file = files["/v0.1/servers"];
      else if (raw.startsWith("/discovery/useful-jobs.json")) file = files["/discovery/useful-jobs.json"];
      else if (raw.startsWith("/for-agents/useful-jobs/catalog.json")) file = files["/for-agents/useful-jobs/catalog.json"];
      else if (raw.startsWith("/openapi.json")) file = files["/openapi.json"];
      else if (raw.includes("x402.json")) file = files["/.well-known/x402.json"];
      else if (raw.startsWith("/listings/mcp-registry.json")) file = files["/listings/mcp-registry.json"];
      else if (raw.startsWith("/listings/mpp-services.json")) file = files["/listings/mpp-services.json"];
      else if (raw.startsWith("/listings/bazaar-merchant.json")) file = files["/listings/bazaar-merchant.json"];
      if (!file) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found\n");
        return;
      }
      const body = readFileSync(file);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

test("HTTP discovery of local registry documents selects current MCP and job by identity", async () => {
  const root = findRepoRoot();
  const { server, origin } = await serve(root);
  try {
    const kernels = await loadKernels(root);
    const docs = await loadDocuments({
      repoRoot: root,
      kernels,
      mcpVersionsLatest: `${origin}/v0.1/servers/io.github.epistemedeus%2Fx402-data-gateway/versions/latest`,
      mcpSearchLatest: `${origin}/v0.1/servers?search=x402-data-gateway&version=latest`,
      mcpSearchUnfiltered: `${origin}/v0.1/servers?search=x402-data-gateway`,
      presenceMcpRegistry: `${origin}/listings/mcp-registry.json`,
      usefulJobsDiscovery: `${origin}/discovery/useful-jobs.json`,
      usefulJobsCatalog: `${origin}/for-agents/useful-jobs/catalog.json`,
      openapi: `${origin}/openapi.json`,
      x402: `${origin}/.well-known/x402.json`,
      mpp: `${origin}/listings/mpp-services.json`,
      bazaar: `${origin}/listings/bazaar-merchant.json`,
    });
    const discovery = discoverFromDocuments(docs, { jobId: "vendor-budget-impact" });
    assert.equal(discovery.mcp.current.remote, "https://agents.samedaydesk.com/mcp");
    assert.equal(discovery.mcp.current.isLatest, true);
    assert.equal(discovery.mcp.naiveFirstHitIsCurrent, false);
    assert.equal(discovery.jobs.selected.id, "vendor-budget-impact");
    assert.equal(discovery.liveOperations.extractUrl.priceUsd, "0.005");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
