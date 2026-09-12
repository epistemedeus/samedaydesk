import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { sha256Bytes } from "../lib/hash.mjs";
import { createDiscoveryServer, hostedEvidenceFiles, listenDiscoveryServer } from "../lib/http.mjs";
import { REPO_ROOT, discoverTo, ownedTmp } from "./helpers.mjs";

test("loopback HTTP discovery serves exact body identity", async () => {
  const dir = ownedTmp();
  const discoveryPath = join(dir, "discovery.json");
  const discovered = discoverTo(discoveryPath);
  assert.equal(discovered.status, 0, discovered.stderr);
  const bytes = readFileSync(discoveryPath);
  const extra = hostedEvidenceFiles(REPO_ROOT);
  const { server, discoverySha256 } = createDiscoveryServer({ discoveryBytes: bytes, extraFiles: extra });
  const { origin } = await listenDiscoveryServer(server, { host: "127.0.0.1", port: 0 });
  try {
    const res = await fetch(`${origin}/discovery.json`);
    assert.equal(res.status, 200);
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(sha256Bytes(body), discoverySha256);
    assert.equal(res.headers.get("x-content-sha256"), discoverySha256);
    const doc = JSON.parse(body.toString("utf8"));
    assert.equal(doc.jobId, "lockfile-pin-delta");
    assert.equal(doc.chain.status, "linked");

    const openapi = await fetch(`${origin}/hosted/openapi.json`);
    assert.equal(openapi.status, 200);
    const openapiBytes = Buffer.from(await openapi.arrayBuffer());
    assert.equal(sha256Bytes(openapiBytes), doc.identity.merchant.openapiSha256);

    const post = await fetch(`${origin}/discovery.json`, { method: "POST" });
    assert.equal(post.status, 405);
  } finally {
    server.close();
  }
});
