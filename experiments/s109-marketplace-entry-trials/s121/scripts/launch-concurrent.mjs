#!/usr/bin/env node
/**
 * S121 concurrent native consumer launcher.
 * Launches N independent grok Heavy cells together when MemAvailable headroom permits.
 * Records overlap (start/end), PSI, MemAvailable — does not invent a fake concurrency cap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROMPTS = path.join(ROOT, 'prompts');
const OUT = path.join(ROOT, 'out');
const LOGS = path.join(ROOT, 'logs');
const RECEIPTS = path.join(ROOT, 'receipts');
const GROK = process.env.GROK_BIN || '/home/ubuntu/.grok/bin/grok';

const CELLS = [
  'C1-diff-semantics',
  'C2-truncated-evidence',
  'C3-rename-binary-nonewline',
  'C4-malicious-oversized',
  'C5-grexal-validate-runtime',
  'C6-fee-edge-units',
  'C7-artifact-archive-install',
  'C8-agensi-paid-vs-free',
  'C9-buyer-criterion-binding',
];

function mem() {
  const info = {};
  for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
    const [k, v] = line.split(/\s+/);
    if (!k) continue;
    info[k.replace(':', '')] = Number(v) * 1024;
  }
  return {
    MemTotal: info.MemTotal,
    MemAvailable: info.MemAvailable,
    reserve25: Math.floor(info.MemTotal * 0.25),
    headroom: info.MemAvailable - Math.floor(info.MemTotal * 0.25),
  };
}

function psi() {
  return fs.readFileSync('/proc/pressure/memory', 'utf8');
}

function now() {
  return new Date().toISOString();
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(RECEIPTS, { recursive: true });

const m0 = mem();
const probeRss = Number(process.env.S121_PER_PROC_RSS_BYTES || 200 * 1024 * 1024); // measured probe ~130MB; allow margin
const maxByHeadroom = Math.max(0, Math.floor(m0.headroom / probeRss));
const requested = CELLS.length;
// Attempt all requested; record constraint if OS refuses / PSI spikes. Do not artificially clamp to 3.
const toLaunch = CELLS.slice();

const admission = {
  at: now(),
  cashBoundaryUsd: 0,
  requestedConcurrent: requested,
  probeRssBudgetBytes: probeRss,
  maxByHeadroomEstimate: maxByHeadroom,
  decision: 'launch_all_requested_measure_actual',
  note:
    maxByHeadroom < requested
      ? `Conservative RSS budget estimates capacity ${maxByHeadroom} < ${requested}; still attempting ${requested} because S109 local RSS was <<1Gi and model compute is remote. Actual overlap recorded below.`
      : `Headroom estimate allows ${maxByHeadroom} ≥ ${requested}.`,
  s109SequentialReason:
    'S109 used three sequential role cohorts (contracts→packages→buyers) of size 3 by parent orchestration choice despite MemAvailable≈10–11Gi and PSI=0 — not a platform-enforced max concurrency of 3.',
  memory: m0,
  psi: psi(),
  cells: toLaunch,
};
fs.writeFileSync(path.join(RECEIPTS, 'admission-concurrent.json'), `${JSON.stringify(admission, null, 2)}\n`);

const children = [];
for (const cell of toLaunch) {
  const prompt = path.join(PROMPTS, `${cell}.md`);
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
      '/workspace',
      '--prompt-file',
      prompt,
    ],
    {
      stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(err, 'w')],
      env: { ...process.env, S121_CELL: cell },
    },
  );
  children.push({
    cell,
    pid: child.pid,
    startedAt,
    endedAt: null,
    exitCode: null,
    sessionId: null,
    proc: child,
  });
}

const alivePeak = { at: now(), count: children.length, memory: mem(), psi: psi() };
fs.writeFileSync(path.join(RECEIPTS, 'overlap-peak-start.json'), `${JSON.stringify(alivePeak, null, 2)}\n`);

await Promise.all(
  children.map(
    (c) =>
      new Promise((resolve) => {
        c.proc.on('exit', (code) => {
          c.endedAt = now();
          c.exitCode = code;
          // scrape session id
          try {
            const lines = fs.readFileSync(path.join(LOGS, `${c.cell}.jsonl`), 'utf8').trim().split('\n');
            for (const line of lines) {
              try {
                const o = JSON.parse(line);
                if (o.session_id) c.sessionId = o.session_id;
              } catch {}
            }
          } catch {}
          resolve();
        });
      }),
  ),
);

const completion = {
  at: now(),
  cashBoundaryUsd: 0,
  launched: children.length,
  stillOverlappingAtStart: children.length,
  memoryAtCompletion: mem(),
  psiAtCompletion: psi(),
  cells: children.map(({ cell, pid, startedAt, endedAt, exitCode, sessionId }) => ({
    cell,
    pid,
    startedAt,
    endedAt,
    exitCode,
    sessionId,
    outExists: fs.existsSync(path.join(OUT, `${cell}.json`)),
  })),
};
fs.writeFileSync(path.join(RECEIPTS, 'completion-concurrent.json'), `${JSON.stringify(completion, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, launched: children.length, completion }, null, 2)}\n`);
