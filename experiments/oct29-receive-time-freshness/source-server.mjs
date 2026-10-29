import http from "node:http";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export const PINNED_SNAPSHOT_URL = "https://samedaydesk.com/api/observatory/snapshot";

const POPULATIONS = [
  ["jobCount", 122, "moltjobs_work_market"],
  ["marketplaceCompleted", 15, "moltjobs_marketplace_ordinary_third_party"],
  ["marketplaceEmployers", 4, "moltjobs_marketplace_employers"],
  ["liquidityRegisteredAgents", 434, "moltjobs_registered_agents"],
  ["liquidityAgentsEverPaid", 3, "moltjobs_agents_ever_paid"],
  ["liquidityAgentsBidding30d", 2, "moltjobs_agents_bidding_30d"],
  ["platformProgramJobs", 1, "moltjobs_platform_programs"],
];

function metric(key, value, population, state = "ok") {
  return {
    key,
    value: state === "ok" ? value : null,
    state,
    unit: "count",
    population,
    window: "point",
  };
}

export function snapshotBody(mode, stamped) {
  const at = Date.parse(stamped);
  let fetchedAt = stamped;
  let providerTimestamp = stamped;
  let providerTimestampState = "ok";
  const metrics = POPULATIONS.map(([key, value, population]) => metric(
    key,
    key === "marketplaceCompleted" && mode === "changed" ? 16 : value,
    population,
  ));
  if (mode === "future") {
    const ahead = new Date(at + 120_000).toISOString();
    fetchedAt = ahead;
    providerTimestamp = ahead;
  } else if (mode === "stale") {
    const old = new Date(at - (49 * 60 * 60 * 1000)).toISOString();
    fetchedAt = old;
    providerTimestamp = old;
  } else if (mode === "malformed") {
    fetchedAt = "not-a-timestamp";
    providerTimestamp = "not-a-timestamp";
    providerTimestampState = "ok";
  } else if (mode === "partial") {
    metrics.push(metric("disputeRate", null, "moltjobs_work_market", "missing"));
  }
  return {
    schemaVersion: "pilot.external-observatory.v1",
    fetchedAt: stamped,
    observations: [{
      sourceId: "moltjobs",
      sourceKind: "work_market",
      availability: "ok",
      fetchedAt,
      providerTimestamp,
      providerTimestampState,
      metrics,
    }],
  };
}

export function createLabClock(originIso) {
  const originMs = Date.parse(originIso);
  const markedMs = Date.now();
  let extra = 0;
  return {
    now() {
      return new Date(originMs + (Date.now() - markedMs) + extra).toISOString();
    },
    advance(ms) {
      extra += ms;
    },
  };
}

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
}

export function writeClockFile(file, originIso) {
  atomicWrite(file, `${JSON.stringify({ originMs: Date.parse(originIso), markedMs: Date.now() })}\n`);
}

export function readClockInstant(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return new Date(parsed.originMs + (Date.now() - parsed.markedMs)).toISOString();
}

export function advanceClockFile(file, ms) {
  const current = Date.parse(readClockInstant(file));
  atomicWrite(file, `${JSON.stringify({ originMs: current + ms, markedMs: Date.now() })}\n`);
}

export function writeModeFile(file, mode) {
  atomicWrite(file, `${JSON.stringify({ mode })}\n`);
}

export function readModeFile(file) {
  return JSON.parse(readFileSync(file, "utf8")).mode;
}

export async function publicLookup() {
  return [{ address: "1.1.1.1", family: 4 }];
}

export async function fetchPinnedThrough(requested, init, { port, mode }) {
  if (requested !== PINNED_SNAPSHOT_URL) {
    const error = new Error("snapshot reader received an unpinned URL");
    error.code = "ssrf";
    throw error;
  }
  return fetch(`http://127.0.0.1:${port}/snapshot?mode=${encodeURIComponent(mode)}`, {
    method: "GET",
    redirect: "manual",
    signal: init?.signal,
    headers: { accept: "application/json" },
  });
}

export async function startSourceServer({ clock, delayMs = 160 } = {}) {
  if (typeof clock !== "function") throw new Error("source server requires a clock function");
  const requests = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method !== "GET" || url.pathname !== "/snapshot") {
      res.writeHead(404, { "content-length": "0" });
      res.end();
      return;
    }
    const mode = url.searchParams.get("mode") || "fresh";
    const seenAt = clock();
    const entry = { mode, seenAt, status: null, completed: false };
    requests.push(entry);
    if (mode === "hold") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.write("{");
      entry.status = 200;
      entry.held = true;
      return;
    }
    setTimeout(() => {
      if (res.writableEnded || res.destroyed) {
        entry.aborted = true;
        return;
      }
      const stampedAt = clock();
      entry.stampedAt = stampedAt;
      if (mode === "http") {
        const body = JSON.stringify({ error: "unavailable" });
        res.writeHead(503, {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body),
        });
        res.end(body);
        entry.status = 503;
        entry.completed = true;
        entry.body = body;
        return;
      }
      if (mode === "parse") {
        const body = "not-json{";
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body),
        });
        res.end(body);
        entry.status = 200;
        entry.completed = true;
        entry.body = body;
        return;
      }
      const document = snapshotBody(mode, stampedAt);
      const body = JSON.stringify(document);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      entry.status = 200;
      entry.completed = true;
      entry.body = document;
    }, delayMs);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    requests,
    async close() {
      for (const socket of sockets) socket.destroy();
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
