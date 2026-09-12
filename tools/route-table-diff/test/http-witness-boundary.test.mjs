import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { loadCatalogDocument } from "../lib/catalog.mjs";
for (const [pattern, paths] of [
  ["/x\\?y", ["/x?y", "/x%3Fy"]],
  ["/x#y", ["/x#y", "/x%23y"]],
  ["/space here", ["/space here", "/space%20here"]],
]) test("refuse a literal with no HTTP-safe collision witness: " + pattern, async () => {
  const app = express();
  app.get(pattern, (req, res) => res.status(204).end());
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  try {
    for (const path of paths) assert.equal((await fetch("http://127.0.0.1:" + server.address().port + path)).status, 404);
    const raw = { framework: { name: "express", major: 5 }, settings: { caseSensitive: false, strict: false }, routes: [{ method: "GET", path: pattern }, { method: "GET", path: pattern }] };
    assert.throws(() => loadCatalogDocument(raw, "memory://http-witness"), (e) => e.code === "unsupported_express_path");
  } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});
