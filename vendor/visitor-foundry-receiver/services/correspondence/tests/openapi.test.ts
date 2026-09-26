import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.dirname(fileURLToPath(import.meta.url));

test("OpenAPI documents the implemented correspondence routes", () => {
  const document = JSON.parse(readFileSync(path.join(root, "../openapi.json"), "utf8"));
  assert.equal(document.openapi, "3.1.0");
  assert.deepEqual(Object.keys(document.paths).sort(), [
    "/healthz",
    "/v1/projects",
    "/v1/projects/{projectId}",
    "/v1/projects/{projectId}/events",
    "/v1/projects/{projectId}/grants",
    "/v1/projects/{projectId}/grants/{grantId}",
  ]);
  assert.equal(document.paths["/v1/projects"].post.parameters[0].name, "Idempotency-Key");
  assert.match(document.info.description, /does not execute instructions/i);
  assert.match(JSON.stringify(document), /stored without fetching/i);
  const serverUrls = document.servers.map((server) => server.url);
  assert.ok(serverUrls.includes("https://correspondence.example.invalid"));
  assert.ok(serverUrls.includes("https://correspondence.example.invalid/api/correspondence"));
  assert.equal(document.paths["/healthz"] != null, true);
  assert.match(document.servers[1].description, /must include \/api\/correspondence/);
});
