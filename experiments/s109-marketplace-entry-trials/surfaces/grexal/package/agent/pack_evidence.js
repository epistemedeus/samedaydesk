#!/usr/bin/env node
/**
 * Source-change evidence packager — git diff + structural report.
 * Zero network by default. Zero paid model calls.
 * Does NOT claim: git-apply success, Grexal paid execution, or buyer escrow acceptance.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  analyzeUnifiedDiff,
  bindBuyerCriteria,
  DEFAULT_MAX_DIFF_BYTES,
} from '../lib/diff_analysis.js';

export const PAID_MODEL_CALLS = 0;
export const AGENT_SLUG = 'samedaydesk-source-change-evidence';
export const GREXAL_PAID_EXECUTION = false;

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

function runGitDiff(repoPath, baseRef, headRef, rangeOp) {
  const range = `${baseRef}${rangeOp}${headRef}`;
  const r = spawnSync('git', ['-C', repoPath, 'diff', '--no-ext-diff', '--find-renames', range], {
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
  });
  return {
    range,
    rangeOp,
    diffText: r.stdout || '',
    status: r.status,
    stderr: (r.stderr || '').trim(),
  };
}

export function packEvidence(input = {}) {
  const baseRef = input.baseRef || 'HEAD~1';
  const headRef = input.headRef || 'HEAD';
  const rangeOp = input.rangeOp === '..' ? '..' : '...';
  const acceptanceNotes = input.acceptanceNotes || 'dry local structural packaging';
  const repoPath = input.repoPath || null;
  const maxDiffBytes = Number(input.maxDiffBytes || DEFAULT_MAX_DIFF_BYTES);
  let diffText = typeof input.unifiedDiff === 'string' ? input.unifiedDiff : '';
  let git = null;

  if (!diffText && repoPath) {
    git = runGitDiff(repoPath, baseRef, headRef, rangeOp);
    diffText = git.diffText;
  }

  const analysis = analyzeUnifiedDiff(diffText, { maxDiffBytes });
  const commitRange = git?.range || `${baseRef}${rangeOp}${headRef}`;

  const checks = [
    {
      id: 'diff-nonempty',
      pass: !analysis.empty,
      detail: analysis.empty ? 'diff is empty' : `diffBytes=${analysis.bytes}`,
    },
    {
      id: 'diff-size-limit',
      pass: !analysis.exceedsMaxBytes,
      detail: `bytes=${analysis.bytes} max=${analysis.maxDiffBytes}`,
    },
    {
      id: 'no-unsafe-paths',
      pass: analysis.unsafePaths.length === 0,
      detail:
        analysis.unsafePaths.length === 0
          ? 'no absolute/traversal/NUL paths in diff headers'
          : `unsafePaths=${JSON.stringify(analysis.unsafePaths)}`,
    },
    {
      id: 'not-truncated',
      pass: !analysis.looksTruncated && !analysis.truncatedHunk,
      detail: `looksTruncated=${analysis.looksTruncated} truncatedHunk=${analysis.truncatedHunk}`,
    },
    {
      id: 'no-paid-model-calls',
      pass: true,
      detail: 'this agent never calls a paid model',
    },
    {
      id: 'cash-boundary',
      pass: true,
      detail: 'cashBoundaryUsd=0; no grexal login/push/publish/paid invoke',
    },
    {
      id: 'not-grexal-paid-execution',
      pass: true,
      detail:
        'Local packager run only. GREXAL_PAID_EXECUTION=false. Do not label this a provider paid run.',
    },
  ];

  if (git) {
    checks.push({
      id: 'git-diff-exit',
      pass: git.status === 0,
      detail: `git diff ${git.range} status=${git.status} stderr=${git.stderr || ''}`,
    });
  } else if (typeof input.unifiedDiff === 'string') {
    checks.push({
      id: 'diff-source-supplied',
      pass: true,
      detail: 'used supplied unifiedDiff (git not invoked)',
    });
  } else {
    checks.push({
      id: 'diff-source',
      pass: false,
      detail: 'no repoPath and no unifiedDiff',
    });
  }

  const structuralChecksPass = checks.every((c) => c.pass);
  const buyerBinding = bindBuyerCriteria(input.buyerCriteria || [], {
    analysis,
    structuralChecksPass,
  });

  const acceptanceReport = {
    cashBoundaryUsd: 0,
    agent: AGENT_SLUG,
    role: 'source-change-evidence-packager',
    commitRange,
    rangeOp,
    rangeSemantics:
      rangeOp === '...'
        ? 'git three-dot: merge-base(base,head)..head (not a literal two-endpoint patch of base→head)'
        : 'git two-dot: direct base..head',
    diffBytes: analysis.bytes,
    fileCount: analysis.fileCount,
    renameDetected: analysis.sawRename,
    copyDetected: analysis.sawCopy,
    binaryDetected: analysis.sawBinary,
    noNewlineMarkers: analysis.sawNoNewline,
    truncatedSuspected: analysis.looksTruncated || analysis.truncatedHunk,
    unsafePaths: analysis.unsafePaths,
    gitStatus: git ? git.status : null,
    gitStderr: git?.stderr || undefined,
    acceptanceNotes,
    paidModelCalls: PAID_MODEL_CALLS,
    grexalPaidExecution: GREXAL_PAID_EXECUTION,
    checks,
    structuralChecksPass,
    gitApplyVerified: false,
    buyerAcceptanceVerified: false,
    bidFundingVerified: false,
    buyerCriteria: buyerBinding,
    allChecksPass: structuralChecksPass,
  };

  const summary = `Packaged ${analysis.bytes}B / ${analysis.fileCount} files for ${commitRange}; structuralPass=${structuralChecksPass}; paidModelCalls=0; grexalPaidExecution=false; gitApplyVerified=false; buyerAcceptanceVerified=false`;

  return {
    summary,
    commitRange,
    diffBytes: analysis.bytes,
    paidModelCalls: PAID_MODEL_CALLS,
    grexalPaidExecution: GREXAL_PAID_EXECUTION,
    structuralChecksPass,
    acceptanceReport,
    evidencePack: {
      unifiedDiff: diffText,
      acceptance: acceptanceReport,
      analysis,
    },
  };
}

export default async function run(ctx) {
  const task = typeof ctx?.task === 'function' ? await ctx.task() : ctx || {};
  if (typeof ctx?.log === 'function') {
    await ctx.log('source-change evidence packager; paidModelCalls=0; not a Grexal paid execution');
  }
  if (typeof ctx?.progress === 'function') await ctx.progress(0.4);
  const result = packEvidence(task);
  if (typeof ctx?.progress === 'function') await ctx.progress(1);
  if (typeof ctx?.log === 'function') await ctx.log(result.summary);
  return result;
}

function printHelp() {
  process.stdout.write(`Usage: pack_evidence.js [options]

  --repoPath <dir>           Git checkout to diff
  --baseRef <ref>            Default HEAD~1
  --headRef <ref>            Default HEAD
  --rangeOp '...'|'..'       Default '...'; three-dot ≠ two-dot
  --unifiedDiffFile <path>   Read a precomputed unified diff instead of running git
  --buyerCriteriaFile <path> JSON array of local criteria bindings (not escrow)
  --maxDiffBytes <n>         Default ${DEFAULT_MAX_DIFF_BYTES}
  --acceptanceNotes <text>
  --outDir <dir>             Write changes.diff + acceptance.json
  --stdout-only              Print JSON result; do not write files

Zero network by default. Zero paid model calls.
Does not authenticate to Grexal. Does not verify git-apply or buyer acceptance.
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
  let buyerCriteria = [];
  if (args.buyerCriteriaFile) {
    buyerCriteria = JSON.parse(fs.readFileSync(args.buyerCriteriaFile, 'utf8'));
  }

  const hasDiffInput = Boolean(unifiedDiff);
  const repoPath = args.repoPath || (hasDiffInput ? null : process.cwd());

  const result = packEvidence({
    repoPath,
    baseRef: args.baseRef,
    headRef: args.headRef,
    rangeOp: args.rangeOp,
    unifiedDiff: hasDiffInput ? unifiedDiff : undefined,
    acceptanceNotes: args.acceptanceNotes,
    buyerCriteria,
    maxDiffBytes: args.maxDiffBytes ? Number(args.maxDiffBytes) : undefined,
  });

  if (!args['stdout-only']) {
    const outDir = args.outDir || path.join(repoPath || process.cwd(), '.s121-grexal-dry-out');
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
          grexalPaidExecution: false,
          structuralChecksPass: result.structuralChecksPass,
          gitApplyVerified: false,
          buyerAcceptanceVerified: false,
          cashBoundaryUsd: 0,
          summary: result.summary,
        },
        null,
        2,
      )}\n`,
    );
    return result.structuralChecksPass ? 0 : 2;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.structuralChecksPass ? 0 : 2;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(
        JSON.stringify({ ok: false, error: String(err?.message || err), cashBoundaryUsd: 0 }),
      );
      process.exit(1);
    },
  );
}
