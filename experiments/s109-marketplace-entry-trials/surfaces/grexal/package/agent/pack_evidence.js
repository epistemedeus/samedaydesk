#!/usr/bin/env node
/**
 * Source-change evidence packager — git diff + acceptance report.
 * Zero network. Zero paid model calls. Dry local / Grexal-shaped entrypoint.
 *
 * Local CLI:
 *   node agent/pack_evidence.js --repoPath . --baseRef HEAD --headRef HEAD
 *   node agent/pack_evidence.js --unifiedDiffFile ./changes.diff --acceptanceNotes "tests green"
 *
 * Grexal sandbox (after Root installs @grexal/sdk and publishes — not this worker):
 *   export default async function run(ctx) { ... ctx.task() / return result }
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PAID_MODEL_CALLS = 0;
export const AGENT_SLUG = 'samedaydesk-source-change-evidence';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (cur === '--help' || cur === '-h') {
      out.help = true;
      continue;
    }
    if (cur.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[cur.slice(2)] = argv[++i];
      continue;
    }
    if (cur.startsWith('--')) {
      out[cur.slice(2)] = true;
      continue;
    }
    out._.push(cur);
  }
  return out;
}

function countDiffFiles(diffText) {
  if (!diffText) return 0;
  const matches = diffText.match(/^diff --git /gm);
  return matches ? matches.length : 0;
}

export function packEvidence(input = {}) {
  const baseRef = input.baseRef || 'HEAD~1';
  const headRef = input.headRef || 'HEAD';
  const acceptanceNotes = input.acceptanceNotes || 'dry local acceptance';
  const repoPath = input.repoPath || null;
  let diffText = typeof input.unifiedDiff === 'string' ? input.unifiedDiff : '';
  let gitStatus = null;
  let gitStderr = '';

  if (!diffText && repoPath) {
    const r = spawnSync('git', ['-C', repoPath, 'diff', `${baseRef}...${headRef}`], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    diffText = r.stdout || '';
    gitStatus = r.status;
    gitStderr = (r.stderr || '').trim();
  }

  const diffBytes = Buffer.byteLength(diffText);
  const fileCount = countDiffFiles(diffText);
  const commitRange = `${baseRef}...${headRef}`;

  const checks = [
    {
      id: 'diff-source',
      pass: Boolean(diffText) || gitStatus === 0 || Boolean(input.unifiedDiff),
      detail: input.unifiedDiff
        ? 'used supplied unifiedDiff'
        : repoPath
          ? `git diff ${commitRange} status=${gitStatus}`
          : 'no repoPath and no unifiedDiff',
    },
    {
      id: 'no-paid-model-calls',
      pass: true,
      detail: 'this agent never calls a paid model',
    },
    {
      id: 'cash-boundary',
      pass: true,
      detail: 'cashBoundaryUsd=0; no grexal login/push/publish',
    },
  ];

  const acceptanceReport = {
    cashBoundaryUsd: 0,
    agent: AGENT_SLUG,
    role: 'source-change-evidence-packager',
    commitRange,
    diffBytes,
    fileCount,
    gitStatus,
    gitStderr: gitStderr || undefined,
    acceptanceNotes,
    paidModelCalls: PAID_MODEL_CALLS,
    checks,
    allChecksPass: checks.every((c) => c.pass),
  };

  const summary = `Packaged ${diffBytes} bytes / ${fileCount} files for ${commitRange}; paidModelCalls=${PAID_MODEL_CALLS}`;

  return {
    summary,
    commitRange,
    diffBytes,
    paidModelCalls: PAID_MODEL_CALLS,
    acceptanceReport,
    evidencePack: {
      unifiedDiff: diffText,
      acceptance: acceptanceReport,
    },
  };
}

export default async function run(ctx) {
  const task = typeof ctx?.task === 'function' ? await ctx.task() : ctx || {};
  if (typeof ctx?.log === 'function') {
    await ctx.log('source-change evidence packager; paidModelCalls=0');
  }
  if (typeof ctx?.progress === 'function') await ctx.progress(0.4);
  const result = packEvidence(task);
  if (typeof ctx?.progress === 'function') await ctx.progress(1);
  if (typeof ctx?.log === 'function') await ctx.log(result.summary);
  return result;
}

function printHelp() {
  process.stdout.write(`Usage: pack_evidence.js [options]

  --repoPath <dir>           Git checkout to diff (default: cwd when no unifiedDiff)
  --baseRef <ref>            Default HEAD~1
  --headRef <ref>            Default HEAD
  --unifiedDiffFile <path>   Read a precomputed unified diff instead of running git
  --acceptanceNotes <text>
  --outDir <dir>             Write changes.diff + acceptance.json (default .s109-grexal-dry-out)
  --stdout-only              Print JSON result; do not write files

Zero network. Zero paid model calls. Does not authenticate to Grexal.
`);
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return 0;
  }

  let unifiedDiff = args.unifiedDiff || '';
  if (args.unifiedDiffFile) {
    unifiedDiff = fs.readFileSync(args.unifiedDiffFile, 'utf8');
  }

  const hasDiffInput = Boolean(unifiedDiff);
  const repoPath = args.repoPath || (hasDiffInput ? null : process.cwd());

  const result = packEvidence({
    repoPath,
    baseRef: args.baseRef,
    headRef: args.headRef,
    unifiedDiff,
    acceptanceNotes: args.acceptanceNotes,
  });

  if (!args['stdout-only']) {
    const outDir = args.outDir || path.join(repoPath || process.cwd(), '.s109-grexal-dry-out');
    fs.mkdirSync(outDir, { recursive: true });
    const diffPath = path.join(outDir, 'changes.diff');
    const acceptancePath = path.join(outDir, 'acceptance.json');
    fs.writeFileSync(diffPath, result.evidencePack.unifiedDiff);
    fs.writeFileSync(acceptancePath, `${JSON.stringify(result.acceptanceReport, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify(
        {
          diffPath,
          acceptancePath,
          commitRange: result.commitRange,
          diffBytes: result.diffBytes,
          paidModelCalls: result.paidModelCalls,
          cashBoundaryUsd: 0,
          summary: result.summary,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(JSON.stringify({ ok: false, error: String(err?.message || err), cashBoundaryUsd: 0 }));
      process.exit(1);
    },
  );
}
