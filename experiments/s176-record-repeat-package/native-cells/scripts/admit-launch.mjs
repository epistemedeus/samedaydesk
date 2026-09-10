#!/usr/bin/env node
/**
 * S176 native admit — useful cells only (S176-N01..N04).
 * Reuses S163 admission math; does not touch native05..08.
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
const CELLS = ['S176-N01', 'S176-N02', 'S176-N03', 'S176-N04'];
const PER_RSS = 200 * 1024 * 1024;
const PSI_BLOCK = 0.25;
const wave = process.argv.includes('--all') ? CELLS : CELLS.slice(0, Number(process.env.S176_ADMIT_N || 2));

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
    { stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(err, 'w')] },
  );
  const rec = { cell, pid: child.pid, startedAt: new Date().toISOString(), endedAt: null, code: null };
  children.set(cell, rec);
  events.push({ type: 'launch', cell, pid: child.pid, at: rec.startedAt });
  child.on('exit', (code) => {
    rec.endedAt = new Date().toISOString();
    rec.code = code;
    events.push({ type: 'exit', cell, code, at: rec.endedAt });
    persist();
  });
  persist();
  return rec;
}

const gate = canAdmit(wave.length);
fs.writeFileSync(path.join(RECEIPTS, 'admit-wave.json'), `${JSON.stringify({ gate, wave, at: startedAt }, null, 2)}\n`);
if (!gate.ok) {
  console.error(JSON.stringify({ admitted: false, gate }, null, 2));
  process.exit(2);
}
for (const cell of wave) launchOne(cell);
console.log(JSON.stringify({ admitted: true, wave, runtime: RUNTIME, memory: mem() }, null, 2));

const timer = setInterval(() => {
  const alive = [...children.values()].filter((c) => !c.endedAt).length;
  persist({ peekAlive: alive });
  if (alive === 0) {
    clearInterval(timer);
    const final = persist({ final: true });
    fs.writeFileSync(path.join(RECEIPTS, 'final.json'), `${JSON.stringify(final, null, 2)}\n`);
    const failed = [...children.values()].filter((c) => c.code).length;
    process.exit(failed ? 1 : 0);
  }
}, 5000);
