import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { REPO_ROOT } from "../lib/pins.mjs";
import { readJson, SERVE } from "./helpers.mjs";

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVE, "--host", "127.0.0.1", "--port", "0"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`serve produced no listen JSON: ${buf}`));
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      const start = buf.indexOf("{");
      const end = buf.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          const body = JSON.parse(buf.slice(start, end + 1));
          if (body.port) {
            clearTimeout(timer);
            resolve({ child, port: body.port, host: body.host || "127.0.0.1" });
          }
        } catch {
          /* keep buffering */
        }
      }
    });
    child.on("error", reject);
  });
}

describe("loopback HTTP process", { timeout: 30_000 }, () => {
  it("GET /health and POST /readout use the same contract", async () => {
    const listening = await startServer();
    try {
      const healthRes = await fetch(`http://127.0.0.1:${listening.port}/health`);
      const health = await healthRes.json();
      assert.equal(healthRes.status, 200);
      assert.equal(health.ok, true);
      assert.equal(health.contract, "samedaydesk.wave5.m20.readout.v1");

      const contractRes = await fetch(`http://127.0.0.1:${listening.port}/contract`);
      const contract = await contractRes.json();
      assert.equal(contract.contract, health.contract);

      const bad = await fetch(`http://127.0.0.1:${listening.port}/readout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      assert.equal(bad.status, 400);
      const badBody = await bad.json();
      assert.equal(badBody.code, "invalid-json");

      const payload = { observations: [readJson("observations/no-reply.json")] };
      const readoutRes = await fetch(`http://127.0.0.1:${listening.port}/readout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(readoutRes.status, 200);
      const readout = await readoutRes.json();
      assert.equal(readout.rows[0].useClass, "no-reply");
      assert.equal(readout.nextAdjustment.one, true);
    } finally {
      listening.child.kill("SIGTERM");
    }
  });
});
