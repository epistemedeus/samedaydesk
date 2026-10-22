import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { JOURNEY_AFTER, JOURNEY_BEFORE } from "../lib/constants.mjs";
import { runRouteDiff } from "../lib/index.mjs";
import { parseStdout, runCli, tmpOut } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, "loopback-catalog-server.mjs");

function startLoopbackServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER, JOURNEY_BEFORE, JOURNEY_AFTER], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`loopback server did not print a port: ${stdout}`));
    }, 5000);
    const onExit = (code) => {
      clearTimeout(timer);
      reject(new Error(`loopback server exited ${code}: ${stdout}`));
    };
    child.once("exit", onExit);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      const match = stdout.match(/^(\d+)/m);
      if (match) {
        clearTimeout(timer);
        child.removeListener("exit", onExit);
        resolve({ child, port: Number(match[1]) });
      }
    });
  });
}

test("local-runtime: loopback HTTP catalogs produce the same journey diff", async (t) => {
  const { child, port } = await startLoopbackServer();
  t.after(() => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
  });

  const outDir = tmpOut();
  const result = runCli([
    "--before",
    `http://127.0.0.1:${port}/before.json`,
    "--after",
    `http://127.0.0.1:${port}/after.json`,
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, `stderr=${result.stderr} stdout=${result.stdout}`);
  assert.equal(body.ok, true);
  assert.equal(body.evidenceClass.before, "local-runtime");
  assert.equal(body.evidenceClass.after, "local-runtime");
  assert.ok(body.added.includes("/for-agents/useful-jobs/v2"));
  assert.ok(body.changed.some((item) => item.path === "/terms"));
  assert.equal(body.publishedRouteTable, false);
});

test("local-runtime library fetch against the same loopback server", async (t) => {
  const { child, port } = await startLoopbackServer();
  t.after(() => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
  });
  const diff = await runRouteDiff({
    before: `http://127.0.0.1:${port}/before.json`,
    after: `http://127.0.0.1:${port}/after.json`,
  });
  assert.equal(diff.evidenceClass.before, "local-runtime");
  assert.equal(diff.added.some((route) => route.path === "/for-agents/useful-jobs/v2"), true);
});

test("external hosts are refused; a fixture is not a live server path", () => {
  const outDir = tmpOut();
  const result = runCli([
    "--before",
    "https://samedaydesk.com/for-agents/useful-jobs/catalog.json",
    "--after",
    JOURNEY_AFTER,
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(body.ok, false);
  assert.equal(body.code, "external_catalog_refused");
});

test("Postgres is not an input surface for this file-diff job", () => {
  const source = readFileSync(join(here, "../bin/route-diff.mjs"), "utf8")
    + readFileSync(join(here, "../lib/index.mjs"), "utf8")
    + readFileSync(join(here, "../lib/io.mjs"), "utf8");
  assert.equal(source.includes("postgres"), false);
  assert.equal(source.includes("DATABASE_URL"), false);
});
