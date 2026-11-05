import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {digest} from './digest.mjs';

const SPEC_URL = 'https://github.com/holistis/agent-receipt-verify/blob/dd0dd2a878b11e8a938f405a4fb3fd2f4e9c00b0/vectors/attempt-identity/known-answer-query-bare-name-stays-bare.json';
const SPEC_SHA256 = 'ee120c2520d6797acba145ef3ae078f969dd4be8fe68b0ed825c826997dfe201';

function flag(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function fail(code) {
  process.stdout.write(JSON.stringify({ok: false, code}) + '\n');
  process.exit(1);
}

export async function seedCheck({artifact, wires, keyModule}) {
  const caller = JSON.parse(readFileSync(artifact, 'utf8'));
  const stdout = JSON.parse(readFileSync(wires, 'utf8'));
  const loaded = await import(pathToFileURL(keyModule).href);
  if (typeof loaded.key !== 'function') throw Object.assign(new Error('key_module_refused'), {code: 'key_module_refused'});
  const left = loaded.key(caller.left.method, caller.left.path, stdout.wire.left);
  const right = loaded.key(caller.right.method, caller.right.path, stdout.wire.right);
  return {
    ok: true,
    verdict: left === right ? 'equal' : 'distinct',
    specExpectation: 'distinct',
    specCitation: {url: SPEC_URL, sha256: SPEC_SHA256},
    wires: {left: stdout.wire.left, right: stdout.wire.right},
    artifactDigest: digest(caller),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const artifact = flag(argv, '--artifact');
  const wires = flag(argv, '--wires');
  const keyModule = flag(argv, '--key-module');
  if (!artifact || !wires || !keyModule) fail('usage');
  const result = await seedCheck({artifact, wires, keyModule});
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && process.argv[1].endsWith('seed-check.mjs')) {
  main().catch((error) => fail(error.code || 'seed_check_failed'));
}
