// Render reviewable files only; never invokes a supervisor or installs anything.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
function argument(name) { return args[args.indexOf(name) + 1]; }
for (const name of ['--node', '--repo', '--user', '--out']) if (!args.includes(name)) throw new Error(`missing ${name}`);
const node = argument('--node'), repo = argument('--repo'), user = argument('--user'), output = argument('--out');
if (![node, repo, output].every(value => path.isAbsolute(value) && /^[A-Za-z0-9_./-]+$/.test(value))
  || !/^[a-z_][a-z0-9_-]*$/.test(user)) throw new Error('invalid absolute path or user');
await access(node, constants.X_OK);
await access(path.join(repo, 'services/continuous-monitoring/src/cli.mjs'));
await mkdir(output, { recursive: true, mode: 0o700 });
for (const file of ['neomorphic-monitor-api.service', 'neomorphic-monitor-worker.service', 'neomorphic-monitor-worker.timer']) {
  const template = await readFile(new URL(file, import.meta.url), 'utf8');
  await writeFile(path.join(output, file), template.replaceAll('/usr/bin/node', node)
    .replaceAll('/opt/neomorphic/current', repo).replaceAll('User=www-data', `User=${user}`), { mode: 0o600 });
}
process.stdout.write('{"rendered":3,"installed":false}\n');
