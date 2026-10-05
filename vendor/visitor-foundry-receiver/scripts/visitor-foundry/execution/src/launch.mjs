// Trusted installed launcher only; no visitor-supplied command or source.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { bytesHash, check, validateLimits } from './contracts.mjs';

export const LAUNCHER_ID = 'vf08.python-setrlimit-exec.v1';
const launcher = fileURLToPath(new URL('./launcher.py', import.meta.url));
export function launcherPins() {
  return { id: LAUNCHER_ID, adapter: bytesHash(readFileSync(fileURLToPath(import.meta.url))),
    script: bytesHash(readFileSync(launcher)) };
}
export function limitedPythonLaunch(python, limits, installedArgs) {
  validateLimits(limits);
  check(isAbsolute(python), 'installed interpreter path');
  return { command: python, args: ['-I', '-S', '-B', launcher,
    ...['addressSpaceBytes', 'cpuSeconds', 'hostStackBytes', 'fileBytes', 'openFiles'].map(key => String(limits[key])),
    '--', ...installedArgs] };
}
