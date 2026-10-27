#!/usr/bin/env node
/**
 * Configured receiving caller for the independent acquisition package.
 *
 * The participation test keeps its own assertions. This caller only forwards
 * the three supplied paths. It does not hash this SDS tree into a trust
 * anchor, invent a path, or substitute a private checkout.
 *
 * Required environment, supplied by the caller of this script:
 *   ROOT10940_TRUST_ANCHOR
 *   ROOT10940_ACQUIRED_CLIENT
 *   ROOT10940_ACQUISITION_DESCRIPTOR
 *
 * runtime-startup.yml still invokes the test directly and cannot be updated
 * with the current OAuth token (no workflow scope). GitHub receiving stays
 * open until that workflow step calls this script with the same three paths.
 */
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const required=['ROOT10940_TRUST_ANCHOR','ROOT10940_ACQUIRED_CLIENT','ROOT10940_ACQUISITION_DESCRIPTOR'];
for(const name of required){
  if(typeof process.env[name]!=='string'||process.env[name].length===0){
    process.stderr.write(`${name} is required\n`);
    process.exitCode=2;
  }
}
if(process.exitCode)process.exit(process.exitCode);
const root=fileURLToPath(new URL('../..',import.meta.url));
const child=spawn(process.execPath,['--test','--test-concurrency=1','server/scripts/test-root10940-machine-participation.mjs'],{
  cwd:root,stdio:'inherit',env:process.env,
});
const [code,signal]=await once(child,'exit');
if(signal!==null)process.exit(1);
process.exit(code??1);
