import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveEngine } from "../lib/engine.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("live local HTTP $ref is refused with zero fetches", async () => {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(`${JSON.stringify({ type: "number" })}\n`);
  });
  const port = await listen(server);
  try {
    const engine = resolveEngine();
    const dir = mkdtempSync(join(tmpdir(), "w5-m06-http-"));
    const href = `http://127.0.0.1:${port}/num.json`;
    const doc = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { amount: { $ref: href } },
      required: ["amount"],
    };
    const before = join(dir, "before.json");
    const after = join(dir, "after.json");
    const used = join(dir, "used.json");
    writeFileSync(before, `${JSON.stringify(doc)}\n`);
    writeFileSync(after, `${JSON.stringify(doc)}\n`);
    writeFileSync(used, `${JSON.stringify({ pointers: ["/properties/amount"] })}\n`);
    const outDir = join(dir, "out");
    const spawned = spawnSync(
      process.execPath,
      [engine.bin, "--before", before, "--after", after, "--used", used, "--out-dir", outDir],
      { encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(spawned.status, 2, spawned.stdout);
    const payload = JSON.parse(String(spawned.stdout).trim().split(/\n/).at(-1));
    assert.equal(payload.ok, false);
    assert.equal(payload.refused, true);
    assert.equal(payload.code, "remote-ref-refused");
    assert.equal(payload.customerBrief, false);
    assert.equal(existsSync(join(outDir, "drift-brief.json")), false);
    assert.equal(hits, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
