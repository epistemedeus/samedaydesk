import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { UsefulJourneyClient } from "../client.mjs";
import { Budget, within } from "../lib/budget.mjs";
import { example } from "./support.mjs";

test("Root patch applies and actual SDS app/index mount evaluation before raw intake without changing existing routes", { timeout: 20_000 }, async t => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), "sds-useful-root-patch-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(join(root, "server"), join(dir, "server"), { recursive: true });
  await cp(join(root, "package.json"), join(dir, "package.json"));
  for (const path of ["tools", "vendor", "node_modules", "client"]) await symlink(join(root, path), join(dir, path));
  const patch = fileURLToPath(new URL("../patches/ROOT-MOUNT.patch", import.meta.url));
  // Receiving has installed the patch. Reconstruct its exact unchanged input
  // and reapply it, while all journey tests now run the actual mounted SDS app.
  execFileSync("git", ["apply", "--reverse", "--check", patch], { cwd: dir, timeout: 2000 });
  execFileSync("git", ["apply", "--reverse", patch], { cwd: dir, timeout: 2000 });
  execFileSync("git", ["apply", "--check", patch], { cwd: dir, timeout: 2000 });
  execFileSync("git", ["apply", patch], { cwd: dir, timeout: 2000 });
  const portServer = net.createServer();
  await new Promise(resolve => portServer.listen(0, "127.0.0.1", resolve));
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  const child = spawn(process.execPath, [join(dir, "server/index.js")], {
    cwd: dir, detached: true, env: { PATH: process.env.PATH, PORT: String(port), NODE_ENV: "test" }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  }));
  const started = new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", bytes => { output = (output + bytes).slice(-2048); if (output.includes("listening")) resolve(); });
    child.stderr.on("data", () => {});
    child.once("exit", () => reject(Error("patched server failed to start")));
  });
  await within(started, new Budget({ deadlineMs: 8000 }));
  const origin = `http://127.0.0.1:${port}`;
  const health = await fetch(`${origin}/api/health`).then(r => r.json());
  assert.equal(health.service, "samedaydesk");
  const readback = await new UsefulJourneyClient({ origin }).evaluate(await example("issue-brief"));
  assert.equal(readback.result.recipe.evidence.brief.actions.length, 2);
  assert.equal(readback.admitted, false);
  const initialize = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "s346-disposable-receiving", version: "1" } } }) });
  assert.equal(initialize.status, 200);
  assert.equal((await fetch(`${origin}/api/public-readiness/healthz`)).status, 200);
  assert.equal((await fetch(`${origin}/api/uploads/signed-url`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 501);
  assert.deepEqual(await readFile(join(dir, "server/app.js")), await readFile(join(root, "server/app.js")));
  assert.deepEqual(await readFile(join(dir, "server/index.js")), await readFile(join(root, "server/index.js")));
});
