import assert from "node:assert/strict";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  OWNER_TOKEN,
  TEST_ARTIFACT,
  createReservedTask,
  databaseUrl,
  dropSchema,
  issueContributor,
  json,
  key,
  uniqueSchema,
} from "./helpers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function spawnCompiled(port: number, schema: string): ChildProcess {
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      EARNED_WORK_PG_SCHEMA: schema,
      EARNED_WORK_DATABASE_URL: databaseUrl(),
      EARNED_WORK_OWNER_TOKEN: OWNER_TOKEN,
      EARNED_WORK_VERIFIER: "default",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function waitListening(child: ChildProcess, port: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`compiled start exited ${child.exitCode}: ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        const body = (await response.json()) as { ok: boolean; store: string };
        if (body.ok === true && body.store === "postgres") return;
      }
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`compiled start did not reach healthz: ${stderr}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

test("literal node dist/index.js reaches /healthz without a TypeScript loader", async () => {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  const schema = uniqueSchema();
  const portA = await freePort();
  const portB = await freePort();
  const a = spawnCompiled(portA, schema);
  const b = spawnCompiled(portB, schema);
  try {
    await waitListening(a, portA);
    await waitListening(b, portB);
    const urlA = `http://127.0.0.1:${portA}`;
    const urlB = `http://127.0.0.1:${portB}`;
    const health = await json(urlA, "/healthz");
    assert.equal(health.status, 200);
    assert.equal((health.body as { ok: boolean; store: string }).ok, true);
    assert.equal((health.body as { store: string }).store, "postgres");

    const { taskId, termsVersion } = await createReservedTask(urlA);
    const contrib = await issueContributor(urlA, { taskId });
    const claimKey = key("compiled-claim");
    const claimed = await json(urlA, `/v1/tasks/${taskId}/claims`, {
      method: "POST",
      token: contrib.token,
      idempotencyKey: claimKey,
      body: JSON.stringify({ termsVersion }),
    });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
    const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;

    await stop(a);
    const portA2 = await freePort();
    const restarted = spawnCompiled(portA2, schema);
    try {
      await waitListening(restarted, portA2);
      const replay = await json(`http://127.0.0.1:${portA2}`, `/v1/tasks/${taskId}/claims`, {
        method: "POST",
        token: contrib.token,
        idempotencyKey: claimKey,
        body: JSON.stringify({ termsVersion }),
      });
      assert.equal(replay.status, 200);
      assert.equal((replay.body as { reservation: { id: string } }).reservation.id, reservationId);

      const submitted = await json(urlB, `/v1/tasks/${taskId}/submissions`, {
        method: "POST",
        token: contrib.token,
        idempotencyKey: key("compiled-submit"),
        body: JSON.stringify({ reservationId, artifact: TEST_ARTIFACT }),
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));

      const emptyPayout = await json(`http://127.0.0.1:${portA2}`, `/v1/tasks/${taskId}/payout`, {
        token: OWNER_TOKEN,
      });
      assert.equal(emptyPayout.status, 200, JSON.stringify(emptyPayout.body));
      assert.equal((emptyPayout.body as { payoutState: string }).payoutState, "none");
      assert.equal((emptyPayout.body as { obligationId: string | null }).obligationId, null);
      assert.equal((emptyPayout.body as { reconciliation: { owed: boolean; sale: boolean } }).reconciliation.owed, false);
      assert.equal((emptyPayout.body as { reconciliation: { sale: boolean } }).reconciliation.sale, false);
    } finally {
      await stop(restarted);
    }
  } finally {
    await stop(a);
    await stop(b);
    await dropSchema(schema);
  }
});
