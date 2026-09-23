import { createServer } from "node:net";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { envelope, failError } from "./envelope.mjs";
import { artifactsDir, ensureArtifactsDir, hasNodeModules, serverEntry } from "./repo.mjs";
import { SECRET_ENV } from "./catalog.mjs";
import { httpRequest, previewBody } from "./http.mjs";
import { clip, spawnHost } from "./spawn.mjs";

export function pidPath(root) {
  return join(artifactsDir(root), "serve.json");
}

export function readServeState(root) {
  const path = pidPath(root);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeServeState(root, state) {
  ensureArtifactsDir(root);
  writeFileSync(pidPath(root), `${JSON.stringify(state, null, 2)}\n`);
}

function clearServeState(root) {
  const path = pidPath(root);
  if (existsSync(path)) unlinkSync(path);
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

export function hostEnv(port) {
  const env = { ...process.env };
  for (const key of SECRET_ENV) delete env[key];
  env.PORT = String(port);
  env.NODE_ENV = env.SAMEDAYDESK_VERIFY_NODE_ENV || env.NODE_ENV || "development";
  env.FORCE_COLOR = "0";
  return env;
}

export function killPid(pid) {
  if (!pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

export async function waitKill(pid, timeoutMs = 2000) {
  if (!pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

export async function waitHealth(origin, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await httpRequest(`${origin}/api/health`, { timeoutMs: 2000 });
      if (last.status === 200 && last.json?.service === "samedaydesk") return last;
    } catch (error) {
      last = { status: 0, kind: "network", body: error.message, json: null };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return last;
}

export async function startHost({ root, port = null, timeoutMs = 15_000, detached = false } = {}) {
  const bound = port || (await freePort());
  const argv = [process.execPath, serverEntry(root)];
  const handle = spawnHost(argv, { cwd: root, env: hostEnv(bound), detached });
  const origin = `http://127.0.0.1:${bound}`;
  const health = await waitHealth(origin, timeoutMs);
  return {
    pid: handle.pid,
    port: bound,
    origin,
    argv: ["node", "server/index.js"],
    health,
    output: handle.output,
    child: handle.child,
  };
}

export async function withHost(root, fn, { port = null, timeoutMs = 15_000 } = {}) {
  const handle = await startHost({ root, port, timeoutMs, detached: false });
  try {
    if (!(handle.health?.status === 200 && handle.health.json?.service === "samedaydesk")) {
      const out = handle.output();
      const error = new Error(
        `shipped server/index.js did not serve /api/health {service:"samedaydesk"} (status ${handle.health?.status})`,
      );
      error.detail = { health: handle.health, stdout: clip(out.stdout, 400), stderr: clip(out.stderr, 400) };
      throw error;
    }
    return await fn(handle);
  } finally {
    await waitKill(handle.pid);
  }
}

export async function runServe(parsed, { root, dryRun = false } = {}) {
  const action = parsed.tokens[0] || (parsed.flags.stop ? "stop" : parsed.flags.once ? "once" : "status");
  const requestedPort = parsed.flags.port != null ? Number(parsed.flags.port) : null;
  const evidence = [
    { kind: "serve", action, start: "node server/index.js" },
    { kind: "argv", argv: ["node", "server/index.js"] },
  ];

  if (dryRun) {
    return envelope({
      ok: true,
      command: "serve",
      dryRun: true,
      evidence,
      result: { would: action, argv: ["node", "server/index.js"], start: "npm start → node server/index.js" },
    });
  }

  if (!hasNodeModules(root)) {
    return envelope({
      ok: false,
      command: "serve",
      evidence,
      error: failError("HOST_BUILD", "root node_modules missing; npm ci before serve"),
    });
  }

  if (action === "stop") {
    const prior = readServeState(root);
    if (prior?.pid) await waitKill(prior.pid);
    clearServeState(root);
    return envelope({
      ok: true,
      command: "serve",
      evidence,
      result: { stopped: prior?.pid || null },
    });
  }

  if (action === "status") {
    const live = readServeState(root);
    return envelope({
      ok: true,
      command: "serve",
      evidence,
      result: { live },
    });
  }

  if (action === "once") {
    try {
      const quote = await withHost(
        root,
        async (handle) => ({
          origin: handle.origin,
          port: handle.port,
          health: {
            status: handle.health.status,
            json: handle.health.json,
            kind: handle.health.kind,
          },
        }),
        { port: requestedPort },
      );
      evidence.push({
        kind: "http",
        path: "/api/health",
        status: quote.health.status,
        json: quote.health.json,
        responseKind: quote.health.kind,
        origin: quote.origin,
      });
      return envelope({
        ok: true,
        command: "serve",
        feature: "hosted-readback",
        evidence,
        result: { once: true, ...quote, start: "node server/index.js" },
      });
    } catch (error) {
      return envelope({
        ok: false,
        command: "serve",
        evidence,
        error: failError("HOST_BUILD", error.message, error.detail),
      });
    }
  }

  if (action !== "start") {
    return envelope({
      ok: false,
      command: "serve",
      status: "usage",
      error: failError("USAGE", "serve start|stop|status|once"),
    });
  }

  const prior = readServeState(root);
  if (prior?.pid) {
    let ours = false;
    try {
      process.kill(prior.pid, 0);
      if (prior.origin) {
        const health = await httpRequest(`${prior.origin}/api/health`, { timeoutMs: 2000 });
        ours = health.status === 200 && health.json?.service === "samedaydesk";
      }
    } catch {
      ours = false;
    }
    if (ours) {
      return envelope({
        ok: true,
        command: "serve",
        evidence,
        result: { alreadyRunning: true, ...prior },
      });
    }
    // Dead pid or PID reuse: drop the file. Do not kill a process that is not our health.
    clearServeState(root);
  }

  try {
    const handle = await startHost({ root, port: requestedPort, detached: true });
    if (!(handle.health?.status === 200 && handle.health.json?.service === "samedaydesk")) {
      killPid(handle.pid);
      const out = handle.output();
      return envelope({
        ok: false,
        command: "serve",
        evidence,
        error: failError("HOST_BUILD", "health check failed after node server/index.js", {
          health: handle.health,
          stdout: clip(out.stdout, 400),
          stderr: clip(out.stderr, 400),
        }),
      });
    }
    const state = {
      pid: handle.pid,
      port: handle.port,
      origin: handle.origin,
      argv: ["node", "server/index.js"],
      startedAt: new Date().toISOString(),
    };
    writeServeState(root, state);
    evidence.push({
      kind: "http",
      path: "/api/health",
      status: handle.health.status,
      json: handle.health.json,
      preview: previewBody(handle.health.body),
    });
    return envelope({
      ok: true,
      command: "serve",
      feature: "hosted-readback",
      evidence,
      result: state,
    });
  } catch (error) {
    return envelope({
      ok: false,
      command: "serve",
      evidence,
      error: failError("HOST_BUILD", error.message, error.detail),
    });
  }
}
