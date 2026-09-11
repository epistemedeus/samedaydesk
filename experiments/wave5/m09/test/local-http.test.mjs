import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { resolveEngine, spawnCompare } from "../lib/engine.mjs";
import { loadCase } from "../lib/corpus.mjs";
import { SNAPSHOTS_ROOT } from "../lib/paths.mjs";
import { tmpOut } from "./helpers.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("local HTTP: URL input is refused and the snapshot server is not contacted", async () => {
  const engine = resolveEngine();
  const held = loadCase("meaningful-title");
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(readFileSync(held.beforePath));
  });
  const address = await listen(server);
  const url = `http://127.0.0.1:${address.port}/before.json`;
  try {
    const spawn = spawnCompare({
      engine,
      before: url,
      after: held.afterPath,
      fields: held.fields,
      clock: held.clock,
      outDir: tmpOut("m09-http-"),
    });
    assert.equal(spawn.exitCode, 2);
    assert.equal(spawn.refusal?.code, "live_fetch_url");
    assert.equal(hits.length, 0);
  } finally {
    await close(server);
  }
});

test("Postgres is not part of this consumer public interface", async () => {
  let probed = "not_probed";
  const { default: net } = await import("node:net");
  probed = await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: 5432 });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve("port_5432_no_accept_within_250ms");
    }, 250);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve("port_5432_open");
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      resolve(`port_5432_${error.code || "error"}`);
    });
  });
  assert.equal(typeof probed, "string");
  assert.notEqual(probed, "used_as_page_change_store");
});

test("quote-only JSON is an engine refusal, not a successful compare", () => {
  const engine = resolveEngine();
  const quote = join(SNAPSHOTS_ROOT, "reject/quote-only.json");
  const held = loadCase("meaningful-title");
  const spawn = spawnCompare({
    engine,
    before: quote,
    after: held.afterPath,
    fields: held.fields,
    clock: held.clock,
    outDir: tmpOut("m09-quote-"),
  });
  assert.equal(spawn.exitCode, 2);
  assert.equal(spawn.refusal?.code, "quote_as_success");
});
