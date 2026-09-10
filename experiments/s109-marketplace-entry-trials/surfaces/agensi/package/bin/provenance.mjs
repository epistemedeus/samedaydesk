#!/usr/bin/env node
/**
 * Agensi paid-delivery vs free provenance helper ($0, offline by default).
 * Compares a free public recipe pin tree to a proposed paid packaging directory.
 * Does not list, upload, authenticate, or claim exclusivity/license ownership.
 *
 * Usage:
 *   node bin/provenance.mjs --freeDir <pin-checkout-or-fixture> --paidDir <packaging-dir>
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
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === '.git' || ent.name === 'node_modules') continue;
        stack.push(p);
      } else if (ent.isFile()) out.push(p);
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

export function compareProvenance({ freeDir, paidDir, skillRecipePin }) {
  const free = relHashMap(freeDir);
  const paid = relHashMap(paidDir);
  const identical = [];
  const modified = [];
  const paidOnly = [];
  const freeOnly = [];

  for (const [rel, meta] of free) {
    if (!paid.has(rel)) freeOnly.push(rel);
    else if (paid.get(rel).sha256 === meta.sha256) identical.push(rel);
    else modified.push(rel);
  }
  for (const rel of paid.keys()) {
    if (!free.has(rel)) paidOnly.push(rel);
  }

  const packagingDeltaFiles = [...paidOnly, ...modified].sort();
  const claimsProprietaryOwnershipOfFreeRecipes = false;

  return {
    cashBoundaryUsd: 0,
    surface: 'agensi',
    officialHosts: {
      auth: 'https://www.agensi.io/auth',
      sell: 'https://www.agensi.io/sell',
      mcp: 'https://mcp.agensi.io/mcp',
    },
    unrelatedHostDoNotEnter: {
      host: 'https://www.agensi.dev',
      note: 'Cloudflare Access tenant observed from this worker; not the Agensi seller surface. Do not attempt Access login from automation.',
    },
    skillRecipePin: skillRecipePin || null,
    freeDir,
    paidDir,
    counts: {
      freeFiles: free.size,
      paidFiles: paid.size,
      identical: identical.length,
      modified: modified.length,
      paidOnly: paidOnly.length,
      freeOnly: freeOnly.length,
    },
    packagingDeltaFiles,
    identicalSample: identical.slice(0, 20),
    paidDeliverableIs: 'packaging/acceptance/ops delta over public free recipes — not exclusive ownership of free recipe bytes',
    freeAlternativeIs: 'clone/use the public pin directly without Agensi',
    claimsProprietaryOwnershipOfFreeRecipes,
    licenseClaim: 'unknown-unless-present-in-tree',
    exclusivityClaim: false,
    listingPerformed: false,
    mcpPaidUnlockPerformed: false,
    unknowns: [
      'Account payout eligibility on Agensi is unknown without Root auth',
      'Whether a given listing would pass Agensi review is unknown',
      'Presence/absence of LICENSE in upstream pin must be rechecked at pin SHA',
    ],
  };
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.freeDir || !args.paidDir) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'usage: provenance.mjs --freeDir <dir> --paidDir <dir> [--skillRecipePin <pin>]',
      }),
    );
    process.exit(2);
  }
  const report = compareProvenance({
    freeDir: path.resolve(args.freeDir),
    paidDir: path.resolve(args.paidDir),
    skillRecipePin: args.skillRecipePin,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main(process.argv.slice(2));
