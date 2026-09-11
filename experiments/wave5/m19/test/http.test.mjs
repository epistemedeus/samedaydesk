import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { listenDistributionServer } from "../lib/http.mjs";
import { SCHEMA, SDS52 } from "../lib/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const serve = join(here, "../bin/serve.mjs");

test("loopback HTTP health and journey use the same kernel", { timeout: 180_000 }, async () => {
  const { server, url } = await listenDistributionServer();
  try {
    const healthRes = await fetch(`${url}/health`);
    assert.equal(healthRes.ok, true);
    const health = await healthRes.json();
    assert.equal(health.ok, true);
    assert.equal(health.schema, SCHEMA);
    assert.equal(health.testedSha, SDS52);

    const scanRes = await fetch(`${url}/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "invented-partner" }),
    });
    assert.equal(scanRes.status, 200);
    const scan = await scanRes.json();
    assert.equal(scan.refused, true);
    assert.equal(scan.code, "closed-generic-outreach");

    const journeyRes = await fetch(`${url}/journey`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(journeyRes.status, 200);
    const journey = await journeyRes.json();
    assert.equal(journey.ok, true);
    assert.equal(journey.contribution.independentlyConsumed, false);
    assert.equal(journey.invoke.sold, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serve.mjs process prints listening and answers /health", { timeout: 30_000 }, async () => {
  const child = spawn(process.execPath, [serve], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let url;
  try {
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("serve start timeout")), 10_000);
      let stdout = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        const match = stdout.match(/listening (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (!url) {
          clearTimeout(timer);
          reject(new Error(`serve exited ${code}`));
        }
      });
    });
    const health = await fetch(`${url}/health`);
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.testedSha, SDS52);
  } finally {
    child.kill("SIGTERM");
  }
});
