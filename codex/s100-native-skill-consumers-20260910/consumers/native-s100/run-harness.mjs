#!/usr/bin/env node
/**
 * S100 native consumer harness — launches independent Grok 4.6 xhigh children.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
if (argv.includes('--verify-only') || argv.includes('--verify-only')) {
  // Offline acceptance against sanitized artifacts. Never launches models.
  const { spawnSync } = await import('node:child_process');
  const forwarded = argv.filter((a) => a !== '--verify-only' && a !== '--verify-only');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'verify-only.mjs'), ...forwarded], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`S100 native harness

Offline (default for Root handoff acceptance):
  node consumers/native-s100/run-harness.mjs --verify-only
  node consumers/native-s100/verify-only.mjs

Local model re-execution (optional; not required to verify S100 evidence):
  S100_SKILLS_ROOT=... S100_MERCHANT_DIR=... S100_STATUS_DIR=... \\
    node consumers/native-s100/run-harness.mjs [case-id ...]

--verify-only never launches models, opens network, signs, or calls paid gateways.
`);
  process.exit(0);
}

const SKILLS_ROOT = process.env.S100_SKILLS_ROOT
  ? path.resolve(process.env.S100_SKILLS_ROOT)
  : path.resolve(__dirname, '../..');
const STATUS = process.env.S100_STATUS_DIR || '/tmp/s100-status';
const casesDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const selected = argv.filter((a) => !a.startsWith('--'));
const toRun = selected.length
  ? casesDoc.cases.filter((c) => selected.includes(c.id))
  : casesDoc.cases;

for (const d of ['cases', 'logs', 'admission']) {
  fs.mkdirSync(path.join(STATUS, d), { recursive: true });
}

function memSample() {
  const info = Object.fromEntries(
    fs.readFileSync('/proc/meminfo', 'utf8').trim().split('\n').map((line) => {
      const [k, v] = line.split(':');
      return [k, Number(v.trim().split(' ')[0]) * 1024];
    }),
  );
  let psi = null;
  try { psi = fs.readFileSync('/proc/pressure/memory', 'utf8').trim(); } catch { /* optional */ }
  return {
    at: new Date().toISOString(),
    MemTotal: info.MemTotal,
    MemAvailable: info.MemAvailable,
    reserve25: Math.floor(info.MemTotal / 4),
    freeAfterReserve: info.MemAvailable - Math.floor(info.MemTotal / 4),
    psi,
  };
}

function buildPrompt(spec) {
  const skillPath = path.join(SKILLS_ROOT, 'skills', spec.skill, 'SKILL.md');
  const skillText = fs.readFileSync(skillPath, 'utf8');
  const caseDir = path.join(STATUS, 'cases', spec.id);
  fs.mkdirSync(path.join(caseDir, 'artifact'), { recursive: true });
  const artifactAbs = path.join(caseDir, 'artifact', spec.artifact);
  return `You are an independent fresh-context consumer of a published SameDayDesk gateway skill.

HARD RULES:
- Paid endpoints and signing are DISABLED.
- Do not create extra API billing beyond this subscribed model session.
- You MAY use unpaid live discovery (catalog/openapi) and a single unpaid HTTP 402 challenge, then STOP.
- You MAY run the owner-qa fixture CLI when the task says so.
- Label owner-qa outputs with ownerQa=true / owner-qa-deterministic-fixture.
- Actually use tools (shell/web). Do not emit markers or recite fixture results from memory without running tools.
- Write the final usable JSON artifact to this absolute path:
  ${artifactAbs}
- Shell cwd for relative paths: ${SKILLS_ROOT}

PUBLIC SKILL INSTRUCTIONS (verbatim):
-----
${skillText}
-----

BOUNDED TASK:
${spec.task}

When the artifact file exists as valid JSON, stop.
`;
}

