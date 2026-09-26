#!/usr/bin/env node
/**
 * S138 cohort admission helper.
 * Counts actual native working grok sessions (session-id + prompt), not idle wrappers.
 * Enforces accepted 25% MemAvailable reserve of MemTotal.
 * Logs admission / completion / gate events only to evidence/admission-events.jsonl.
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CELLS = join(ROOT, "cells");
const EVENTS = join(ROOT, "evidence", "admission-events.jsonl");
const GROK = process.env.GROK_BIN || "/home/ubuntu/.local/bin/grok";
const RESERVE_FRACTION = 0.25;

function mem() {
  const text = readFileSync("/proc/meminfo", "utf8");
  const get = (k) => Number((text.match(new RegExp(`^${k}:\\s+(\\d+)`, "m")) || [])[1] || 0);
  return { MemTotal: get("MemTotal"), MemAvailable: get("MemAvailable") };
}

function psiLine() {
  try {
    return readFileSync("/proc/pressure/memory", "utf8").trim().split("\n")[0] || "";
  } catch {
    return "";
  }
}

/** Working sessions: grok model jobs with --session-id and a prompt, excluding usage probes. */
export function listWorkingSessions() {
  const r = spawnSync("ps", ["-eo", "pid,etimes,args"], { encoding: "utf8" });
  const lines = (r.stdout || "").split("\n");
  const sessions = [];
  for (const line of lines) {
    if (!line.includes("/bin/grok ")) continue;
    if (!line.includes("--session-id")) continue;
    const hasPrompt =
      line.includes("--prompt-file") || line.includes(" --single ") || / -p /.test(line);
    if (!hasPrompt) continue;
    if (/\busage\b/.test(line) && !line.includes("--prompt-file")) continue;
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const sid = (m[3].match(/--session-id\s+(\S+)/) || [])[1] || null;
    sessions.push({
      pid: Number(m[1]),
      etimes: Number(m[2]),
      sessionId: sid,
      cmd: m[3].slice(0, 180),
    });
  }
  return sessions;
}

function event(type, fields) {
  mkdirSync(dirname(EVENTS), { recursive: true });
  const m = mem();
  const row = {
    ts: new Date().toISOString(),
    type,
    MemTotalKiB: m.MemTotal,
    MemAvailableKiB: m.MemAvailable,
    reserveFloorKiB: Math.ceil(m.MemTotal * RESERVE_FRACTION),
    psi: psiLine(),
    workingSessions: listWorkingSessions().length,
    ...fields,
  };
  appendFileSync(EVENTS, `${JSON.stringify(row)}\n`);
  return row;
}

export function canAdmit() {
  const m = mem();
  const floor = Math.ceil(m.MemTotal * RESERVE_FRACTION);
  return {
    ok: m.MemAvailable > floor,
    MemAvailableKiB: m.MemAvailable,
    reserveFloorKiB: floor,
  };
}

export function launchCell(cellId, { wait = true } = {}) {
  const prompt = join(CELLS, cellId, "prompt.md");
  const outDir = join(CELLS, cellId);
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(prompt)) throw new Error(`missing prompt ${prompt}`);
  const gate = canAdmit();
  if (!gate.ok) {
    event("gate", { cellId, reason: "mem_available_below_25pct_total", ...gate });
    return { admitted: false, cellId, reason: "gate", ...gate };
  }
  const sid = spawnSync("python3", ["-c", "import uuid; print(uuid.uuid4())"], {
    encoding: "utf8",
  }).stdout.trim();
  writeFileSync(join(outDir, "session"), `${sid}\n`);
  writeFileSync(join(outDir, "ONE-WRITER"), `exclusive write path: cells/${cellId}/\n`);
  const child = spawn(
    GROK,
    [
      "--always-approve",
      "--model",
      "grok-4.6",
      "--reasoning-effort",
      "xhigh",
      "--cwd",
      ROOT,
      "--session-id",
      sid,
      "--output-format",
      "plain",
      "--prompt-file",
      prompt,
    ],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GROK_HOME: process.env.GROK_HOME || `${process.env.HOME}/.grok-pilot-canary`,
      },
    },
  );
  writeFileSync(join(outDir, "pid"), `${child.pid}\n`);
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => {
    out += c;
  });
  child.stderr.on("data", (c) => {
    err += c;
  });
  const done = new Promise((resolve) => {
    child.on("close", (code) => {
      writeFileSync(join(outDir, "out.txt"), out);
      writeFileSync(join(outDir, "err.txt"), err);
      writeFileSync(join(outDir, "exit"), `${code}\n`);
      try {
        const usage = spawnSync(GROK, ["usage", sid], { encoding: "utf8", timeout: 60000 });
        writeFileSync(join(outDir, "usage.json"), usage.stdout || usage.stderr || "");
      } catch {
        /* ignore */
      }
      event("completion", { cellId, sessionId: sid, exit: code });
      resolve({ cellId, sessionId: sid, exit: code });
    });
  });
  event("admission", { cellId, sessionId: sid, pid: child.pid, ...gate });
  return { admitted: true, cellId, sessionId: sid, pid: child.pid, done, wait };
}

const cmd = process.argv[2];
if (cmd === "status") {
  const m = mem();
  console.log(
    JSON.stringify(
      {
        ...m,
        reserveFloorKiB: Math.ceil(m.MemTotal * RESERVE_FRACTION),
        psi: psiLine(),
        workingSessions: listWorkingSessions(),
      },
      null,
      2,
    ),
  );
} else if (cmd === "admit") {
  const wait = process.argv.includes("--wait");
  const ids = process.argv.slice(3).filter((a) => a !== "--wait");
  const results = [];
  for (const id of ids) {
    results.push(launchCell(id, { wait }));
  }
  console.log(
    JSON.stringify(
      {
        launched: results.filter((r) => r.admitted).map((r) => r.cellId),
        blocked: results.filter((r) => !r.admitted),
        workingSessions: listWorkingSessions().length,
      },
      null,
      2,
    ),
  );
  await Promise.all(results.filter((r) => r.done).map((r) => r.done));
} else {
  console.error("Usage: admit-cohort.mjs status | admit [--wait] <cellId>...");
  process.exit(2);
}
