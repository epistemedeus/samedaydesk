// Source/package qualification only. No listener, provider, account or MCP call.
// Run after build:managed-contributor, with NODE_OPTIONS=--max-old-space-size=384.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.argv[2];
assert.equal(process.argv.length,3);
assert.ok(path.isAbsolute(root));
const scratch=mkdtempSync(path.join(tmpdir(),'r6pkg-'));
const load=name=>import(pathToFileURL(path.join(root,name)).href);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let pulse;
try {
  // The package imports the real application without starting it. Keep the
  // optional hydration path local and unconfigured before any module loads.
  Object.assign(process.env,{SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',
    STRIPE_SECRET_KEY:'',RESEND_API_KEY:'',PULSE_FILE:path.join(scratch,'pulse.json')});
  const expected=JSON.parse(readFileSync(new URL('./MCP-SOURCE.json',import.meta.url)));
  for(const member of expected.files) assert.equal(hash(readFileSync(path.join(root,member.path))),member.sha256,member.path);
  const require=createRequire(path.join(root,'package.json'));
  const dependencies=Object.fromEntries(['express','pg','zod','ajv'].map(name=>[name,require(name+'/package.json').version]));
  const {loadContributorDeskAssets}=await load('server/lib/contributor-desk-assets.js');
  const source=JSON.parse(readFileSync(path.join(root,'vendor/neomorphic-contributor-journey/SOURCE.json'))).sourceCommit;
  const desk=await loadContributorDeskAssets(source);
  const {installedSourceFiles,installedSourceSha256,hostSourceSha256}=await load('vendor/hosted-wallet-market/src/native-debt.mjs');
  const financial={members:installedSourceFiles().length,sourceSha256:installedSourceSha256(),hostSha256:hostSourceSha256(root)};
  const {createSdsApp}=await load('server/app.js'); assert.equal(typeof createSdsApp,'function');
  pulse=await load('server/lib/pulse.js');pulse.__pulseTestInternals().stopScheduledFlush();await pulse.waitForPulseHydration();
  const schema=await load('server/lib/pulse-store/schema.js');
  const {createFileFallbackStore,createPulseStoreFromTransport}=await load('server/lib/pulse-store/index.js');
  const at='2026-10-24T00:00:00.000Z',event='unattributed|_none|refusal_unsupported_protocol';
  const old=schema.emptyDelta(at);
  const current={...old,mcpOutcomes:{observedFrom:at,refusalObservedFrom:at,counts:{[event]:1}}};
  const disk=createFileFallbackStore(path.join(scratch,'wal.json'));
  for(const [index,delta] of [old,current].entries()) {
    const flushId=`d6000000-0000-4000-8000-00000000000${index+1}`;
    assert.equal(disk.enqueuePendingFlush({flushId,createdAt:at,delta}).outcome,'queued');
    const read=createFileFallbackStore(path.join(scratch,'wal.json')).loadPendingFlushes()[index];
    assert.equal(schema.deltaCanonicalDigest(read.delta),schema.deltaCanonicalDigest(delta));
    assert.equal(Object.hasOwn(read.delta,'mcpOutcomes'),index===1);
  }
  const adapter=createPulseStoreFromTransport({async rpc(){return {data:current,error:null};}});
  assert.equal((await adapter.readSnapshot(at)).mcpOutcomes.counts[event],1);
  await assert.rejects(createPulseStoreFromTransport({async rpc(){return {data:{...current,mcpOutcomes:{...current.mcpOutcomes,arbitrary:'refused'}},error:null};}}).readSnapshot(at));
  const {verifyOfflineRuntime}=await load('server/foundry/runtime-layout.mjs');
  const {CPYTHON_SHA256,WHEEL_SHA256}=await load('server/foundry/runtime-artifacts.mjs');
  const runtime=await verifyOfflineRuntime(path.join(root,'vendor/visitor-foundry-receiver/scripts/visitor-foundry/execution/.runtime'),{archiveSha256:CPYTHON_SHA256,wheelSha256:WHEEL_SHA256});
  console.log(JSON.stringify({ok:true,root,criticalMcpMembers:expected.files.length,dependencies,
    deskMembers:desk.manifest.files.length,financial,applicationImports:true,listenerStarted:false,
    packageWalOldAndNew:true,packageTransportNewAndUnknownFieldRefusal:true,runtime,
    schemaMigration:'0009_after_existing_0008_before_producer',productionEffect:false}));
} finally {
  pulse?.__pulseTestInternals().stopScheduledFlush();
  rmSync(scratch,{recursive:true,force:true});
}
