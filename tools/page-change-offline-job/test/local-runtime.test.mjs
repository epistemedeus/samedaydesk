import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PACKAGE_ROOT, runCli } from "../lib/cli.mjs";

const beforePath = join(PACKAGE_ROOT, "fixtures/customer-job/before.json");
const afterPath = join(PACKAGE_ROOT, "fixtures/customer-job/after.json");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(55541, "127.0.0.1", () => resolve(server.address()));
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

test("offline engine has no database dependency or socket client", () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  assert.deepEqual(manifest.dependencies ?? {}, {});
  for (const name of readdirSync(join(PACKAGE_ROOT, "lib"))) {
    if (!name.endsWith(".mjs")) continue;
    const source = readFileSync(join(PACKAGE_ROOT, "lib", name), "utf8");
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()["'](?:pg|postgres|mysql|sqlite|node:net|node:tls)["']/);
  }
});
