import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startDisposablePg } from "./fixtures/disposable-pg.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const helpersUrl = new URL("../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/tests/helpers.mjs", import.meta.url);
const pass = path.join(root, "server/scripts/fixtures/claimed-assignment-pass.mjs");
const worker = path.join(root, "server/foundry/worker.mjs");

async function reservedAssignment(databaseUrl) {
  const schema = `vf04_sdsclaim${process.pid}`;
  process.env.VF04_TEST_DATABASE_URL = databaseUrl;
  process.env.VF04_TEST_SCHEMA = schema;
  const { boot, project, candidate } = await import(helpersUrl);
  const host = await boot();
  try {
    const enrolled = await project(host, { wallMs: 120000 });
    await candidate(host, enrolled);
    const reserved = await host.rpc("reserve", enrolled.projectId);
    assert.ok(reserved.assignment?.id, JSON.stringify(reserved));
    return { schema, projectId: enrolled.projectId, assignmentId: reserved.assignment.id };
  } finally {
    await host.stop();
  }
}

function queryAttempt(databaseUrl, schema, assignmentId) {
  const client = new pg.Client({ connectionString: databaseUrl });
  return client.connect().then(async () => {
    try {
      const result = await client.query(
        `SELECT state, termination, process_identity FROM ${schema}.correspondence_vf04_attempts WHERE id = $1`,
        [assignmentId],
      );
      return result.rows[0];
    } finally {
      await client.end();
    }
  });
}

test("SIGTERM during a claimed assignment does not kill the healthy pass at eight seconds", { timeout: 120000 }, async () => {
  const cluster = await startDisposablePg();
  try {
    const reserved = await reservedAssignment(cluster.url);
    const child = spawn(process.execPath, [worker, "dispatch", reserved.projectId], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        FOUNDRY_HOST_OPT_IN: "1",
        CORRESPONDENCE_DATABASE_URL: cluster.url,
        CORRESPONDENCE_PG_SCHEMA: reserved.schema,
        FOUNDRY_WORKER_PASS: pass,
        FOUNDRY_CLAIM_PROJECT: reserved.projectId,
        FOUNDRY_CLAIM_ASSIGNMENT: reserved.assignmentId,
        FOUNDRY_WORKER_HOLD_MS: "12000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (buf) => { stdout += buf; });
    let stderr = "";
    child.stderr.on("data", (buf) => { stderr += buf; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`claim did not start: ${stdout} ${stderr}`)), 20000);
      child.stdout.on("data", () => {
        if (stdout.includes("claimed")) { clearTimeout(timer); resolve(); }
      });
    });
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 9000));
    assert.equal(child.exitCode, null, `wrapper exited early: ${stdout} ${stderr}`);
    const [code, signal] = await once(child, "exit");
    assert.equal(code, 0, stderr);
    assert.equal(signal, null);
    assert.match(stdout, /terminated/);
    assert.match(stdout, /shutdown_after_dispatch/);
    const row = await queryAttempt(cluster.url, reserved.schema, reserved.assignmentId);
    assert.equal(row.termination.exited, true);
    assert.equal(row.state, "result");
  } finally {
    await cluster.stop();
  }
});

test("SIGKILL of a claimed pass leaves the assignment without termination evidence", { timeout: 60000 }, async () => {
  const cluster = await startDisposablePg();
  try {
    const reserved = await reservedAssignment(cluster.url);
    const child = spawn(process.execPath, [pass, "dispatch", reserved.projectId], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CORRESPONDENCE_DATABASE_URL: cluster.url,
        CORRESPONDENCE_PG_SCHEMA: reserved.schema,
        FOUNDRY_CLAIM_PROJECT: reserved.projectId,
        FOUNDRY_CLAIM_ASSIGNMENT: reserved.assignmentId,
        FOUNDRY_WORKER_HOLD_MS: "30000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (buf) => { stdout += buf; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`claim did not start: ${stdout}`)), 20000);
      child.stdout.on("data", () => {
        if (stdout.includes("claimed")) { clearTimeout(timer); resolve(); }
      });
    });
    child.kill("SIGKILL");
    await once(child, "exit");
    const row = await queryAttempt(cluster.url, reserved.schema, reserved.assignmentId);
    assert.equal(row.termination, null);
    assert.ok(row.process_identity);
    assert.equal(row.state, "running");
  } finally {
    await cluster.stop();
  }
});
