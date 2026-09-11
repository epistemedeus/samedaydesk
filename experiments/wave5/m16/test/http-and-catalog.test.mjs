import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { WRAPPER_CLI, WRAPPER_SHA } from "../lib/pins.mjs";
import { runCli, spawnCliAsync, tmpOut } from "./helpers.mjs";
import { REPO_ROOT } from "../lib/pins.mjs";

function gitShowBuf(sha) {
  const r = spawnSync("git", ["-C", REPO_ROOT, "show", `${sha}:package-lock.json`], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
}

test("loopback HTTP staged lock pair yields the same three resolved-source changes", async () => {
  const beforeBuf = gitShowBuf("126776d364302a610f3e1a91c19191b99ef3b99a");
  const afterBuf = gitShowBuf("62a88c86461e7b8d0e9a7cf1db57153d7e8fd6cf");
  const server = http.createServer((req, res) => {
    if (req.url === "/before/package-lock.json") {
      res.setHeader("content-type", "application/json");
      res.end(beforeBuf);
      return;
    }
    if (req.url === "/after/package-lock.json") {
      res.setHeader("content-type", "application/json");
      res.end(afterBuf);
      return;
    }
    res.statusCode = 404;
    res.end("no");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const outDir = tmpOut();
    const result = await spawnCliAsync([
      "run",
      "--before-url",
      `http://127.0.0.1:${port}/before/package-lock.json`,
      "--after-url",
      `http://127.0.0.1:${port}/after/package-lock.json`,
      "--out-dir",
      outDir,
    ]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(result.json.analysis.outcome, "actionable");
    assert.equal(result.json.engine.counts.changed, 3);
    const qs = result.json.changed.find((p) => p.name === "qs");
    assert.equal(qs.after.resolved, "https://registry.npmjs.org/qs/-/qs-6.16.0.tgz");
    assert.equal(result.json.tested.engineSha, "e81efc8ab71b1bde88eca743d297149e61bbb6f2");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("F08 wrapper catalog does not list lockfile-pin-delta; unknown-job is the remaining binding", () => {
  const result = runCli(["catalog-binding"]);
  assert.equal(result.json.wrapperSha, WRAPPER_SHA);
  assert.equal(result.json.lockfilePinDeltaInCatalog, false);
  assert.ok(Array.isArray(result.json.jobs));
  assert.equal(result.json.jobs.includes("vendor-budget-impact"), true);
  assert.equal(result.json.unknownJob.code, "unknown-job");
  assert.equal(result.json.unknownJob.ok, false);
  assert.equal(result.json.unknownJob.status, 2);
  const direct = spawnSync(process.execPath, [WRAPPER_CLI, "list"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
    timeout: 30_000,
  });
  assert.equal(direct.status, 0);
  const listed = JSON.parse(direct.stdout);
  assert.equal(listed.liveSettlement, "out-of-scope");
  assert.equal(listed.jobs.includes("lockfile-pin-delta"), false);
});