function launchCase(spec) {
  const caseDir = path.join(STATUS, 'cases', spec.id);
  fs.mkdirSync(path.join(caseDir, 'artifact'), { recursive: true });
  const promptPath = path.join(caseDir, 'prompt.md');
  fs.writeFileSync(promptPath, buildPrompt(spec));
  fs.writeFileSync(path.join(caseDir, 'meta.json'), JSON.stringify({
    ...spec,
    skillsPin: casesDoc.skillsPin,
    merchantPin: casesDoc.merchantPin,
    startedAt: new Date().toISOString(),
    admission: memSample(),
  }, null, 2));

  const outPath = path.join(STATUS, 'logs', `${spec.id}.jsonl`);
  const errPath = path.join(STATUS, 'logs', `${spec.id}.stderr.log`);
  const outFd = fs.openSync(outPath, 'w');
  const errFd = fs.openSync(errPath, 'w');
  const started = Date.now();
  const grokBin = process.env.S100_GROK_BIN || '/home/ubuntu/.grok/bin/grok';
  const child = spawn(grokBin, [
    '--model', casesDoc.model,
    '--reasoning-effort', casesDoc.reasoningEffort,
    '--permission-mode', 'bypassPermissions',
    '--always-approve',
    '--output-format', 'streaming-messages-json',
    '--cwd', SKILLS_ROOT,
    '--prompt-file', promptPath,
  ], {
    stdio: ['ignore', outFd, errFd],
    env: {
      ...process.env,
      PATH: `/home/ubuntu/.grok/bin:${process.env.PATH || ''}`,
      S100_MERCHANT_DIR: process.env.S100_MERCHANT_DIR || '',
      S100_CASE_ID: spec.id,
    },
  });
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  fs.writeFileSync(path.join(caseDir, 'pid'), String(child.pid));
  return { spec, child, caseDir, outPath, started };
}

const admission = memSample();
fs.writeFileSync(path.join(STATUS, 'admission', 'cohort-start.json'), JSON.stringify({
  cohort: toRun.map((c) => c.id),
  size: toRun.length,
  admission,
}, null, 2));

if (admission.freeAfterReserve < 2_000_000_000) {
  console.error('insufficient free-after-reserve memory', admission);
  process.exit(2);
}

console.log(JSON.stringify({ launching: toRun.map((c) => c.id), admission }, null, 2));
const handles = toRun.map(launchCase);

const results = await Promise.all(handles.map(({ spec, child, caseDir, outPath, started }) => new Promise((resolve) => {
  child.on('exit', (code, signal) => {
    const finished = Date.now();
    try { fs.copyFileSync(outPath, path.join(caseDir, 'transcript.jsonl')); } catch { /* ignore */ }
    const accept = spawn('node', [path.join(__dirname, 'accept.mjs'), caseDir, spec.id], {
      cwd: SKILLS_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let acceptOut = '';
    accept.stdout.on('data', (d) => { acceptOut += d; });
    accept.stderr.on('data', (d) => { acceptOut += d; });
    accept.on('exit', () => {
      let acceptance = null;
      try { acceptance = JSON.parse(acceptOut.trim().split('\n').at(-1)); } catch {
        acceptance = { ok: false, parseError: true, raw: acceptOut.slice(0, 1000) };
      }
      const summary = {
        id: spec.id,
        family: spec.family,
        skill: spec.skill,
        exitCode: code,
        signal,
        latencyMs: finished - started,
        acceptance,
        completionAdmission: memSample(),
      };
      fs.writeFileSync(path.join(caseDir, 'summary.json'), JSON.stringify(summary, null, 2));
      resolve(summary);
    });
  });
})));

const payload = {
  finishedAt: new Date().toISOString(),
  results,
  peaks: { start: admission, end: memSample() },
};
fs.writeFileSync(path.join(STATUS, 'cohort-results.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify({
  done: true,
  accepted: results.filter((r) => r.acceptance?.ok).map((r) => r.id),
  failed: results.filter((r) => !r.acceptance?.ok).map((r) => ({ id: r.id, failures: r.acceptance?.failures, raw: r.acceptance?.raw?.slice?.(0, 200) })),
  latenciesMs: Object.fromEntries(results.map((r) => [r.id, r.latencyMs])),
}, null, 2));
