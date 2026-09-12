import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function refuse(code, message = code) { throw Object.assign(new Error(message), { code }); }
export function git(repo, args, maxBuffer = 2 * 1024 * 1024) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_LITERAL_PATHSPECS: '1' });
  const r = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', repo, ...args], { env, maxBuffer, timeout: 10000 });
  if (r.error || r.status !== 0) refuse('git_read_failed', 'Git read failed or exceeded its bound; missing objects are never fetched.');
  return r.stdout;
}
export function safePath(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\x00-\x1f\x7f\\]/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git')) refuse('unsafe_path');
  return value;
}
export class RevisionPair {
  constructor(repo, base, head) {
    this.repo = realpathSync(repo);
    this.refs = { base, head };
    this.commits = { base: this.resolve(base), head: this.resolve(head) };
  }
  resolve(ref) {
    if (typeof ref !== 'string' || !ref || ref.length > 256 || /[\x00-\x20]/.test(ref)) refuse('invalid_revision');
    const oid = git(this.repo, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).toString().trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) refuse('invalid_revision');
    return oid;
  }
  verify() {
    for (const key of ['base', 'head']) if (this.resolve(this.refs[key]) !== this.commits[key]) refuse('revision_changed', 'A supplied revision moved during planning; rerun with full commit IDs.');
  }
  changes(maxFiles) {
    const raw = git(this.repo, ['diff-tree', '-r', '--no-commit-id', '--raw', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', '--abbrev=64', this.commits.base, this.commits.head]);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    const fields = text.split('\0'); fields.pop();
    if (fields.length % 2 || fields.length / 2 > maxFiles) refuse('changed_file_limit');
    return Array.from({ length: fields.length / 2 }, (_, i) => {
      const m = /^:(\d{6}) (\d{6}) ([a-f0-9]+) ([a-f0-9]+) ([AMDT])$/.exec(fields[i * 2]);
      if (!m) refuse('unsupported_git_change');
      return { path: safePath(fields[i * 2 + 1]), status: m[5], baseMode: m[1], headMode: m[2], baseOid: m[3], headOid: m[4] };
    });
  }
  blob(oid, limit) {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) refuse('invalid_blob');
    const bytes = Number(git(this.repo, ['cat-file', '-s', oid]).toString().trim());
    if (!Number.isSafeInteger(bytes) || bytes > limit) refuse('file_byte_limit');
    const data = git(this.repo, ['cat-file', 'blob', oid], limit + 1);
    if (data.length !== bytes) refuse('blob_size_mismatch');
    return data;
  }
  siblingSample(commit, file) {
    const slash = file.lastIndexOf('/');
    const dir = slash < 0 ? '' : file.slice(0, slash + 1);
    const locator = dir ? `${commit}:${dir.slice(0, -1)}` : commit;
    const rows = git(this.repo, ['ls-tree', '-z', '--name-only', locator]).toString('utf8').split('\0');
    return rows.some(name => /^SAMPLE(\.|$)/i.test(name) || /\.SAMPLE\./i.test(name));
  }
}
