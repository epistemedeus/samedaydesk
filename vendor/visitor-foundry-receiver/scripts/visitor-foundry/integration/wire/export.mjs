import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { vectors } from './vectors.mjs';
import { ports } from '../src/wire.mjs';
for(const [file,value] of [['conformance-vectors.json',vectors()],['receiving-ports.json',ports]]) {
  const expected=JSON.stringify(value,null,2)+'\n',url=new URL(file,import.meta.url);
  if(process.argv.includes('--check'))assert.equal(await readFile(url,'utf8'),expected,`${file} drift`);
  else await writeFile(url,expected);
}
console.log('Receiving port and conformance vectors match executable wire contract.');
