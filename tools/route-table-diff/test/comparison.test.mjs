import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  COMPARISON_COLLISION_CANONICAL,
  COMPARISON_COLLISION_ENCODED,
  COMPARISON_COLLISION_PATH,
  COMPARISON_PERMUTED,
  COMPARISON_REMOVED,
  COMPARISON_SLASH_ALIAS,
  FIXTURES_DIR,
  JOURNEY_AFTER,
  JOURNEY_BEFORE,
} from "../lib/constants.mjs";
import { parseStdout, runCli, tmpOut } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, "loopback-catalog-server.mjs");

function failCli(args) {
  const result = runCli(args);
  const body = parseStdout(result);
  assert.equal(result.status, 2, `expected refuse, stderr=${result.stderr}`);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  return body;
}

function startLoopbackServer(beforePath, afterPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER, beforePath, afterPath], {
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

test("CLI: permutation of the same routes is not a breaking change", () => {
  const outDir = tmpOut();
  const result = runCli([
    "--before",
    JOURNEY_BEFORE,
    "--after",
    COMPARISON_PERMUTED,
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.breaking, false);
  assert.equal(body.outcome, "permutation");
  assert.equal(body.orderChanged, true);
  assert.equal(body.counts.added, 0);
  assert.equal(body.counts.removed, 0);
  assert.equal(body.counts.changed, 0);
  assert.equal(body.counts.collisions, 0);
  assert.equal(body.tableDigest.before, body.tableDigest.after);
  assert.deepEqual(body.removed, []);
  assert.deepEqual(body.collisions, []);

  const json = JSON.parse(readFileSync(join(outDir, "route-diff.json"), "utf8"));
  assert.equal(json.breaking, false);
  assert.equal(json.outcome, "permutation");
  const md = readFileSync(join(outDir, "route-diff.md"), "utf8");
  assert.match(md, /Breaking: \*\*no\*\*/);
  assert.match(md, /Outcome: \*\*permutation\*\*/);
});

test("CLI: removing /privacy is a breaking change", () => {
  const outDir = tmpOut();
  const result = runCli([
    "--before",
    JOURNEY_BEFORE,
    "--after",
    COMPARISON_REMOVED,
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.breaking, true);
  assert.equal(body.outcome, "breaking");
  assert.ok(body.removed.includes("/privacy"));
  assert.equal(body.counts.removed, 1);
  assert.equal(body.counts.collisions, 0);
  assert.notEqual(body.tableDigest.before, body.tableDigest.after);

  const json = JSON.parse(readFileSync(join(outDir, "route-diff.json"), "utf8"));
  assert.equal(json.removed[0].path, "/privacy");
  assert.match(readFileSync(join(outDir, "route-diff.md"), "utf8"), /Breaking: \*\*yes\*\*/);
});

test("CLI: duplicate path after SDS identity is a collision, not a transport failure", () => {
  const outDir = tmpOut();
  const result = runCli([
    "--before",
    JOURNEY_BEFORE,
    "--after",
    COMPARISON_COLLISION_PATH,
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, `collision must be analysis, not exit 2. stderr=${result.stderr} stdout=${result.stdout}`);
  assert.equal(body.ok, true);
  assert.equal(body.refused, undefined);
  assert.equal(body.breaking, true);
  assert.equal(body.outcome, "breaking");
  const pathHit = body.collisions.find((item) => item.kind === "path" && item.path === "/terms");
  assert.ok(pathHit, "duplicate /terms must be listed as a path collision");
  assert.equal(pathHit.side, "after");

  const json = JSON.parse(readFileSync(join(outDir, "route-diff.json"), "utf8"));
  assert.ok(json.collisions.some((item) => item.kind === "path" && item.path === "/terms"));
});

test("CLI: trailing-slash and default-port aliases are the same SDS routes", () => {
  const outDir = tmpOut();
  const result = runCli([
    "--before",
    JOURNEY_BEFORE,
    "--after",
    COMPARISON_SLASH_ALIAS,
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.ok, true);
  assert.equal(body.breaking, false);
  assert.equal(body.outcome, "no-change");
  assert.equal(body.orderChanged, false);
  assert.equal(body.counts.added, 0);
  assert.equal(body.counts.removed, 0);
  assert.equal(body.counts.changed, 0);
  assert.equal(body.tableDigest.before, body.tableDigest.after);
});

test("CLI: encoded path alias collides with the decoded SDS path", () => {
  const outDir = tmpOut();
  const result = runCli([
    "--before",
    JOURNEY_BEFORE,
    "--after",
    COMPARISON_COLLISION_ENCODED,
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.breaking, true);
  const hit = body.collisions.find((item) => item.kind === "path" && item.path === "/for-agents/useful-jobs");
  assert.ok(hit);
});

test("CLI: two paths sharing one canonical are a breaking collision", () => {
  const outDir = tmpOut();
  const result = runCli([
    "--before",
    JOURNEY_BEFORE,
    "--after",
    COMPARISON_COLLISION_CANONICAL,
    "--out-dir",
    outDir,
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.breaking, true);
  const hit = body.collisions.find((item) => item.kind === "canonical");
  assert.ok(hit);
  assert.equal(hit.canonical, "https://samedaydesk.com/terms");
  assert.ok(hit.paths.includes("/terms"));
  assert.ok(hit.paths.includes("/legal/terms"));
});

test("CLI: OpenAPI path maps are refused as unsupported catalogs", () => {
  const body = failCli([
    "--before",
    join(FIXTURES_DIR, "failures", "unsupported-openapi.json"),
    "--after",
    JOURNEY_AFTER,
    "--out-dir",
    tmpOut(),
  ]);
  assert.equal(body.code, "unsupported_catalog");
});

test("CLI: framework method/handler records are refused as unsupported catalogs", () => {
  const body = failCli([
    "--before",
    join(FIXTURES_DIR, "failures", "unsupported-framework-record.json"),
    "--after",
    JOURNEY_AFTER,
    "--out-dir",
    tmpOut(),
  ]);
  assert.equal(body.code, "unsupported_catalog");
});

test("local-runtime HTTP: permutation is not breaking", async (t) => {
  const { child, port } = await startLoopbackServer(JOURNEY_BEFORE, COMPARISON_PERMUTED);
  t.after(() => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
  });
  const result = runCli([
    "--before",
    `http://127.0.0.1:${port}/before.json`,
    "--after",
    `http://127.0.0.1:${port}/after.json`,
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(body.evidenceClass.before, "local-runtime");
  assert.equal(body.evidenceClass.after, "local-runtime");
  assert.equal(body.breaking, false);
  assert.equal(body.outcome, "permutation");
  assert.equal(body.tableDigest.before, body.tableDigest.after);
});
