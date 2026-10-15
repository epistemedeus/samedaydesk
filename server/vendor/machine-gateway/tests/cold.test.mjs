import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, stat, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launch, execFile } from "./process-helpers.mjs";
import { sampleInput } from "./helpers.mjs";

test("cold npm package installs production dependencies only; fresh CLI processes recover after server restart", { timeout: 60000 }, async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), "machine-gateway-cold-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // The outer test command holds pilot-ae18-build.lock; no nested flock.
  const packed = await execFile("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", dir], { cwd: root, timeout: 30000 });
  const archive = join(dir, JSON.parse(packed.stdout)[0].filename);
  await execFile("tar", ["-xzf", archive, "-C", dir], { timeout: 10000 });
  const installed = join(dir, "package");
  await execFile("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"], { cwd: installed, timeout: 30000 });
  const config = join(dir, "tenants.json"), tokenFile = join(dir, "tenant.credential"), stateFile = join(dir, "caller.json");
  const enrolled = await execFile(process.execPath, [join(installed, "bin/enroll.mjs"), "--tenant", "cold-caller", "--config", config, "--token-file", tokenFile]);
  const token = (await readFile(tokenFile, "utf8")).trim();
  assert.equal(enrolled.stdout.includes(token), false);
  assert.equal((await stat(tokenFile)).mode & 0o077, 0);
  const env = { NODE_ENV: "production", MACHINE_GATEWAY_ENABLED: "1", MACHINE_GATEWAY_TENANTS_FILE: config,
    MACHINE_GATEWAY_STATE_FILE: join(dir, "machine-gateway.sqlite"), MACHINE_GATEWAY_PAYMENTS_ENABLED: "0", PORT: "0" };
  const first = await launch(t, join(installed, "src/server.mjs"), env);
  const inputFile = join(dir, "input.json"); await writeFile(inputFile, JSON.stringify(sampleInput));
  const common = [join(installed, "bin/caller.mjs"), "--base-url", first.base, "--token-file", tokenFile,
    "--state-file", stateFile, "--allow-loopback"];
  const result = await execFile(process.execPath, [...common, "--route", "lockfile.delta", "--input-file", inputFile]);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "completed"); assert.equal(receipt.output.counts.changed, 1);
  assert.equal(receipt.payment.state, "not_required");
  await first.stop();
  const second = await launch(t, join(installed, "src/server.mjs"), { ...env, PORT: String(first.port) });
  const replay = await execFile(process.execPath, [...common, "--resume"]);
  assert.deepEqual(JSON.parse(replay.stdout), receipt);
  const readiness = await execFile(process.execPath, [join(installed, "bin/readiness.mjs"), "--base-url", second.base, "--allow-loopback"]);
  assert.equal(JSON.parse(readiness.stdout).runtimeReachable, true);
  assert.equal(JSON.parse(readiness.stdout).livePaymentVerified, false);
  const db = new DatabaseSync(env.MACHINE_GATEWAY_STATE_FILE);
  assert.equal(db.prepare("SELECT count(*) AS n FROM attempts").get().n, 1);
  assert.equal(db.prepare("SELECT calls FROM usage").get().calls, 1); db.close();
  assert.equal((await stat(stateFile)).mode & 0o077, 0);
  const otherToken = join(dir, "other.credential"); await writeFile(otherToken, `${"x".repeat(40)}\n`, { mode: 0o600 });
  await assert.rejects(execFile(process.execPath, [join(installed, "bin/caller.mjs"), "--base-url", second.base,
    "--token-file", otherToken, "--state-file", stateFile, "--resume", "--allow-loopback"]), error => error.stderr.includes("caller_state_binding_conflict"));
  const oversizedInput = join(dir, "oversized.json"); await writeFile(oversizedInput, "x".repeat(131073));
  await assert.rejects(execFile(process.execPath, [...common, "--resume", "--input-file", oversizedInput]), error => error.stderr.includes("invalid_input_file"));
  await chmod(tokenFile, 0o644);
  await assert.rejects(execFile(process.execPath, [...common, "--resume"]), error => error.stderr.includes("invalid_private_file"));
  await chmod(tokenFile, 0o600);
});
