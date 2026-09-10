#!/usr/bin/env node
/**
 * S134 admission launcher — native Grok Heavy children.
 * Wave0: 9 cells. Then +3 / +6 / +6 while earlier still alive when
 * MemAvailable−25% reserve and PSI avg10 allow. No marker probes.
 * No grandchildren (docs: subagent depth 1). Concurrent ceiling unknown.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROMPTS = path.join(ROOT, 'prompts');
const LOGS = path.join(ROOT, 'logs');
const OUT = path.join(ROOT, 'out');
const RECEIPTS = path.join(ROOT, 'receipts');
const GROK = process.env.GROK_BIN || '/home/ubuntu/.grok/bin/grok';
const REPO = process.env.S134_REPO || '/workspace';

const ALL = Array.from({ length: 24 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
const WAVES = [
  { name: 'wave0-initial9', cells: ALL.slice(0, 9) },
  { name: 'wave1-plus3', cells: ALL.slice(9, 12) },
  { name: 'wave2-plus6', cells: ALL.slice(12, 18) },
  { name: 'wave3-plus6', cells: ALL.slice(18, 24) },
];

const PER_PROC_RSS = Number(process.env.S134_PER_PROC_RSS_BYTES || 200 * 1024 * 1024);
const PSI_BLOCK = Number(process.env.S134_PSI_BLOCK_AVG10 || 0.25);
const MAX_MS = Number(process.env.S134_LAUNCHER_MAX_MS || 90 * 60 * 1000);

for (const d of [LOGS, OUT, RECEIPTS]) fs.mkdirSync(d, { recursive: true });

function mem() {
  const info = {};
  for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
    const [k, v] = line.split(/\s+/);
    if (!k) continue;
    info[k.replace(':', '')] = Number(v) * 1024;
  }
  const reserve25 = Math.floor(info.MemTotal * 0.25);
  return {
    MemTotal: info.MemTotal,
    MemAvailable: info.MemAvailable,
    reserve25,
    headroom: info.MemAvailable - reserve25,
  };
}

function psiText() {
  return fs.readFileSync('/proc/pressure/memory', 'utf8');
}

function psiAvg10() {
  const m = /avg10=([0-9.]+)/.exec(psiText().split('\n')[0] || '');
  return m ? Number(m[1]) : 0;
}

function now() {
  return new Date().toISOString();
}

function canAdmit(n) {
  const m = mem();
  const avg10 = psiAvg10();
  const maxByHeadroom = Math.max(0, Math.floor(m.headroom / PER_PROC_RSS));
  const reasons = [];
  if (avg10 >= PSI_BLOCK) reasons.push(`psi_avg10=${avg10}>=${PSI_BLOCK}`);
  if (maxByHeadroom < n) reasons.push(`headroom_cells=${maxByHeadroom}<requested_${n}`);
  return { ok: reasons.length === 0, reasons, memory: m, psiAvg10: avg10, maxByHeadroom, requested: n };
}

const children = new Map();
const events = [];

function aliveCount() {
  let n = 0;
  for (const c of children.values()) if (!c.endedAt) n++;
  return n;
}

function persist() {
  const snapshot = {
    at: now(),
    cashBoundaryUsd: 0,
    paidValueClaim: false,
    nativeCatalogNotes: {
      subscriptionTierDisplay: 'SuperGrok Heavy',
      modelId: 'grok-4.6',
      reasoningEffort: 'xhigh',
      subagentsMaxDepthDocs: 1,
      subagentsMaxConcurrentCatalog: null,
      userReportedMaxChildren: 64,
      userReportedMaxVerified: false,
      grandchildren: 'forbidden-by-docs-depth-1',
    },
    alive: aliveCount(),
    launched: [...children.values()],
    events,
    memory: mem(),
    psi: psiText(),
  };
  fs.writeFileSync(path.join(RECEIPTS, 'live.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
}

function launchOne(cell) {
  const prompt = path.join(PROMPTS, `${cell}.md`);
  if (!fs.existsSync(prompt)) {
    events.push({ at: now(), type: 'missing-prompt', cell });
    return null;
  }
  fs.mkdirSync(path.join(OUT, cell), { recursive: true });
  const log = path.join(LOGS, `${cell}.jsonl`);
  const err = path.join(LOGS, `${cell}.stderr`);
  const startedAt = now();
  const child = spawn(
    GROK,
    [
      '--model',
      'grok-4.6',
      '--reasoning-effort',
      'xhigh',
      '--permission-mode',
      'bypassPermissions',
      '--always-approve',
      '--output-format',
      'streaming-messages-json',
      '--cwd',
      REPO,
      '--prompt-file',
      prompt,
    ],
    {
      stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(err, 'w')],
      env: { ...process.env, S134_CELL: cell, GROK_DISABLE_WEB_SEARCH: '1' },
    },
  );
  const rec = {
    cell,
    pid: child.pid,
    startedAt,
    endedAt: null,
    exitCode: null,
    sessionId: null,
    admissionMemory: mem(),
    admissionPsi: psiText().split('\n')[0],
  };
  children.set(cell, rec);
  events.push({ at: startedAt, type: 'launch', cell, pid: child.pid });
  child.on('exit', (code) => {
    rec.endedAt = now();
    rec.exitCode = code;
    try {
      for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const j = JSON.parse(line);
          if (j.session_id) rec.sessionId = j.session_id;
          if (j.sessionId) rec.sessionId = j.sessionId;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    events.push({
      at: rec.endedAt,
      type: 'exit',
      cell,
      exitCode: code,
      sessionId: rec.sessionId,
      receiptExists: fs.existsSync(path.join(OUT, cell, 'receipt.json')),
    });
    persist();
  });
  return rec;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function admitWave(wave) {
  const decision = canAdmit(wave.cells.length);
  const receipt = { at: now(), wave: wave.name, cells: wave.cells, decision, aliveBefore: aliveCount() };
  if (!decision.ok) {
    receipt.action = 'reject';
    events.push({ at: now(), type: 'admit-reject', wave: wave.name, reasons: decision.reasons });
    fs.writeFileSync(path.join(RECEIPTS, `admit-${wave.name}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
    persist();
    return receipt;
  }
  receipt.action = 'launch';
  receipt.pids = [];
  for (const cell of wave.cells) {
    const rec = launchOne(cell);
    if (rec) receipt.pids.push({ cell, pid: rec.pid });
    await sleep(150);
  }
  receipt.aliveAfter = aliveCount();
  receipt.overlapObserved = receipt.aliveAfter;
  fs.writeFileSync(path.join(RECEIPTS, `admit-${wave.name}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  persist();
  return receipt;
}

async function main() {
  fs.writeFileSync(
    path.join(RECEIPTS, 'boot.json'),
    `${JSON.stringify(
      {
        at: now(),
        waves: WAVES.map((w) => ({ name: w.name, n: w.cells.length, cells: w.cells })),
        perProcRssBytes: PER_PROC_RSS,
        psiBlockAvg10: PSI_BLOCK,
        memory: mem(),
        psi: psiText(),
        catalog: {
          subagentsMaxDepthDocs: 1,
          subagentsMaxConcurrentCatalog: null,
          userReportedMaxChildrenUnverified: 64,
        },
      },
      null,
      2,
    )}\n`,
  );

  await admitWave(WAVES[0]);

  let nextWave = 1;
  const t0 = Date.now();
  while (nextWave < WAVES.length && Date.now() - t0 < MAX_MS) {
    persist();
    const alive = aliveCount();
    const preview = canAdmit(WAVES[nextWave].cells.length);
    // Prefer admitting while earlier cells still alive
    if (preview.ok && (alive > 0 || nextWave >= 1)) {
      await admitWave(WAVES[nextWave]);
      nextWave++;
      continue;
    }
    events.push({
      at: now(),
      type: preview.ok ? 'admit-idle' : 'admit-wait',
      wave: WAVES[nextWave].name,
      reasons: preview.ok ? ['waiting-for-overlap-or-cycle'] : preview.reasons,
      alive,
    });
    if (alive === 0 && !preview.ok) {
      events.push({ at: now(), type: 'admit-reject-final', wave: WAVES[nextWave].name, reasons: preview.reasons });
      break;
    }
    await sleep(5000);
  }

  while (aliveCount() > 0 && Date.now() - t0 < MAX_MS) {
    persist();
    await sleep(5000);
  }

  const final = {
    at: now(),
    elapsedMs: Date.now() - t0,
    launchedCount: children.size,
    completed: [...children.values()].filter((c) => c.endedAt).length,
    receiptsPresent: ALL.filter((c) => fs.existsSync(path.join(OUT, c, 'receipt.json'))),
    cells: [...children.values()],
    events,
    memory: mem(),
    psi: psiText(),
    wavesAttempted: nextWave,
  };
  fs.writeFileSync(path.join(RECEIPTS, 'final.json'), `${JSON.stringify(final, null, 2)}\n`);
  persist();
  process.stdout.write(`${JSON.stringify({ ok: true, launched: children.size, wavesAttempted: nextWave }, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
