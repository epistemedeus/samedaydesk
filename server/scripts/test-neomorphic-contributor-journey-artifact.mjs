import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const root=new URL('../../vendor/neomorphic-contributor-journey/',import.meta.url);
test('default installed artifact has exact source/build provenance and every received byte matches its manifest',async()=>{
  const manifest=JSON.parse(await readFile(new URL('SOURCE.json',root),'utf8'));
  assert.equal(manifest.schema,'neomorphic.contributor-journey.artifact.v1');assert.match(manifest.sourceCommit,/^[a-f0-9]{40}$/);
  for(const entry of manifest.files){assert.ok(!entry.path.startsWith('/')&&!entry.path.split('/').includes('..'));
    const bytes=await readFile(new URL(entry.path,root));assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
  const stamp=JSON.parse(await readFile(new URL('services/contributor-journey/dist/runtime/SOURCE-BUILD.json',root),'utf8'));
  assert.equal(stamp.sourceCommit,manifest.sourceCommit);assert.equal(stamp.dirty,false);
  assert.equal(createHash('sha256').update(await readFile(new URL('../../package-lock.json',import.meta.url))).digest('hex'),manifest.hostLockSha256);
  const require=createRequire(import.meta.url);for(const [name,version]of Object.entries(manifest.requiredDependencies))assert.equal(require(name+'/package.json').version,version);
});
test('native default artifact imports without a TS loader and disabled factory opens no store',async()=>{
  const service=await import(new URL('services/contributor-journey/dist/index.js',root));const runtime=await service.createJourneyRuntime({env:{}});
  assert.equal(runtime.config.mode,'disabled');assert.equal(runtime.services,null);await runtime.close();
});
