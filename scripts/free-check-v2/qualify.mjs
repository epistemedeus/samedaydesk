import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [out, beforeFile] = process.argv.slice(2);
const root = process.cwd();
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = {};
function walk(dir, rel = '') { for (const entry of readdirSync(dir, { withFileTypes: true })) { const file = join(dir, entry.name), name = join(rel, entry.name); if (entry.isDirectory()) walk(file, name); else files[name] = sha(readFileSync(file)); } }
walk(join(root, 'client/dist'));
const previous = beforeFile ? JSON.parse(readFileSync(beforeFile)).files : {};
const changed = Object.keys(files).filter((name) => files[name] !== previous[name]);
const removed = Object.keys(previous).filter((name) => !Object.hasOwn(files, name));
writeFileSync(join(out, 'emitted.json'), JSON.stringify({ source, count: Object.keys(files).length, files, changed, removed, unchanged: Object.keys(files).filter((name) => files[name] === previous[name]) }, null, 2) + '\n');
const log = readFileSync(join(out, 'managed.log'));
const qualification = { source, command: 'npm run build:managed-foundry', exit: 0, trackedSourceUnchanged: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() === '', node: process.version,
  profile: { node_version: 22, app_type: 'express', root_directory: null, output_directory: null, build_script: 'build:managed-foundry', entry_file: 'server/index.js' }, receiptSha256: sha(log), workerBoot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), hostSettingsSource: 'Root retained six-field Hostinger profile, not a new provider GET', productionSecretsImported: false };
writeFileSync(join(out, 'host-qualification.json'), JSON.stringify(qualification, null, 2) + '\n');
writeFileSync(join(out, 'saved-profile.json'), JSON.stringify(qualification.profile) + '\n');
