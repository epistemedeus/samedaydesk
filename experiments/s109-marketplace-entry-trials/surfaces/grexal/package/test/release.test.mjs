import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import run,{packEvidence} from '../agent/pack_evidence.js';
import {unquoteGitPath,isUnsafePath} from '../lib/diff_analysis.js';
import {worksheetRow,microsFromUsd} from '../bin/fee-worksheet.mjs';
const good='diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n';
const cli=new URL('../agent/pack_evidence.js',import.meta.url);
test('rejects nonpatch/header-only, count overflow and header mismatch',()=>{
 for(const d of ['hello\n','diff --git a/a b/a\n',good+'+extra\n',good.replace('+++ b/a','+++ b/other')])assert.equal(packEvidence({unifiedDiff:d}).structuralChecksPass,false);
});
test('UTF8 octal paths, spaces, control and drive traversal',()=>{
 assert.equal(unquoteGitPath('"a/caf\\303\\251"'),'a/café');
 for(const p of ['a/C:/secret','"a/\\056\\056/secret"','"a/b\\011c"'])assert.equal(isUnsafePath(p),true);
 assert.equal(packEvidence({unifiedDiff:good.replaceAll('a/a','a/name with spaces').replaceAll('b/a','b/name with spaces')}).structuralChecksPass,true);
});
test('hunk content resembling file headers still consumes lines',()=>assert.equal(packEvidence({unifiedDiff:good.replace('-old','--- old').replace('+new','+++ new')}).structuralChecksPass,true));
test('rejects malformed criteria and preserves no-authority',()=>{
 for(const buyerCriteria of [{},[null],[{type:'minFiles',value:-1}],[{id:'a'},{id:'a'}]])assert.throws(()=>packEvidence({unifiedDiff:good,buyerCriteria}));
 const r=packEvidence({unifiedDiff:good,buyerCriteria:[{id:'structural',type:'requireStructuralPass'}]});
 assert.equal(r.acceptanceReport.buyerCriteria.localBindingSatisfied,true);assert.equal(r.buyerAcceptanceVerified,false);
});
test('CLI refuses bad options; empty input does not execute repository fallback',()=>{
 for(const args of [['--rangeOp'],['--unknown','x'],['--unifiedDiff','']])assert.notEqual(spawnSync(process.execPath,[cli.pathname,...args,'--stdout-only']).status,0);
});
test('omission creates an explicit marker, never a patch; output immutable',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'diff-release-'));const out=path.join(dir,'out');
 const args=[cli.pathname,'--unifiedDiff',good,'--maxDiffBytes','1','--outDir',out];
 let r=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(r.status,2,r.stderr);assert.equal(JSON.parse(r.stdout).diffPath,null);assert.equal(fs.existsSync(path.join(out,'changes.diff')),false);assert.equal(fs.existsSync(path.join(out,'changes.OMITTED.txt')),true);
 assert.equal(spawnSync(process.execPath,args).status,1);fs.rmSync(dir,{recursive:true});
});
test('official-shaped ctx entry consumes task, returns declared types without authority',async()=>{
 const progress=[];const result=await run({task:async()=>({unifiedDiff:good}),log:async()=>{},progress:async x=>progress.push(x)});
 const manifest=JSON.parse(fs.readFileSync(new URL('../grexal.json',import.meta.url)));
 for(const [key,schema] of Object.entries(manifest.output_schema)) {if(schema.type==='boolean')assert.equal(typeof result[key],'boolean');}
 assert.deepEqual(progress,[.4,1]);assert.equal(result.grexalPaidExecution,false);assert.equal(result.structuralChecksPass,true);
});
test('fee exact fractional micros and conflicting units fail',()=>{
 const r=worksheetRow(.000001);assert.equal(r.platformFeeMicrosNumerator,'3');assert.equal(r.exactMicrosDenominator,10);assert.equal(r.sellerEarningsMicrosNumerator,'7');
 assert.throws(()=>worksheetRow(.05,{chargeMicros:100000}));assert.throws(()=>microsFromUsd(Number.MAX_VALUE));
});
test('fresh archive draft preparation supplies real tracked runtime files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grexal-draft-'));
 for(const name of ['agent','lib','bin','test','fixtures','package.json','grexal.json','README.md','LICENSE','worksheets','.grexal']) fs.cpSync(new URL('../'+name,import.meta.url),path.join(dir,name),{recursive:true});
 for(const args of [['init','.'],['add','agent','lib','bin','test','fixtures','package.json','grexal.json','README.md','LICENSE','worksheets','.grexal/agent.json']])assert.equal(spawnSync('git',args,{cwd:dir}).status,0);
 const files=spawnSync('git',['ls-files','-z'],{cwd:dir});assert.equal(files.status,0);
 const tar=spawnSync('tar',['-czf',path.join(dir,'draft.tgz'),'--null','-T','-'],{cwd:dir,input:files.stdout});assert.equal(tar.status,0);
 const list=spawnSync('tar',['-tzf',path.join(dir,'draft.tgz')],{encoding:'utf8'}).stdout;assert.match(list,/agent\/pack_evidence.js/);assert.match(list,/lib\/diff_analysis.js/);assert.match(list,/grexal.json/);
 assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(dir,'.grexal/agent.json')))),['name']);fs.rmSync(dir,{recursive:true});
});
