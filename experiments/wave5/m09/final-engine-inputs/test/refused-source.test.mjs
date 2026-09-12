import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CASES_ROOT } from "../lib/paths.mjs";
import { resolveKit } from "../lib/kit.mjs";
import { materializeCases } from "../lib/materialize.mjs";
import { CLOCK } from "../lib/corpus.mjs";
import { runShipped } from "../lib/run-shipped.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("live URL input is refused; loopback snapshot server is not contacted", async () => {
  materializeCases();
  const kit = resolveKit();
  const heldAfter = join(CASES_ROOT, "number-date-status-leaderboard", "after.json");
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(readFileSync(heldAfter));
  });
  const address = await listen(server);
  const url = `http://127.0.0.1:${address.port}/before.json`;
  try {
    const outDir = mkdtempSync(join(tmpdir(), "m09-fei-live-"));
    const spawn = runShipped(kit, [
      "compare",
      "--before",
      url,
      "--after",
      heldAfter,
      "--fields",
      "title,description",
      "--clock",
      CLOCK,
      "--out-dir",
      outDir,
    ]);
    assert.equal(spawn.exitCode, 2, spawn.stderr || spawn.stdout);
    assert.equal(spawn.errBody?.code, "live_fetch_url");
    assert.equal(hits.length, 0);
  } finally {
    await close(server);
  }
});
