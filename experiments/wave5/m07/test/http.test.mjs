import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fixturePath } from "../lib/corpus.mjs";
import { runEngineCli, writeFetchedLock } from "../lib/engine-cli.mjs";

async function serve(bytes) {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}/lock.json` };
}

test("CLI consumes lock bytes fetched from loopback HTTP", async () => {
  const beforeBytes = readFileSync(fixturePath("fixtures/npm-v3-version/before.json"));
  const afterBytes = readFileSync(fixturePath("fixtures/npm-v3-version/after.json"));
  const beforeSrv = await serve(beforeBytes);
  const afterSrv = await serve(afterBytes);
  try {
    const beforeRes = await fetch(beforeSrv.url);
    const afterRes = await fetch(afterSrv.url);
    assert.equal(beforeRes.ok, true);
    assert.equal(afterRes.ok, true);
    const beforePath = writeFetchedLock(Buffer.from(await beforeRes.arrayBuffer()), "package-lock.json");
    const afterPath = writeFetchedLock(Buffer.from(await afterRes.arrayBuffer()), "package-lock.after.json");
    const cli = runEngineCli({ before: beforePath, after: afterPath });
    assert.equal(cli.status, 0, cli.stderr || cli.stdout);
    assert.equal(cli.json.ok, true);
    assert.equal(cli.report.changed[0].name, "m07-alpha");
    assert.equal(cli.report.changed[0].before.version, "1.0.0");
    assert.equal(cli.report.changed[0].after.version, "1.1.0");
    assert.equal(cli.report.changed[0].after.integrity, "sha512-m07-alpha-1.1.0");
    assert.equal(JSON.stringify(cli.report.changed).includes("m07-beta"), false);
  } finally {
    await Promise.all([
      new Promise((resolve) => beforeSrv.server.close(resolve)),
      new Promise((resolve) => afterSrv.server.close(resolve)),
    ]);
  }
});
