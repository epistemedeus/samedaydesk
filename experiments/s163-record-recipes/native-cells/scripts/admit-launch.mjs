#!/usr/bin/env node
/**
 * S163 native admit — useful cells only (S163-N01..N06).
 * Reuses S134 admission math; does not touch native05..08.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CELLS_ROOT = path.resolve(__dirname, '..');
const PKG = path.resolve(CELLS_ROOT, '..');
const PROMPTS = path.join(CELLS_ROOT, 'prompts');
const LOGS = path.join(CELLS_ROOT, 'logs');
const OUT = path.join(CELLS_ROOT, 'out');
const RECEIPTS = path.join(CELLS_ROOT, 'receipts');
const GROK = process.env.GROK_BIN || '/home/ubuntu/.grok/bin/grok';

function discoverRuntime() {
  try {
    const cache = JSON.parse(fs.readFileSync('/home/ubuntu/.grok/models_cache.json', 'utf8'));
    const models = cache.models || cache;
    const ids = Object.values(models)
      .map((m) => m?.info || m)
      .filter((m) => m && m.model)
      .map((m) => ({
        model: m.model,
        efforts: (m.reasoning_efforts || []).map((e) => e.id || e.value).filter(Boolean),
        defaultEffort: m.reasoning_effort,
      }));
    const pick = ids.find((m) => m.model === 'grok-4.6') || ids[0];
    const effort = (pick?.efforts || []).includes('xhigh') ? 'xhigh' : pick?.defaultEffort || 'high';
    return { model: pick?.model || 'grok-4.6', effort, catalog: ids.slice(0, 4) };
  } catch (e) {
    return { model: 'grok-4.6', effort: 'xhigh', catalog: [], error: String(e) };
  }
}

const RUNTIME = discoverRuntime();
const CELLS = ['S163-N01', 'S163-N02', 'S163-N03', 'S163-N04', 'S163-N05', 'S163-N06'];
const PER_RSS = 200 * 1024 * 1024;
const PSI_BLOCK = 0.25;

for (const d of [LOGS, OUT, RECEIPTS]) fs.mkdirSync(d, { recursive: true });

function mem() {
  const info = {};
  for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
    const [k, v] = line.split(/\s+/);
    if (!k) continue;
    info[k.replace(':', '')] = Number(v) * 1024;
  }
  const reserve25 = Math.floor(info.MemTotal * 0.25);
  return { MemTotal: info.MemTotal, MemAvailable: info.MemAvailable, reserve25, headroom: info.MemAvailable - reserve25 };
}
function psiAvg10() {
  const t = fs.readFileSync('/proc/pressure/memory', 'utf8');
  const m = /avg10=([0-9.]+)/.exec(t.split('\n')[0] || '');
  return m ? Number(m[1]) : 0;
}
function diskFreeRatio() {
  try {
    const s = fs.statfsSync('/');
    return s.bavail / s.blocks;
  } catch {
    return 1;
  }
}
function canAdmit(n) {
  const m = mem();
  const avg10 = psiAvg10();
  const diskFree = diskFreeRatio();
  const maxByHeadroom = Math.max(0, Math.floor(m.headroom / PER_RSS));
  const reasons = [];
  if (avg10 >= PSI_BLOCK) reasons.push(`psi_avg10=${avg10}`);
  if (maxByHeadroom < n) reasons.push(`headroom_cells=${maxByHeadroom}<${n}`);
  if (diskFree < 0.2) reasons.push(`disk_free_ratio=${diskFree}<0.2`);
  const effPct = m.headroom / m.MemTotal;
  if (effPct < 0.25) reasons.push(`effective_mem_pct=${effPct}`);
  return { ok: reasons.length === 0, reasons, memory: m, psiAvg10: avg10, diskFree, maxByHeadroom, runtime: RUNTIME };
}

const children = new Map();
const events = [];
const startedAt = new Date().toISOString();

function persist(extra = {}) {
  const snap = {
    at: new Date().toISOString(),
    startedAt,
    runtime: RUNTIME,
    alive: [...children.values()].filter((c) => !c.endedAt).length,
    launched: [...children.values()],
    events,
    memory: mem(),
    psiAvg10: psiAvg10(),
    diskFreeRatio: diskFreeRatio(),
    excludes: ['native05', 'native06', 'native07', 'native08'],
    ...extra,
  };
  fs.writeFileSync(path.join(RECEIPTS, 'live.json'), `${JSON.stringify(snap, null, 2)}\n`);
  return snap;
}

function launchOne(cell) {
  const prompt = path.join(PROMPTS, `${cell}.md`);
  fs.mkdirSync(path.join(OUT, cell), { recursive: true });
  const log = path.join(LOGS, `${cell}.jsonl`);
  const err = path.join(LOGS, `${cell}.stderr`);
  const child = spawn(
    GROK,
    [
      '--model', RUNTIME.model,
      '--reasoning-effort', RUNTIME.effort,
      '--permission-mode', 'bypassPermissions',
      '--always-approve',
      '--output-format', 'streaming-json',
      '--cwd', PKG,
      '--prompt-file', prompt,
    ],
    { stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(err, 'w')], env: { ...process.env, S163_CELL: cell } },
  );
  const rec = { cell, pid: child.pid, startedAt: new Date().toISOString(), endedAt: null, exitCode: null, sessionId: null };
  children.set(cell, rec);
  events.push({ at: rec.startedAt, type: 'launch', cell, pid: child.pid });
  child.on('exit', (code) => {
    rec.endedAt = new Date().toISOString();
    rec.exitCode = code;
    try {
      for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const j = JSON.parse(line);
          if (j.session_id || j.sessionId) rec.sessionId = j.session_id || j.sessionId;
        } catch {}
      }
    } catch {}
    events.push({ at: rec.endedAt, type: 'exit', cell, exitCode: code, sessionId: rec.sessionId });
    persist();
  });
  return rec;
}

const decision = canAdmit(CELLS.length);
fs.writeFileSync(path.join(RECEIPTS, 'admit-wave0.json'), `${JSON.stringify({ decision, cells: CELLS }, null, 2)}\n`);
if (!decision.ok) {
  console.error('ADMIT_REJECT', decision);
  persist({ rejected: true });
  process.exit(2);
}
for (const cell of CELLS) {
  launchOne(cell);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
}
persist({ wave: 'wave0-plus6-useful-only', targetCeilingNote: '48 is aspirational; useful set is 6' });
console.log(JSON.stringify({ admitted: CELLS.length, runtime: RUNTIME, overlapTarget: CELLS.length }, null, 2));

const deadline = Date.now() + Number(process.env.S163_WAIT_MS || 20 * 60 * 1000);
const timer = setInterval(() => {
  const alive = [...children.values()].filter((c) => !c.endedAt).length;
  persist({ pollAlive: alive });
  if (alive === 0 || Date.now() > deadline) {
    clearInterval(timer);
    const final = persist({ final: true });
    fs.writeFileSync(path.join(RECEIPTS, 'final.json'), `${JSON.stringify(final, null, 2)}\n`);
    process.exit(0);
  }
}, 5000);
