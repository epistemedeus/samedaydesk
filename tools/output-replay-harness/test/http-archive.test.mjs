import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ReplayRefuse } from "../lib/args.mjs";
import {
  ensureUsefulJobsKit,
  ensureUsefulJobsKitFromHttp,
  verifyArchiveBuffer,
} from "../lib/kit.mjs";
import {
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_PATH,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_CLI,
  USEFUL_JOBS_PUBLIC_CATALOG,
} from "../lib/pins.mjs";
import { assertPublicCatalogMatchesKit, loadKitCatalog, loadPublicCatalog } from "../lib/catalog.mjs";
import { existsSync } from "node:fs";

function serveBuffer(buf, { status = 200 } = {}) {
  const server = http.createServer((req, res) => {
    if (req.url !== "/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz") {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(status, {
      "content-type": "application/gzip",
      "content-length": String(status === 200 ? buf.length : 0),
    });
    if (status === 200) res.end(buf);
    else res.end();
  });
  return new Promise((resolveP) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveP({
        origin: `http://127.0.0.1:${port}`,
        stop: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

test("committed public archive pin matches usefulJobsKit.json", () => {
  const buf = readFileSync(USEFUL_JOBS_ARCHIVE_PATH);
  assert.equal(buf.length, USEFUL_JOBS_ARCHIVE_BYTES);
  verifyArchiveBuffer(buf);
  assert.equal(existsSync(USEFUL_JOBS_PUBLIC_CATALOG), true);
});

test("public catalog outputs match the extracted archive catalog", () => {
  const kit = ensureUsefulJobsKit();
  assertPublicCatalogMatchesKit(loadPublicCatalog(), loadKitCatalog(kit));
  const job = loadKitCatalog(kit).jobs.find((j) => j.id === "api-upgrade-brief");
  assert.deepEqual(job.outputs, ["upgrade-brief.json", "upgrade-brief.md"]);
});

test("local HTTP: good archive extracts; wrong digest never extracts", async () => {
  const good = readFileSync(USEFUL_JOBS_ARCHIVE_PATH);
  const goodSrv = await serveBuffer(good);
  try {
    const kit = await ensureUsefulJobsKitFromHttp({
      url: `${goodSrv.origin}/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`,
      dest: join(tmpdir(), `orh-http-ok-${Date.now()}`),
    });
    assert.equal(existsSync(join(kit, USEFUL_JOBS_CLI)), true);
  } finally {
    await goodSrv.stop();
  }

  const bad = Buffer.from(good);
  bad[0] ^= 0xff;
  const badSrv = await serveBuffer(bad);
  const dest = join(tmpdir(), `orh-http-bad-${Date.now()}`);
  try {
    await assert.rejects(
      () =>
        ensureUsefulJobsKitFromHttp({
          url: `${badSrv.origin}/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz`,
          dest,
        }),
      (err) => err instanceof ReplayRefuse && err.code === "wrong-digest",
    );
    assert.equal(existsSync(join(dest, "useful-jobs-1.0.0", USEFUL_JOBS_CLI)), false);
  } finally {
    await badSrv.stop();
  }
});
