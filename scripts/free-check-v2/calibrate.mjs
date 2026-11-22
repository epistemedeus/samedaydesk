import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { runFreeCheck } from '../../server/lib/free-check-v2/probe.js';
import { RULE_SHA256 } from '../../server/lib/free-check-v2/rules.js';

const out = process.argv[2];
if (!out?.startsWith('/')) throw Error('An absolute task-owned evidence directory is required.');
await mkdir(out, { recursive: true, mode: 0o700 });
const targets = JSON.parse(await readFile(new URL('./calibration-targets.json', import.meta.url)));
if (targets.targets.length !== 30 || new Set(targets.targets.map((item) => item.url)).size !== 30) throw Error('Expected thirty unique frozen targets.');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const rows = [];
for (const [index, target] of targets.targets.entries()) {
  const progress = [], start = Date.now();
  try {
    const report = await runFreeCheck(target.url, { onProgress: (item) => progress.push({ elapsedMs: Date.now() - start, ...item }) });
    const name = `${String(index + 1).padStart(2, '0')}-${new URL(target.url).hostname}.json`;
    const bytes = Buffer.from(JSON.stringify({ source, target, report, progress }, null, 2) + '\n');
    await writeFile(join(out, name), bytes, { mode: 0o600 });
    const count = (status) => report.checks.filter((item) => item.status === status).length;
    rows.push({ ...target, file: name, sha256: createHash('sha256').update(bytes).digest('hex'), score: report.score, unknownPoints: report.scoring.unknown, cap: report.scoring.cap, problems: count('problem'), upgrades: count('upgrade'), unknown: count('unknown'), elapsedMs: report.elapsedMs, firstObservedMs: progress.find((item) => item.kind === 'fetch')?.elapsedMs ?? null, within20Seconds: report.elapsedMs <= 20_000, fetched: report.requests[0]?.status || 0 });
  } catch (error) { rows.push({ ...target, error: error.message, elapsedMs: Date.now() - start }); }
  await writeFile(join(out, 'partial.json'), JSON.stringify({ source, ruleSha256: RULE_SHA256, rows }, null, 2) + '\n', { mode: 0o600 });
}
const measured = rows.filter((row) => !row.error);
const scores = measured.map((row) => row.score).sort((a, b) => a - b);
const result = { source, ruleSha256: RULE_SHA256, startedTargets: 30, completed: measured.length, realPublicFetches: measured.filter((row) => row.fetched >= 200 && row.fetched < 400).length, scores: { min: scores[0] ?? null, median: scores.length ? scores[Math.floor(scores.length / 2)] : null, max: scores.at(-1) ?? null }, rows,
  receiving: 'Actual public read-only requests from the fresh VM. Refusals and missing measurements remain explicit. Browser rendering, CrUX, indexing and checkout execution are not inferred.',
};
await writeFile(join(out, 'report.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ source, targets: 30, completed: measured.length, publicFetches: result.realPublicFetches, scores: result.scores }));
if (measured.length !== 30 || measured.some((row) => !row.within20Seconds)) process.exitCode = 1;
