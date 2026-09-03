import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";

import { CANONICAL_RESOURCES } from "../lib/canonical-resources.js";
import {
  CANONICAL_SURFACE,
  DISTRIBUTION_SURFACES,
  listingMountPath,
} from "../lib/distribution-surfaces.js";
import {
  listingCatalog,
  mountListingCatalog,
  mountResourceAliases,
  resolveListingPath,
} from "../lib/resource-aliases.js";
import {
  createSettlementReceiptRecord,
  recordSettlementReceipt,
  resetSettlementReceipts,
  settlementReceiptFromListing,
} from "../lib/settlement-receipt.js";
import mcpRouter from "../routes/mcp.js";
import scanRouter from "../routes/scan.js";
import toolsRouter from "../routes/tools.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const INSTRUCTIONS_PATH = join(ROOT, "docs/per-surface-listing-updates.md");

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function request(port, path, { method = "GET", body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        accept: "application/json, text/plain, */*",
        ...(encoded ? { "content-type": "application/json", "content-length": Buffer.byteLength(encoded) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          type: res.headers["content-type"] || "",
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (encoded) req.write(encoded);
    req.end();
  });
}

let server;
let port;

before(async () => {
  resetSettlementReceipts();
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/mcp", mcpRouter);
  app.use("/scan", scanRouter);
  app.use("/api/tools", toolsRouter);
  mountResourceAliases(app, {
    mcp: mcpRouter,
    scan: scanRouter,
    tools: toolsRouter,
  });
  mountListingCatalog(app);
  ({ server, port } = await listen(app));
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  resetSettlementReceipts();
});

test("every distribution surface has a distinct listing path for each canonical resource", () => {
  const seen = new Set();
  for (const resource of CANONICAL_RESOURCES) {
    for (const surface of DISTRIBUTION_SURFACES) {
      const path = listingMountPath(surface, resource.path);
      assert.equal(path.startsWith(`/listings/${surface}/`), true, path);
      assert.notEqual(path, resource.path);
      assert.equal(seen.has(path), false, `duplicate listing path ${path}`);
      seen.add(path);
    }
  }
  assert.equal(seen.size, CANONICAL_RESOURCES.length * DISTRIBUTION_SURFACES.length);
});

test("alias resolver maps each surface listing back to the canonical resource", () => {
  for (const resource of CANONICAL_RESOURCES) {
    const canonical = resolveListingPath(resource.path);
    assert.equal(canonical.ok, true);
    assert.equal(canonical.surface, CANONICAL_SURFACE);
    assert.equal(canonical.resource.id, resource.id);

    for (const surface of DISTRIBUTION_SURFACES) {
      const resolved = resolveListingPath(listingMountPath(surface, resource.path));
      assert.equal(resolved.ok, true, `${surface} ${resource.id}`);
      assert.equal(resolved.surface, surface);
      assert.equal(resolved.resource.id, resource.id);
      assert.equal(resolved.canonicalPath, resource.path);
    }
  }
});

test("unknown listing surfaces and resources do not resolve", () => {
  assert.equal(resolveListingPath("/listings/not-a-surface/mcp").ok, false);
  assert.equal(resolveListingPath("/listings/bazaar/no-such-resource").ok, false);
  assert.equal(resolveListingPath("/dashboard").ok, false);
});

test("alias GET /mcp routes resolve to the same handler as the canonical MCP surface", async () => {
  const canonical = await request(port, "/mcp");
  assert.equal(canonical.status, 200);
  assert.match(canonical.body, /samedaydesk agent tools MCP server/);

  for (const surface of DISTRIBUTION_SURFACES) {
    const aliased = await request(port, listingMountPath(surface, "/mcp"));
    assert.equal(aliased.status, 200, surface);
    assert.equal(aliased.body, canonical.body);
    assert.equal(aliased.type, canonical.type);
  }
});

test("alias POST /mcp tools/list reuses the canonical MCP handler", async () => {
  const payload = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const canonical = await request(port, "/mcp", { method: "POST", body: payload });
  assert.equal(canonical.status, 200);
  const canonicalJson = JSON.parse(canonical.body);
  assert.ok(Array.isArray(canonicalJson.result?.tools));
  assert.equal(canonicalJson.result.tools.length > 0, true);

  for (const surface of ["bazaar", "mcp-registry", "agentcash"]) {
    const aliased = await request(port, listingMountPath(surface, "/mcp"), { method: "POST", body: payload });
    assert.equal(aliased.status, 200, surface);
    assert.deepEqual(JSON.parse(aliased.body), canonicalJson);
  }
});

test("alias GET /scan routes resolve to the same handler as the canonical scan page", async () => {
  const canonical = await request(port, "/scan");
  assert.equal(canonical.status, 200);
  assert.match(canonical.body, /AI-search readiness/i);

  const aliased = await request(port, listingMountPath("x402jobs", "/scan"));
  assert.equal(aliased.status, 200);
  assert.equal(aliased.body, canonical.body);
});

test("listing catalog endpoint enumerates every surface path", async () => {
  const response = await request(port, "/listings");
  assert.equal(response.status, 200);
  const catalog = JSON.parse(response.body);
  assert.deepEqual(catalog.surfaces, [...DISTRIBUTION_SURFACES]);
  assert.equal(catalog.resources.length, CANONICAL_RESOURCES.length);
  for (const resource of catalog.resources) {
    for (const surface of DISTRIBUTION_SURFACES) {
      assert.match(resource.listings[surface], new RegExp(`/listings/${surface}${resource.canonicalPath}$`));
    }
  }
});

test("unknown listing paths stay 404 and do not leak a handler", async () => {
  const unknownSurface = await request(port, "/listings/not-a-surface/mcp");
  assert.equal(unknownSurface.status, 404);
  const unknownResource = await request(port, listingMountPath("mppscan", "/nope"));
  assert.equal(unknownResource.status, 404);
});

test("settlement receipts require and retain a surface field", () => {
  resetSettlementReceipts();
  const receipt = recordSettlementReceipt({
    surface: "bazaar",
    resourceId: "mcp",
    listingPath: listingMountPath("bazaar", "/mcp"),
    amountAtomic: "3900",
  });
  assert.equal(receipt.surface, "bazaar");
  assert.equal(Object.hasOwn(receipt, "surface"), true);
  assert.equal(receipt.resourceId, "mcp");
  assert.equal(receipt.canonicalPath, "/mcp");
  assert.equal(receipt.listingPath, "/listings/bazaar/mcp");

  assert.throws(
    () => createSettlementReceiptRecord({ resourceId: "mcp", listingPath: "/mcp" }),
    /surface/,
  );
  assert.throws(
    () => createSettlementReceiptRecord({
      surface: "not-a-surface",
      resourceId: "mcp",
      listingPath: "/listings/not-a-surface/mcp",
    }),
    /surface/,
  );
});

test("a settlement through an alias records that surface on the receipt", () => {
  resetSettlementReceipts();
  for (const surface of DISTRIBUTION_SURFACES) {
    const resolved = resolveListingPath(listingMountPath(surface, "/mcp"));
    const receipt = settlementReceiptFromListing(resolved, { amountAtomic: "10000" });
    assert.equal(receipt.surface, surface);
    assert.equal(receipt.listingPath, listingMountPath(surface, "/mcp"));
    assert.equal(receipt.canonicalPath, "/mcp");
  }

  const canonical = listingCatalog();
  assert.equal(canonical.resources[0].listings.agent402.includes("/listings/agent402/mcp"), true);
});

test("per-registry listing update instructions are present in repo docs", () => {
  assert.equal(existsSync(INSTRUCTIONS_PATH), true, INSTRUCTIONS_PATH);
  const markdown = readFileSync(INSTRUCTIONS_PATH, "utf8");
  for (const surface of DISTRIBUTION_SURFACES) {
    assert.match(markdown, new RegExp(surface));
    assert.match(markdown, new RegExp(`/listings/${surface}/`));
  }
  assert.match(markdown, /surface/);
});
