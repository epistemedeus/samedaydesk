import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { compareLockfileTexts } from "../lib/index.mjs";
import { pack, writeJson } from "./helpers/npm-oracle.mjs";

const execute = promisify(execFile);

test("npm-generated HTTP tarballs retain literal URL pins without claiming Git commits", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-url-oracle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  pack(root);
  const tarball = fs.readFileSync(path.join(root, "oracle-pin-1.0.0.tgz"));
  let requests = 0;
  const server = http.createServer((req, res) => {
    if (++requests > 20) { res.writeHead(429); res.end(); return; }
    res.setHeader("content-type", "application/octet-stream");
    res.end(tarball);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.LOCKFILE_TEST_PORT || 55550), "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const urls = [
    `${origin}/archive%2fpath.tgz?x=1&y=2`,
    `${origin}/archive%2Fpath.tgz?y=2&x=1`,
    `${origin}/archive.tgz?github:#${"a".repeat(64)}`,
    `${origin}/archive.git#${"b".repeat(64)}`,
  ];
  for (const version of [2, 3]) {
    let previous;
    for (const [index, url] of urls.entries()) {
      const dir = path.join(root, `v${version}-${index}`);
      writeJson(path.join(dir, "package.json"), { name: "url-oracle", version: "1.0.0", dependencies: { "oracle-pin": url } });
      await execute("npm", ["install", `--lockfile-version=${version}`, "--ignore-scripts", "--no-audit", "--no-fund",
        `--registry=${origin}`, `--cache=${path.join(root, "cache")}`, "--fetch-retries=0", "--fetch-timeout=5000"], {
        cwd: dir, encoding: "utf8", timeout: 20_000, maxBuffer: 128 * 1024,
        env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=768", npm_config_update_notifier: "false" },
      });
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "node_modules/oracle-pin/package.json"))).version, "1.0.0");
      const text = fs.readFileSync(path.join(dir, "package-lock.json"), "utf8");
      assert.equal(JSON.parse(text).packages["node_modules/oracle-pin"].resolved, url);
      if (previous) {
        const report = compareLockfileTexts(previous, text);
        assert.deepEqual(report.changed[0].changeKinds, ["resolved"]);
        assert.equal(report.changed[0].after.resolved, url);
        assert.equal(report.changed[0].after.gitCommit, null, "npm installed an HTTP tarball, not a Git checkout");
      }
      previous = text;
    }
  }
  assert.ok(requests > 0 && requests <= 20);
});
