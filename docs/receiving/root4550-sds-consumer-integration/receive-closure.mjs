#!/usr/bin/env node
// Bounded adaptation of Pilot 14761c91 receive-closure.mjs for this cohort.
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const [base,candidate,out]=process.argv.slice(2);
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const git=(root,args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
const rootPin='server/foundry/activation/private-control-pin.json';
const expected=await json(new URL('./ALLOWED-DELTA.json',import.meta.url));
const runtimeRepair=await json(new URL('./RUNTIME-CONTRACT-REPAIR.json',import.meta.url));
const result={schema:'root4550.source-closure.v1',baseline:git(base,['rev-parse','HEAD']),candidate:git(candidate,['rev-parse','HEAD']),products:[]};
assert.equal(result.baseline,'79fbd37d31aabdc790248443c576a2f0017e55f0');
execFileSync('git',['-C',candidate,'merge-base','--is-ancestor',result.baseline,result.candidate]);
const changed=git(candidate,['diff','--name-only',result.baseline,result.candidate]).split('\n').filter(Boolean);
// Later evidence commits may extend this job's receiving directory only.
const material=changed.filter(p=>!p.startsWith('docs/receiving/root4550-sds-consumer-integration/'));
assert.deepEqual(material,Object.keys(expected.files).sort());
for(const name of material)assert.equal(sha(await readFile(path.join(candidate,name))),expected.files[name],name);
result.changedPaths=material;
const callers=[];
for(const root of [base,candidate]) {
 const native=await import(pathToFileURL(path.join(root,'vendor/hosted-wallet-market/src/native-debt.mjs')));
 const artifact=await import(pathToFileURL(path.join(root,'server/lib/contributor-artifact.js')));
 const desk=await import(pathToFileURL(path.join(root,'server/lib/contributor-desk-assets.js')));
 const caller=await import(pathToFileURL(path.join(root,'server/foundry/activation/remote-private-journey.mjs')));callers.push(caller);
 const journeyManifest=await artifact.verifyContributorRuntime(path.join(root,'vendor/neomorphic-contributor-journey'),'a0c97a594cebe73236e95caa6c4028bb36a60be9');
 const deskAssets=await desk.loadContributorDeskAssets(journeyManifest.sourceCommit,{expectedDeskCommit:'0cebdb9a77c5bda9b2fb811f6efd1dfe35e75556'});
 const pin=await json(path.join(root,rootPin));
 const inventory=async(prefix,names)=>Promise.all(names.map(async name=>{
  const p=path.join(prefix,name),stat=await lstat(path.join(root,p));assert(stat.isFile()&&!stat.isSymbolicLink());
  const bytes=await readFile(path.join(root,p));return {path:p,bytes:bytes.length,sha256:sha(bytes)};
 }));
 const source=await inventory('vendor/hosted-wallet-market',native.installedSourceFiles());
 assert.equal((await json(path.join(root,'vendor/hosted-wallet-market/SOURCE.json'))).installedSourceSha256,native.installedSourceSha256());
 const host=await inventory('',[...Object.keys(pin.files),rootPin].sort());
 for(const entry of host)if(entry.path!==rootPin)assert.equal(entry.sha256,pin.files[entry.path]);
 // machine-runtime is its existing foundation/rail/market contract; the five
 // new/changed hosted adapters are covered by the full interpreted source pin.
 const runtime=await json(path.join(root,'vendor/hosted-wallet-market/contracts/machine-runtime.json'));
 const mismatches=[];
 for(const [name,digest] of Object.entries(runtime.files)) {
  const actual=sha(await readFile(path.join(root,'vendor/hosted-wallet-market',name)));
  if(actual!==digest)mismatches.push({path:name,before:digest,after:actual});
 }
 assert.deepEqual(mismatches,root===base?runtimeRepair.changes:[],'exact inherited mismatch / final runtime file map');
 const runtimeActualMembers=await inventory('vendor/hosted-wallet-market',Object.keys(runtime.files));
 result.products.push({commit:git(root,['rev-parse','HEAD']),tree:git(root,['rev-parse','HEAD^{tree}']),sourceSha256:native.installedSourceSha256(),hostSha256:native.hostSourceSha256(root),
  importContractSha256:native.IMPORT_CONTRACT_SHA256,consumerContractSha256:native.consumerContractSha256(),caller:caller.verifyCallerClosure(),sourceMembers:source,hostMembers:host,
  runtimeContract:{sha256:sha(await readFile(path.join(root,'vendor/hosted-wallet-market/contracts/machine-runtime.json'))),members:Object.keys(runtime.files).length,inheritedMismatches:mismatches},runtimeActualMembers,
  journey:{source:journeyManifest.sourceCommit,members:journeyManifest.files.length,manifestSha256:sha(await readFile(path.join(root,'vendor/neomorphic-contributor-journey/SOURCE.json'))),requiredDependencies:journeyManifest.requiredDependencies},
  desk:{source:deskAssets.deskSourceCommit,members:deskAssets.manifest.files.length,manifestSha256:sha(await readFile(path.join(root,'vendor/neomorphic-contributor-desk/SOURCE.json')))},
  locks:await inventory('',['package.json','package-lock.json','client/package.json','client/package-lock.json']),trackedChangesAfterBuild:git(root,['status','--short','--untracked-files=no'])});
}
for(const field of ['importContractSha256','consumerContractSha256','runtimeActualMembers','journey','desk','locks'])assert.deepEqual(result.products[0][field],result.products[1][field],field);
assert.equal(callers[1].acceptedCallerPin(result.products[0].caller),true,'received immutable predecessor caller');
const delta=(a,b)=>{
 const am=new Map(a.map(x=>[x.path,x])),bm=new Map(b.map(x=>[x.path,x]));
 return [...new Set([...am.keys(),...bm.keys()])].sort().filter(p=>am.get(p)?.sha256!==bm.get(p)?.sha256).map(p=>({path:p,before:am.get(p)?.sha256??null,after:bm.get(p)?.sha256??null}));
};
result.packageDelta=delta(result.products[0].sourceMembers,result.products[1].sourceMembers);
result.hostDelta=delta(result.products[0].hostMembers,result.products[1].hostMembers);
assert.deepEqual(result.packageDelta,expected.packageDelta);
assert.deepEqual(result.hostDelta,expected.hostDelta);
assert.notEqual(result.products[0].sourceSha256,result.products[1].sourceSha256);
assert.notEqual(result.products[0].hostSha256,result.products[1].hostSha256);
result.installed=false;
await writeFile(path.join(out,'source-closure.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,products:result.products.map(p=>({commit:p.commit,tree:p.tree,source:p.sourceSha256,host:p.hostSha256,sourceMembers:p.sourceMembers.length,hostMembers:p.hostMembers.length})),packageDelta:result.packageDelta,hostDelta:result.hostDelta}));
