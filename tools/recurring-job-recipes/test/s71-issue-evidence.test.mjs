import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fetchGithubIssueEvidence } from '../lib/github-comments.mjs';
import { diffIssueEvidence } from '../lib/issue-evidence-delta.mjs';
import { runIssueEvidence } from '../recipes/issue-evidence.mjs';
const url='https://github.com/owner/repo/issues/1';
const issue={number:1,html_url:url,title:'issue',body:'Acceptance: retain this constraint',comments:1};
const comment={id:1,body:'hello',issue_url:'https://api.github.com/repos/owner/repo/issues/1'};
const response=x=>Response.json(x);
const adapter=(pages=()=>response([comment]))=>async target=>target.includes('/comments')?pages(target):response(issue);
test('undefined options preserve bounds; invalid and infinite limits cannot label unobserved comments complete',async()=>{
 const good=await fetchGithubIssueEvidence(url,{bounds:{maxCommentPages:undefined},fetchImpl:adapter()});assert.equal(good.completeness,'complete');assert.equal(good.observation.bounds.maxCommentPages,3);
 for(const value of [0,-1,Infinity,1.5,100000]){let calls=0;const bad=await fetchGithubIssueEvidence(url,{bounds:{maxCommentPages:value},fetchImpl:async()=>{calls++;}});assert.equal(bad.error.code,'invalid_bounds');assert.equal(calls,0);}
});
test('pagination cannot send explicit credentials to foreign origins, paths or cyclic pages',async()=>{
 for(const next of ['http://127.0.0.1/token','https://other.example/token','https://api.github.com/user?page=2','https://api.github.com/repos/owner/repo/issues/2/comments?page=2','https://api.github.com/repos/owner/repo/issues/1/comments?page=1']){
  const calls=[];const result=await fetchGithubIssueEvidence(url,{token:'synthetic-token',fetchImpl:async(target,init)=>{calls.push(target);assert.ok(target.startsWith('https://api.github.com/repos/owner/repo/issues/1'));return target.includes('/comments')?Response.json([comment],{headers:{link:`<${next}>; rel="next"`}}):response(issue);}});
  assert.equal(calls.length,2);assert.equal(result.completeness,'partial');
 }
});
test('missing counts, duplicate ids and malformed comment records stay partial',async()=>{
 for(const comments of [[],[comment,comment],[null],[{id:1}], [{...comment,issue_url:'https://api.github.com/repos/other/repo/issues/1'}]]){
  const result=await fetchGithubIssueEvidence(url,{fetchImpl:adapter(()=>response(comments))});assert.equal(result.completeness,'partial');
 }
});
test('incomplete listings cannot promote missing/oversize comments to deleted or unchanged',()=>{
 const prior={observation:{issue:{url,body:'old'},comments:[{id:'1',body:'hello'}],completeness:'complete'}};
 const missing=diffIssueEvidence({issue:prior.observation.issue,comments:[],completeness:'partial'},prior);assert.equal(missing.commentChanges[0].classification,'unavailable');
 const oversize=diffIssueEvidence({issue:prior.observation.issue,comments:[{id:'1',body:'',retrievalStatus:'oversize'}],completeness:'partial'},prior);assert.equal(oversize.commentChanges[0].classification,'oversize');
});
test('caller abort during source body read ends collection without hidden retries',async()=>{
 const controller=new AbortController();let calls=0;
 const resultPromise=fetchGithubIssueEvidence(url,{signal:controller.signal,fetchImpl:async()=>{calls++;return {ok:true,status:200,headers:new Headers(),body:{getReader:()=>({read:()=>new Promise(()=>{}),releaseLock(){}})}};}});
 setTimeout(()=>controller.abort(),10);const result=await resultPromise;assert.equal(result.completeness,'error');assert.equal(calls,1);
});
test('prior identity is bound and original source constraints survive an issue body edit',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'issue-review-'));try{
  const fixture=JSON.parse(readFileSync(new URL('../fixtures/issue-evidence/99533-base.json',import.meta.url),'utf8'));const originalBody=fixture.issue.body;
  const current=path.join(dir,'current.json');writeFileSync(current,JSON.stringify(fixture));const first=await runIssueEvidence({evidenceFixturePath:current});
  const prior=path.join(dir,'prior.json');writeFileSync(prior,JSON.stringify({createdAt:new Date().toISOString(),payload:{observation:first.evidence.observation}}));
  fixture.issue.body='replacement instructions';writeFileSync(current,JSON.stringify(fixture));const changed=await runIssueEvidence({evidenceFixturePath:current,priorPath:prior});assert.equal(changed.evidence.brief.originalAcceptance.sourceBody,originalBody);
  fixture.issue.url='https://github.com/other/repo/issues/1';writeFileSync(current,JSON.stringify(fixture));const foreign=await runIssueEvidence({evidenceFixturePath:current,priorPath:prior});assert.equal(foreign.evidence.code,'prior_identity_mismatch');
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('forged prior digest, symlink and oversize fixture inputs are rejected before observation',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'issue-inputs-'));try{
  const prior=path.join(dir,'prior.json');writeFileSync(prior,JSON.stringify({sha256:'forged',payload:{observation:{}}}));
  const result=await runIssueEvidence({priorPath:prior});assert.equal(result.evidence.code,'invalid_prior');
  const link=path.join(dir,'link');symlinkSync(prior,link);assert.equal((await runIssueEvidence({priorPath:link})).evidence.code,'invalid_prior');
  const big=path.join(dir,'big.json');writeFileSync(big,' '.repeat(4200000));assert.equal((await runIssueEvidence({evidenceFixturePath:big})).evidence.code,'invalid_evidence_fixture');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
