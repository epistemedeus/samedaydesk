import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

export const REPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_REPORTS = 1000;
const MAX_BYTES = 1_000_000;
const validId = (id) => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
async function directory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink() || (entry.mode & 0o077) || entry.uid !== process.getuid?.()) throw Error('Report directory must be private and owned by this process user.');
  return path;
}
export function reportDirectory() { return process.env.SDS_FREE_CHECK_REPORT_DIR || join(homedir(), '.samedaydesk-free-check', 'reports'); }
export async function storeReport(report, { dir = reportDirectory() } = {}) {
  await directory(dir);
  const id = randomBytes(16).toString('hex');
  const stored = { ...report, id, permalink: `/tools/ai-readiness?report=${id}` };
  const bytes = Buffer.from(JSON.stringify(stored));
  if (bytes.length > MAX_BYTES) throw Error('Report exceeds the private store bound.');
  const temporary = join(dir, `.${id}.${process.pid}.tmp`), target = join(dir, `${id}.json`);
  let handle;
  try {
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, target);
  } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
  // Bounded task-owned report files only. No timer or resident cleaner.
  const entries = (await readdir(dir)).filter((name) => /^[a-f0-9]{32}\.json$/.test(name));
  const rows = await Promise.all(entries.map(async (name) => ({ name, stat: await lstat(join(dir, name)) })));
  rows.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  await Promise.all(rows.filter((row, index) => row.name !== `${id}.json` && row.stat.isFile() && (index >= MAX_REPORTS || Date.now() - row.stat.mtimeMs > REPORT_TTL_MS)).map((row) => unlink(join(dir, row.name))));
  return stored;
}
export async function readReport(id, { dir = reportDirectory() } = {}) {
  if (!validId(id)) return null;
  let handle;
  try {
    await directory(dir);
    handle = await open(join(dir, `${id}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES || stat.mode & 0o077 || stat.uid !== process.getuid?.() || Date.now() - stat.mtimeMs > REPORT_TTL_MS) return null;
    const report = JSON.parse(await handle.readFile('utf8'));
    return report.id === id && report.version === 2 ? report : null;
  } catch { return null; } finally { await handle?.close(); }
}
