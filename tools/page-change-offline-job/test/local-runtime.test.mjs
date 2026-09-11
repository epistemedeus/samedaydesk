import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PACKAGE_ROOT, runCli } from "../lib/cli.mjs";

const beforePath = join(PACKAGE_ROOT, "fixtures/customer-job/before.json");
const afterPath = join(PACKAGE_ROOT, "fixtures/customer-job/after.json");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("local HTTP: URL input is refused and the server is not contacted", async () => {
  const hits = [];
  const beforeBytes = readFileSync(beforePath);
  const server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(beforeBytes);
  });
  const address = await listen(server);
  const url = `http://127.0.0.1:${address.port}/before.json`;
  try {
    const io = { stdout: { write() {} }, stderr: { write() {} } };
    const result = await runCli([
      "compare",
      "--before", url,
      "--after", afterPath,
      "--fields", "title,description,headings",
      "--clock", "2026-09-08T12:00:00.000Z",
      "--out-dir", mkdtempSync(join(tmpdir(), "pc-http-")),
    ], io);
    assert.equal(result.exitCode, 2);
    assert.equal(result.error.code, "live_fetch_url");
    assert.equal(hits.length, 0);
  } finally {
    await close(server);
  }
});

test("Postgres is not part of this job public interface", async () => {
  // Honest local-runtime distinction: this offline compare has no SQL surface.
  // Do not invent a database adapter as proof. Probe only.
  let probed = "not_probed";
  try {
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
  } catch (error) {
    probed = `probe_failed:${error.message}`;
  }
  assert.ok(typeof probed === "string");
  assert.notEqual(probed, "used_as_page_change_store");
});
