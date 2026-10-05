// Receiving check: preserve prior amendment identities while checking latest bytes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runBounded} from '../../foundry/bounded-child.mjs';
export async function verifyFoundrySource(root) {
 const vendor='vendor/visitor-foundry-receiver',sha=b=>createHash('sha256').update(b).digest('hex');
 const pin=JSON.parse(await readFile(path.join(root,vendor,'SOURCE-PIN.json'))),latest=new Map();
 for(const amendment of pin.localAmendments) {
  for(const [file,identity] of Object.entries(amendment.files)) {
   if(latest.has(file))assert.equal(identity.receivedSha256,latest.get(file),`amendment chain ${file}`);
   const previous=await runBounded('git',['show',`${amendment.sdsBase}:${vendor}/${file}`],{cwd:root,capture:true,stdoutLimit:100000});
   assert.equal(previous.reason,null);assert.equal(previous.code===0?sha(previous.stdout):null,identity.receivedSha256,`received ${file}`);
   latest.set(file,identity.sha256);
  }
 }
 for(const [file,identity] of latest)assert.equal(sha(await readFile(path.join(root,vendor,file))),identity,`current ${file}`);
 // Accepted execution adapter and reference contract remain exactly at SDS274.
 const base='2c26534955fd3fa3c1a1ff12c5c5d4cdc5c2b7c1';
 for(const file of ['child.py','contracts.mjs','supervisor.mjs','launch.mjs','launcher.py']) {
  const full=`${vendor}/scripts/visitor-foundry/execution/src/${file}`;
  const previous=await runBounded('git',['show',`${base}:${full}`],{cwd:root,capture:true,stdoutLimit:100000});
  assert.equal(previous.reason,null);assert.equal(previous.code,0);assert.equal(sha(await readFile(path.join(root,full))),sha(previous.stdout));
 }
 return pin;
}
