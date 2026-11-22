// Dedicated N12 only. Keep the admitted runner and budgets byte-for-byte;
// substitute the site's actual production static mount in a private workspace.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const args = process.argv.slice(2), N12 = '8f6e9268-3637-4e23-b3d2-b2d36b57c4dd';
const value = flag => {
  const i = args.indexOf(flag), v = i < 0 ? null : args[i + 1];
  if (!v || v.startsWith('--')) throw Error(`required ${flag}`);
  return v;
};
try {
  if (args.includes('--help')) { console.log('--packet ABS --preview PACKAGE_ROOT --source SHA40 --expected-boot N12_BOOT --lock-file EXISTING_BATCH_LOCK --out NEW_ABS'); process.exit(0); }
  if (value('--expected-boot') !== N12 || readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() !== N12) throw Error('dedicated-host-unreceived');
  const lock = value('--lock-file');
  if (lock !== '/tmp/pilot-grand-phase-lighthouse.lock' || !existsSync(lock)) throw Error('existing-batch-lock-required');
  if (!args.includes('--locked')) {
    const c = spawnSync('flock', ['--nonblock', '--exclusive', lock, process.execPath, fileURLToPath(import.meta.url), ...args, '--locked'], { stdio: 'inherit' });
    if (c.error) throw c.error;
    process.exit(c.status ?? 2);
  }
  const packet = resolve(value('--packet')), preview = resolve(value('--preview')), out = value('--out'), source = value('--source');
  if (!isAbsolute(out) || existsSync(out) || !/^[a-f0-9]{40}$/.test(source)) throw Error('new-output-and-exact-source-required');
  const meta = JSON.parse(readFileSync(join(preview, 'preview-source.json'), 'utf8'));
  if (meta.schema !== 'samedaydesk.performance-preview.v1' || meta.source !== source) throw Error('preview-source-mismatch');
  for (const [name, sha] of Object.entries(meta.files)) {
    if (name.split('/').includes('..') || isAbsolute(name) || createHash('sha256').update(readFileSync(join(preview, name))).digest('hex') !== sha) throw Error('preview-file-mismatch');
  }
  const runnerHash = createHash('sha256').update(readFileSync(join(packet, 'run.mjs'))).digest('hex');
  if (runnerHash !== '9780ee3658ceff01e41f589e9b530ecf404165cb4521df63e97c2ff25e5129a1') throw Error('original-admitted-runner-required');
  const manifest = JSON.parse(readFileSync(join(packet, 'manifest.json'), 'utf8'));
  if (JSON.stringify(manifest.budgets) !== JSON.stringify({ lcpMs: 2500, cls: .1, tbtMs: 200, validRuns: 5, loadAverageBelow: 1 })) throw Error('original-budgets-required');
  if (JSON.stringify(manifest.sites.sds.pages) !== JSON.stringify(meta.pages)) throw Error('all14-admitted-pages-required');
  manifest.sites = { sds: manifest.sites.sds };
  manifest.sites.sds.source = { repository: 'epistemedeus/samedaydesk', commit: source, ref: 'isolated B4 draft, not live' };
  mkdirSync(out, { mode: 0o700 });
  const work = join(out, 'runner'); mkdirSync(work); mkdirSync(join(work, 'previews'));
  copyFileSync(join(packet, 'run.mjs'), join(work, 'run.mjs'));
  copyFileSync(join(packet, 'package.json'), join(work, 'package.json'));
  symlinkSync(join(packet, 'node_modules'), join(work, 'node_modules'), 'dir');
  symlinkSync(join(preview, 'client/dist'), join(work, 'previews/sds'), 'dir');
  writeFileSync(join(work, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(work, 'serve.mjs'), `export { serve } from ${JSON.stringify(pathToFileURL(join(preview, 'scripts/performance/preview-server.mjs')).href)};\n`);
  try {
    const c = spawnSync(process.execPath, [join(work, 'run.mjs'), '--site', 'sds', '--out', join(out, 'metrics'), '--chrome', '/usr/bin/google-chrome'], { stdio: 'inherit' });
    if (c.error) throw c.error;
    process.exitCode = c.status ?? 2;
  } finally { rmSync(work, { recursive: true, force: true }); }
} catch (error) { console.error(error.message); process.exitCode = 2; }
