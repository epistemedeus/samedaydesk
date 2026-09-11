import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { co12Catalog, mapApiRowsToCo12 } from "../lib/catalogs.mjs";
import { QUERY_PROBE } from "../lib/pins.mjs";
import { runRouteDiffCli } from "../lib/run-engine.mjs";
import { closeServer, observeApi, startSdsApi } from "../lib/http.mjs";
import { tmpDir, writeJson } from "./helpers.mjs";

test("live SDS52 /mcp is GET and POST; Co12 path identity refuses the honest API table", async (t) => {
  const api = await startSdsApi();
  t.after(() => closeServer(api.server));
  const observed = await observeApi(api.origin);
  const byId = Object.fromEntries(observed.map((row) => [row.id, row]));

  assert.equal(byId["mcp-get"].status, 200);
  assert.match(byId["mcp-get"].bodyPreview, /Streamable HTTP/);
  assert.equal(byId["mcp-post-empty"].status, 202);
  assert.equal(byId["mcp-post-initialize"].status, 200);
  assert.match(byId["mcp-post-initialize"].bodyPreview, /"protocolVersion":"2024-11-05"/);
  assert.equal(byId["mcp-query"].status, 200);
  assert.ok(byId["mcp-query"].bodyPreview.includes(QUERY_PROBE));
  assert.notEqual(byId["mcp-get"].bodyPreview, byId["mcp-query"].bodyPreview);
  assert.equal(byId["mcp-options"].status, 204);
  assert.equal(byId.health.status, 200);
  assert.match(byId.health.bodyPreview, /"service":"samedaydesk"/);
  assert.equal(byId["api-miss"].status, 404);
  assert.equal(byId["agent-card"].status, 308);
  assert.equal(byId["agent-card"].location, "https://agents.samedaydesk.com/.well-known/agent-card.json");

  const dir = tmpDir("w5-m17-mcp-");
  const mapped = co12Catalog(mapApiRowsToCo12([
    { method: "GET", path: "/mcp" },
    { method: "POST", path: "/mcp" },
  ]));
  const spaLike = co12Catalog([mapped.routes[0]]);
  const after = writeJson(dir, "after.json", mapped);
  const before = writeJson(dir, "before.json", spaLike);
  const result = runRouteDiffCli({ before, after, outDir: join(dir, "out") });
  assert.equal(result.status, 2);
  assert.equal(result.classification.kind, "analysis_refusal");
  assert.equal(result.classification.code, "duplicate_path");
  assert.equal(result.json.refused, true);
});
