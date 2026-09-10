#!/usr/bin/env node
/**
 * Local evidence packager stub — zero network, zero model spend.
 * Emulates Grexal agent entrypoint for dry tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--') && arr[i + 1] && !arr[i + 1].startsWith('--')) {
      acc.push([cur.slice(2), arr[i + 1]]);
    }
    return acc;
  }, []),
);

const repoPath = args.repoPath || process.cwd();
const baseRef = args.baseRef || 'HEAD~1';
const headRef = args.headRef || 'HEAD';
const outDir = args.outDir || path.join(repoPath, '.s109-grexal-dry-out');
fs.mkdirSync(outDir, { recursive: true });

const diff = spawnSync('git', ['-C', repoPath, 'diff', `${baseRef}...${headRef}`], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
const diffPath = path.join(outDir, 'changes.diff');
fs.writeFileSync(diffPath, diff.stdout || '');
const acceptance = {
  cashBoundaryUsd: 0,
  commitRange: `${baseRef}...${headRef}`,
  diffBytes: Buffer.byteLength(diff.stdout || ''),
  gitStatus: diff.status,
  acceptanceNotes: args.acceptanceNotes || 'dry local acceptance',
  paidModelCalls: 0,
};
const acceptancePath = path.join(outDir, 'acceptance.json');
fs.writeFileSync(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ diffPath, acceptancePath, commitRange: acceptance.commitRange, cashBoundaryUsd: 0 }, null, 2)}\n`,
);
