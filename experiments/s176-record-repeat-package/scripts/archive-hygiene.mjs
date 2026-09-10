/**
 * Lean-archive hygiene: drop private workspace paths, secrets, and transcripts.
 * Used at pack time; owning-tree tests scan the tarball.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

export const SKIP_NAMES = new Set([
  '.git',
  '.env',
  '.env.local',
  '.npmrc',
  'native-cells',
  'next-run',
  'node_modules',
  '.staging',
  'logs',
  'receipts',
  'capture-a.atom.xml',
  'capture-b.atom.xml',
]);

const TEXT_EXT = new Set([
  '.json',
  '.mjs',
  '.js',
  '.cjs',
  '.md',
  '.txt',
  '.yaml',
  '.yml',
  '.xml',
  '.csv',
  '.html',
  '.htm',
  '.ts',
  '.cts',
  '.map',
  '.lock',
]);

export const PRIVATE_ABS_RE =
  /\/(?:workspace|home\/[A-Za-z0-9._-]+|Users\/[A-Za-z0-9._-]+|root)\//;

export const SECRET_RE =
  /BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}/;

const WORKSPACE_EXPERIMENT_RE =
  /\/workspace\/experiments\/(?:s163-record-recipes|s134-record-jobs|s176-record-repeat-package)\//g;

export function shouldSkipName(name) {
  if (SKIP_NAMES.has(name)) return true;
  if (name.endsWith('.jsonl')) return true;
  if (name.startsWith('.env.')) return true;
  return false;
}

export function rewritePrivateWorkspacePaths(text) {
  return text.replace(WORKSPACE_EXPERIMENT_RE, '');
}

export function isTranscriptPath(rel) {
  const n = rel.replace(/\\/g, '/');
  return n.split('/').includes('native-cells') || n.endsWith('.jsonl');
}

function isTextFile(name) {
  const ext = extname(name);
  return TEXT_EXT.has(ext) || name === 'LICENSE';
}

function walkFiles(root, fn, { skipNodeModules = true } = {}) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (skipNodeModules && name === 'node_modules') continue;
      if (name === '.git') continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) stack.push(p);
      else fn(p, name);
    }
  }
}

export function scanTree(root) {
  const hits = [];
  walkFiles(root, (p, name) => {
    const rel = relative(root, p);
    if (isTranscriptPath(rel) || name === '.env' || name.startsWith('.env.')) {
      hits.push({ file: rel, kind: 'transcript-or-secret-file' });
    }
    if (!isTextFile(name)) return;
    const text = readFileSync(p, 'utf8');
    if (PRIVATE_ABS_RE.test(text)) hits.push({ file: rel, kind: 'private-path' });
    if (SECRET_RE.test(text)) hits.push({ file: rel, kind: 'secret' });
  });
  return hits;
}

export function sanitizeTree(root) {
  walkFiles(root, (p, name) => {
    if (!isTextFile(name)) return;
    const text = readFileSync(p, 'utf8');
    const next = rewritePrivateWorkspacePaths(text);
    if (next !== text) writeFileSync(p, next);
  });
  return scanTree(root);
}
