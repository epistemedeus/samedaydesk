import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import express from 'express';
import {verifyContributorRuntime} from '../lib/contributor-artifact.js';
import {mountNeomorphicOriginalContinuation,ORIGINAL_CONTINUATION_PREFIX} from '../lib/neomorphic-original-continuation-mount.js';

const root=new URL('../../vendor/neomorphic-contributor-journey/',import.meta.url),original=new URL('../../vendor/neomorphic-opportunity/',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('exact installed continuation closure and SQL are pinned to the committed clean producer',async()=>{
  const manifest=await verifyContributorRuntime(root.pathname);
  const entry=await import(new URL('services/contributor-journey/dist/index.js',root));
  assert.equal(typeof entry.createInstalledOriginalContinuation,'function');assert.equal(entry.ORIGINAL_CONTINUATION_PREFIX,ORIGINAL_CONTINUATION_PREFIX);
  assert.equal(entry.CONSENT_VERSION,'original-continuation/v1');
  const files=manifest.files.map(file=>file.path);
  for(const suffix of ['original-continuation.js','original-continuation/client.js','original-continuation/service.js','original-continuation/migrations/001_links.sql'])
    assert.ok(files.some(file=>file.endsWith('/'+suffix)),suffix);
  const disabled=await entry.createInstalledOriginalContinuation(new Proxy({},{get(){throw new Error('disabled touched runtime');}}));assert.equal(disabled.service,null);
});
test('original canonical service retains its producer and explicitly identifies the additive source overlay',async()=>{
  const overlay=JSON.parse(await readFile(new URL('CONTINUATION-SOURCE.json',original),'utf8'));
  const pin=JSON.parse(await readFile(new URL('SOURCE-PIN.json',original),'utf8'));
  const manifest=JSON.parse(await readFile(new URL('SOURCE-MANIFEST.json',original),'utf8'));
  // Overlay and journey are independently versioned; bind the overlay to its own producer pin.
  assert.equal(overlay.schema,'neomorphic.original-continuation.overlay.v1');assert.match(overlay.sourceCommit,/^[a-f0-9]{40}$/);
  assert.deepEqual(overlay,pin.continuationOverlay);
  assert.equal(pin.receivedHead,overlay.originalProducer);assert.notEqual(pin.receivedHead,overlay.sourceCommit);
  assert.equal(overlay.canonicalSchema,'neo_opportunity_221400');assert.equal(overlay.releaseAccepted,false);
  assert.equal(manifest.sourceMismatches,3);assert.equal(manifest.sourceCount,manifest.sourceFiles.length);assert.equal(manifest.distCount,manifest.distFiles.length);
  assert.equal(sha(await readFile(new URL(overlay.helperPath,original))),overlay.helperSha256);
  for(const entry of [...manifest.sourceFiles,...manifest.distFiles]){
    const bytes=await readFile(new URL(entry.path,original));assert.equal(bytes.length,entry.bytes,entry.path);assert.equal(sha(bytes),entry.sha256,entry.path);
  }
  const helper=await import(new URL('services/earned-work/dist/opportunity/continuation.js',original));assert.equal(typeof helper.mountOriginalContinuationRoutes,'function');
});
test('default optional SDS mount is disabled and never discovers or opens account/provider resources',async t=>{
  const app=express(),mount=mountNeomorphicOriginalContinuation(app,{journey:new Proxy({},{get(){throw new Error('disabled touched journey');}})});
  const server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await mount.close();});
  const answer=await fetch(`http://127.0.0.1:${server.address().port}${ORIGINAL_CONTINUATION_PREFIX}/v1/links`);
  assert.equal(answer.status,503);assert.deepEqual(await answer.json(),{error:{code:'disabled'}});assert.equal(mount.state.service,null);
  assert.match(answer.headers.get('cache-control'),/no-store/);assert.match(answer.headers.get('x-robots-tag'),/noindex/);
});
test('enabled optional mount refuses an absent authenticated account contract without a fallback store',async()=>{
  const app=express(),mount=mountNeomorphicOriginalContinuation(app,{enabled:true,canonicalOrigin:'https://example.invalid',roundKey:'agent-opportunity-221400-v1',provenance:'production'});
  await mount.ready();assert.equal(mount.state.reason,'unavailable');assert.equal(mount.state.service,null);await mount.close();
});
