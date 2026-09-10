#!/usr/bin/env node
/**
 * Offline directory provenance helper.
 * Compares two local package directories and reports added, modified, removed,
 * and identical files. Does not fetch, execute, authenticate, or publish.
 *
 * Usage:
 *   node bin/provenance.mjs --baselineDir <dir> --candidateDir <dir>
 * Legacy aliases: --freeDir (baseline), --paidDir (candidate).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) out[a.slice(2)] = true;
  }
  return out;
}

function walkFiles(root) {
  const out = [];
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('Input root must be a real directory');
  let entries=0,total=0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if(++entries>2000)throw new Error('Tree entry limit exceeded');
      if(ent.isSymbolicLink())throw new Error('Symlinks are not supported');
      if (ent.isDirectory()) {
        if (ent.name === '.git' || ent.name === 'node_modules') continue;
        stack.push(p);
      } else if (ent.isFile()) {total+=fs.statSync(p).size;if(total>20*1024*1024)throw new Error('Tree byte limit exceeded');out.push(p);} else throw new Error('Unsupported filesystem entry');
    }
  }
  return out.sort();
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function relHashMap(root) {
  const map = new Map();
  for (const f of walkFiles(root)) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    map.set(rel, { sha256: sha256(fs.readFileSync(f)), bytes: fs.statSync(f).size });
  }
  return map;
}

export function compareProvenance(opts) {
  const baselineDir = opts.baselineDir || opts.freeDir;
  const candidateDir = opts.candidateDir || opts.paidDir;
  const skillRecipePin = opts.skillRecipePin;
  const baseline = relHashMap(baselineDir);
  const candidate = relHashMap(candidateDir);
  const identical = [];
  const modified = [];
  const candidateOnly = [];
  const baselineOnly = [];

  for (const [rel, meta] of baseline) {
    if (!candidate.has(rel)) baselineOnly.push(rel);
    else if (candidate.get(rel).sha256 === meta.sha256) identical.push(rel);
    else modified.push(rel);
  }
  for (const rel of candidate.keys()) {
    if (!baseline.has(rel)) candidateOnly.push(rel);
  }

  const packagingDeltaFiles = [...candidateOnly, ...modified].sort();

  return {
    skillRecipePin: skillRecipePin || null,
    inputLabels: { baseline: 'supplied baseline', candidate: 'supplied candidate' },
    excludedDirectoryNames: ['.git', 'node_modules'],
    counts: {
      baselineFiles: baseline.size,
      candidateFiles: candidate.size,
      identical: identical.length,
      modified: modified.length,
      candidateOnly: candidateOnly.length,
      baselineOnly: baselineOnly.length,
    },
    packagingDeltaFiles,
    modifiedFiles: modified,
    addedFiles: candidateOnly,
    removedFiles: baselineOnly,
    sourceRevisionVerified: false,
    identicalSample: identical.slice(0, 20),
  };
}

function main(argv) {
  const args = parseArgs(argv);
  const allowed = ['baselineDir', 'candidateDir', 'freeDir', 'paidDir', 'skillRecipePin'];
  if (Object.keys(args).some((k) => !allowed.includes(k)) || Object.values(args).some((v) => typeof v !== 'string')) {
    throw new Error('Invalid CLI options');
  }
  const baselineDir = args.baselineDir || args.freeDir;
  const candidateDir = args.candidateDir || args.paidDir;
  if (!baselineDir || !candidateDir) {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          'usage: provenance.mjs --baselineDir <dir> --candidateDir <dir> [--skillRecipePin <pin>] (aliases: --freeDir, --paidDir)',
      }),
    );
    process.exit(2);
  }
  const report = compareProvenance({
    baselineDir: path.resolve(baselineDir),
    candidateDir: path.resolve(candidateDir),
    skillRecipePin: args.skillRecipePin,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    main(process.argv.slice(2));
  } catch {
    console.error(JSON.stringify({ ok: false, error: 'Invalid or unreadable bounded input tree' }));
    process.exitCode = 2;
  }
}
