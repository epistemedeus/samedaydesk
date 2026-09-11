import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixture, parseStdout, runConsumer, tmpOut } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, "loopback-server.mjs");

function startLoopback(beforePath, afterPath) {
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

test("loopback HTTP JSON catalogs are local-runtime, not external acceptance", async (t) => {
  const { child, port } = await startLoopback(
    fixture("supported", "routes-before.json"),
    fixture("supported", "routes-after.json"),
  );
  t.after(() => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
  });

  const result = runConsumer([
    "--before",
    `http://127.0.0.1:${port}/before.json`,
    "--after",
    `http://127.0.0.1:${port}/after.json`,
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 0, `stderr=${result.stderr} stdout=${result.stdout}`);
  assert.equal(body.ok, true);
  assert.equal(body.format.before, "routes-wrapper");
  assert.equal(body.evidenceClass.before, "local-runtime");
  assert.equal(body.evidenceClass.after, "local-runtime");
  assert.ok(body.added.includes("/x402"));
});

test("loopback OpenAPI JSON is still an unsupported format", async (t) => {
  const { child, port } = await startLoopback(
    fixture("unsupported", "openapi.json"),
    fixture("supported", "routes-after.json"),
  );
  t.after(() => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
  });
  const result = runConsumer([
    "--before",
    `http://127.0.0.1:${port}/before.json`,
    "--after",
    `http://127.0.0.1:${port}/after.json`,
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(body.code, "unsupported_format");
  assert.equal(body.detail.format, "openapi");
});
