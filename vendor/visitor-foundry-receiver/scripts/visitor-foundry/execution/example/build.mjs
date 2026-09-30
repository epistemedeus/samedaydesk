import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bytesHash } from '../src/contracts.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(`${root}.build`, { recursive: true });
// Existing VM toolchain only. Override to another already installed wasm-ld if needed.
const linker = process.env.VF08_WASM_LD ?? '/usr/local/rustup/toolchains/1.83.0-x86_64-unknown-linux-gnu/lib/rustlib/x86_64-unknown-linux-gnu/bin/gcc-ld/wasm-ld';
const args = ['--target=wasm32', '-O2', '-nostdlib', '-fno-builtin', '-c', `${root}example/structured-result.c`, '-o', `${root}.build/structured-result.o`];
const linkArgs = ['--no-entry', '--export-memory', '--initial-memory=262144', '--max-memory=262144', '-z', 'stack-size=32768', `${root}.build/structured-result.o`, '-o', `${root}.build/structured-result.wasm`];
for (const [cmd, argv] of [['/usr/bin/clang', args], [linker, linkArgs]]) {
  const result = spawnSync(cmd, argv, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'compiler/linker unavailable');
}
const bytes = readFileSync(`${root}.build/structured-result.wasm`);
const receipt = { moduleDigest: bytesHash(bytes), bytes: bytes.length,
  sourceDigest: bytesHash(readFileSync(`${root}example/structured-result.c`)),
  compiler: spawnSync('/usr/bin/clang', ['--version'], { encoding: 'utf8' }).stdout.trim(),
  linkerDigest: bytesHash(readFileSync(linker)), linkArgs: linkArgs.map(a => a.replaceAll(root, '<execution>/')), args: args.map(a => a.replaceAll(root, '<execution>/')) };
writeFileSync(`${root}.build/build.json`, JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
