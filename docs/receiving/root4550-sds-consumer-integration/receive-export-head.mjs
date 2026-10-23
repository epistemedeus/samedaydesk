// Bind the final evidence-bearing commit without a self-referential Git file.
// Output is a separate product handback sidecar, never a runner-owned receipt.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {stageReleaseSource,admitReleaseSource} from './frozen-hostinger-release-source.mjs';
const [root,out]=process.argv.slice(2);
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const commit=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');
assert.equal(git('status','--porcelain'),'');
const source=JSON.parse(await readFile(path.join(root,'docs/receiving/root4550-sds-consumer-integration/ALLOWED-DELTA.json')));
const delta=git('diff','--name-only',source.sourceCommit,commit).split('\n').filter(Boolean);
assert(delta.every(p=>p.startsWith('docs/receiving/root4550-sds-consumer-integration/')));
const prior=JSON.parse(await readFile(path.join(root,'docs/receiving/root4550-sds-consumer-integration/canonical-source-admission.json'))).receipts.find(x=>x.name==='candidate').readback;
await mkdir(out,{recursive:true});const stagedRoot=path.join(out,'staged-final-source');
const options={manifest:{repository:'epistemedeus/samedaydesk',commit,neomorphicCommit:'a0c97a594cebe73236e95caa6c4028bb36a60be9',neomorphicDeskCommit:'0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556'},
 sdsRoot:stagedRoot,sourceCheckout:root,reuseSource:root,dependenciesRoot:root,entryClosure:true,signal:AbortSignal.timeout(120000)};
const staged=await stageReleaseSource(options),readback=await admitReleaseSource(options);
assert.equal(staged.memberDigest,readback.memberDigest);assert.equal(readback.memberDigest,prior.memberDigest);
assert.equal(readback.sourceCommit,commit);assert.equal(readback.sourceTree,tree);
assert.equal(readback.dependenciesCompatible,true);assert.equal(readback.providerMutated,false);assert.equal(readback.qualificationIssued,false);
await writeFile(path.join(out,'FINAL-SOURCE-ADMISSION.json'),JSON.stringify({schema:'root4550.final-export-binding.v1',commit,tree,testedSourceCommit:source.sourceCommit,testedSourceTree:source.sourceTree,evidenceOnlyDelta:delta,staged,readback,installed:false},null,2)+'\n');
await rm(stagedRoot,{recursive:true});
console.log(JSON.stringify({passed:true,commit,tree,memberDigest:readback.memberDigest,files:readback.files,bytes:readback.bytes,dependenciesCompatible:true,providerMutated:false,qualificationIssued:false}));
