import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { packageModule, bindingFor } from '../example/package.mjs';
import { invoke, python } from '../src/supervisor.mjs';
import { bytesHash, DEFAULT_LIMITS } from '../src/contracts.mjs';
export const sourceRevision = bytesHash(readFileSync(new URL('../example/structured-result.c', import.meta.url))).slice(7);
export const realModule = readFileSync(new URL('../.build/structured-result.wasm', import.meta.url));
export function wat(text) {
  const r = spawnSync(python, ['-I','-c','import sys,wasmtime;sys.stdout.buffer.write(wasmtime.wat2wasm(sys.stdin.read()))'], { input:text, maxBuffer:1048576 });
  if (r.status !== 0) throw new Error(r.stderr.toString()); return r.stdout;
}
export const wasm = (body = 'i64.const 4294967296', extra = '', memory = '(memory (export "memory") 1 1)', alloc = 'i32.const 4096') =>
  wat(`(module ${extra} ${memory} (func (export "alloc") (param i32) (result i32) ${alloc}) (func (export "transform") (param i32 i32) (result i64) ${body}))`);
export function packaged(moduleBytes = realModule, options = {}) {
  return packageModule(moduleBytes, { sourceRevision, ...options });
}
export async function execute(moduleBytes, options = {}) {
  const { input = Buffer.from('hello'), signal, onSpawn, ...overrides } = options;
  const artifact = packaged(moduleBytes, { input:{encoding:'bytes',shape:null}, output:{encoding:'bytes',shape:null}, ...overrides });
  const r = await invoke({ artifact, moduleBytes, input, binding:bindingFor(artifact), signal, onSpawn });
  return r;
}
export const limits = overrides => ({...DEFAULT_LIMITS,...overrides});
