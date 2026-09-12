import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { CITED_BANKED_USDC } from "../lib/contract.mjs";
import { projectDir } from "../lib/project.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../bin/project.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("CLI writes projection.json for the published settlement fixtures", () => {
  const dir = mkdtempSync(join(tmpdir(), "refund-obligation-out-"));
  const out = join(dir, "nested", "projection.json");
  const result = run(["--pretty", "--out", out]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  const expected = projectDir().projection;
  assert.deepEqual(payload.projection, expected);
  assert.equal(payload.projection.citedBankedUsdcAttached, false);
  assert.equal(JSON.stringify(payload).includes(CITED_BANKED_USDC), false);
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), payload);
});

test("seeded failure: --execute-refund is refused", () => {
  const result = run(["--execute-refund"]);
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "execute_refund_refused");
});

test("seeded failure: --sum-as-revenue is refused", () => {
  const result = run(["--sum-as-revenue"]);
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "sum_across_buyer_class_as_revenue");
});

test("seeded failure: --post-paid is refused", () => {
  const result = run(["--post-paid"]);
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "post_paid_refused");
});

test("seeded failure: integer --terms-version is refused", () => {
  const result = run(["--terms-version", "1"]);
  assert.equal(result.status, 1, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.code, "integer_terms_version");
});

test("CLI --listen is a real local HTTP path including a per-job dossier", async (t) => {
  const child = spawn(process.execPath, [cli, "--listen", "--host", "127.0.0.1", "--port", "0"], {
    encoding: "utf8",
  });
  t.after(() => {
    if (!child.killed) child.kill("SIGTERM");
  });
  const payload = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("listen did not print a URL")), 5000);
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      const line = buf.split("\n").find((item) => item.startsWith("{"));
      if (!line) return;
      try {
        const parsed = JSON.parse(line);
        if (parsed.url) {
          clearTimeout(timer);
          resolve(parsed);
        }
      } catch {
        // wait for a complete JSON line
      }
    });
    child.stderr.on("data", (chunk) => reject(new Error(String(chunk))));
    child.on("error", reject);
  });
  assert.equal(payload.ok, true);
  const response = await fetch(`${payload.url}/projection`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.projection.evidenceKind, "local_runtime");
  assert.equal(body.projection.records.length, 5);
  assert.equal(JSON.stringify(body).includes(CITED_BANKED_USDC), false);

  const dossier = await fetch(
    `${payload.url}/projection?operationId=agent402-external-validation-purchase-2026-08-29`,
  );
  assert.equal(dossier.status, 200);
  const dossierBody = await dossier.json();
  assert.equal(dossierBody.ok, true);
  assert.equal(dossierBody.projection.records.length, 1);
  assert.equal(dossierBody.projection.records[0].refundClaim, "unknown");
  assert.equal(JSON.stringify(dossierBody).includes(CITED_BANKED_USDC), false);
});
