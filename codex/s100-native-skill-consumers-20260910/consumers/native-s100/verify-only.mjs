#!/usr/bin/env node
/**
 * S100 offline acceptance verifier.
 *
 * Replays acceptance against previously sanitized artifacts.
 * Never launches models, opens network sockets, signs, or calls paid gateways.
 *
 * Usage (from this package directory):
 *   node consumers/native-s100/verify-only.mjs
 *   node consumers/native-s100/run-harness.mjs --verify-only
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '../..');
const casesDoc = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));

const args = process.argv.slice(2).filter((a) => a !== '--verify-only');
const selected = args.filter((a) => !a.startsWith('--'));
const artifactsDir = (() => {
  const idx = args.indexOf('--artifacts');
  if (idx >= 0 && args[idx + 1]) return path.resolve(args[idx + 1]);
  return path.join(PKG_ROOT, 'evidence', 'sanitized-artifacts');
})();
const outReport = (() => {
  const idx = args.indexOf('--out');
  if (idx >= 0 && args[idx + 1]) return path.resolve(args[idx + 1]);
  return path.join(PKG_ROOT, 'evidence', 'verify-only-report.json');
})();

const toCheck = selected.length
  ? casesDoc.cases.filter((c) => selected.includes(c.id))
  : casesDoc.cases;

if (!toCheck.length) {
  console.error('no cases selected');
  process.exit(2);
}

const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 's100-verify-'));
const results = [];

for (const spec of toCheck) {
  const src = path.join(artifactsDir, `${spec.id}.json`);
  const caseDir = path.join(workRoot, spec.id);
  const artifactDir = path.join(caseDir, 'artifact');
  fs.mkdirSync(artifactDir, { recursive: true });
  if (!fs.existsSync(src)) {
    results.push({
      id: spec.id,
      ok: false,
      failures: [`missing sanitized artifact: ${src}`],
    });
    continue;
  }
  fs.copyFileSync(src, path.join(artifactDir, spec.artifact));
  // Intentionally no transcript.jsonl — offline verify is artifact-only.
  const proc = spawnSync(
    process.execPath,
    [path.join(__dirname, 'accept.mjs'), caseDir, spec.id],
    { encoding: 'utf8', env: { ...process.env, S100_VERIFY_ONLY: '1' } },
  );
  let acceptance = null;
  try {
    const line = (proc.stdout || '').trim().split('\n').filter(Boolean).at(-1);
    acceptance = line ? JSON.parse(line) : null;
  } catch {
    acceptance = {
      ok: false,
      parseError: true,
      raw: `${proc.stdout || ''}\n${proc.stderr || ''}`.slice(0, 1000),
    };
  }
  results.push({
    id: spec.id,
    family: spec.family,
    skill: spec.skill,
    exitCode: proc.status,
    ok: Boolean(acceptance?.ok),
    failures: acceptance?.failures || [],
    notes: acceptance?.notes || [],
  });
}

const report = {
  mode: 'verify-only',
  verifiedAt: new Date().toISOString(),
  packageRoot: PKG_ROOT,
  artifactsDir,
  skillsPin: casesDoc.skillsPin,
  merchantPin: casesDoc.merchantPin,
  network: false,
  models: false,
  signing: false,
  paidGateways: false,
  caseCount: results.length,
  acceptedCount: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, failures: r.failures })),
  results,
};
fs.mkdirSync(path.dirname(outReport), { recursive: true });
fs.writeFileSync(outReport, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  mode: 'verify-only',
  acceptedCount: report.acceptedCount,
  caseCount: report.caseCount,
  failed: report.failed,
  outReport,
  workRoot,
}, null, 2));
process.exit(report.failed.length ? 1 : 0);
