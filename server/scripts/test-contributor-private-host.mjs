import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,cp,readFile,writeFile,readdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Reuse the received native/Unix fixtures and every original assertion without
// changing the selected Neo source or its compiled producer. Only the older fixture profile
// that assumes desk publication is explicitly opted into reviewed QA assets.
const neo=process.env.CONTRIBUTOR_JOURNEY_TEST_NEO_ROOT;
const sds=fileURLToPath(new URL('../../',import.meta.url));
assert.ok(neo&&path.isAbsolute(neo),'isolated exact Neo checkout required');
const received=JSON.parse(await readFile(new URL('../../vendor/neomorphic-contributor-journey/SOURCE.json',import.meta.url),'utf8'));
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:neo,encoding:'utf8'}).trim(),
  received.sourceCommit);
const scratch=await mkdtemp(path.join(tmpdir(),'sds-private-host-tests-'));
try{
  for(const entry of await readdir(neo))if(!['.git','tests','node_modules'].includes(entry))
    await symlink(path.join(neo,entry),path.join(scratch,entry));
  await symlink(path.join(neo,'node_modules'),path.join(scratch,'node_modules'));
  await cp(path.join(neo,'tests/contributor-journey'),path.join(scratch,'tests/contributor-journey'),{recursive:true});
  const managed=path.join(scratch,'tests/contributor-journey/managed-edge.test.ts');
  let source=await readFile(managed,'utf8');
  const old="SAMEDAYDESK_CLIENT_DIST:sds+'/client/dist',CONTRIBUTOR_DESK_MANAGED_ENABLED:'1',";
  assert.equal(source.split(old).length,2,'exact received fixture profile required');
  source=source.replace(old,old+"\n    CONTRIBUTOR_DESK_ASSETS_ENABLED:'1',CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF:'review_synthetic_asset_fixture_only',");
  // With one shared review reference, reviewed assets cannot also model absent
  // public review. Keep this legacy both-prefix refusal with invalid public-read
  // configuration; the appended matrix checks absent review as API503/desk404.
  const publicWithoutReview="{CONTRIBUTOR_JOURNEY_PUBLIC_READS:'1'},";
  assert.equal(source.split(publicWithoutReview).length,2,'exact public-read negative profile required');
  source=source.replace(publicWithoutReview,"{CONTRIBUTOR_JOURNEY_PUBLIC_READS:'invalid'},");
  await writeFile(managed,source+'\n'+await readFile(new URL('./fixtures/contributor-private-host-tests.ts',import.meta.url),'utf8'));
  // Historical 221400 stays byte-identical. Only this scratch copy moves the
  // opportunity kernel clock across the preserved import/submit/accept, then
  // restores the wall clock before account, referral, and measurement checks.
  const installedTest=path.join(scratch,'tests/contributor-journey/installed.test.ts');
  let installed=await readFile(installedTest,'utf8');
  const clockOn="  const old={...source};await service.opportunity.createRound(old,key('preserve-old'));\n  const token=";
  const clockWrapped="  const old={...source};await service.opportunity.createRound(old,key('preserve-old'));\n  const harnessStore=f.host.runtime.services.earnedWork.store;\n  const wallClock=harnessStore.clock;\n  harnessStore.clock=()=>new Date('2026-10-19T12:00:00.000Z');\n  const token=";
  assert.equal(installed.split(clockOn).length,2,'exact historical import site required');
  installed=installed.replace(clockOn,clockWrapped);
  const clockOff="  await service.opportunity.accept(old.roundKey,oldClaim,'fixture',key('old-accept'),null);\n  const oldSnapshot=";
  const clockRestored="  await service.opportunity.accept(old.roundKey,oldClaim,'fixture',key('old-accept'),null);\n  harnessStore.clock=wallClock;\n  const oldSnapshot=";
  assert.equal(installed.split(clockOff).length,2,'exact historical accept site required');
  installed=installed.replace(clockOff,clockRestored);
  await writeFile(installedTest,installed);
  const continuation=path.join(scratch,'tests/contributor-journey/original-continuation.test.ts');
  let cont=await readFile(continuation,'utf8');
  const settingsEnd="entry:process.env.CONTRIBUTOR_JOURNEY_TEST_USE_VENDOR==='1'?undefined:path.join(productRoot,'services/contributor-journey/dist/index.js')};";
  const settingsAsOf="entry:process.env.CONTRIBUTOR_JOURNEY_TEST_USE_VENDOR==='1'?undefined:path.join(productRoot,'services/contributor-journey/dist/index.js'),asOf:'2026-10-19T12:00:00.000Z'};";
  assert.equal(cont.split(settingsEnd).length,2,'exact continuation settings required');
  cont=cont.replace(settingsEnd,settingsAsOf);
  // Seed/import/submit/accept stay on asOf so the historical deadline is still open.
  // Token revocation and expiry are compared with kernel.now(); restore wall time
  // before that loop. The constructed future round must not reuse the past fixture deadline.
  const expiryOn="  await t.test('expired/revoked holder, altered scope/provenance and canonical submit replay cannot authorize',async()=>{\n    for(const [column,value,status]of";
  const expiryWall="  await t.test('expired/revoked holder, altered scope/provenance and canonical submit replay cannot authorize',async()=>{\n    f.host.original.state.store.clock=()=>new Date();\n    for(const [column,value,status]of";
  assert.equal(cont.split(expiryOn).length,2,'exact continuation expiry site required');
  cont=cont.replace(expiryOn,expiryWall);
  const futureOn="    const round={...f.source,roundKey:f.future,provenance:'test',offers:[{...f.source.offers[1],slotCount:1,ownerReservedSlots:0,publicClaimable:true}],alternatives:[]};";
  const futureDeadline="    const round={...f.source,roundKey:f.future,provenance:'test',submissionDeadline:new Date(Date.now()+86400000).toISOString().slice(0,19)+'Z',offers:[{...f.source.offers[1],slotCount:1,ownerReservedSlots:0,publicClaimable:true}],alternatives:[]};";
  assert.equal(cont.split(futureOn).length,2,'exact future-round site required');
  cont=cont.replace(futureOn,futureDeadline);
  await writeFile(continuation,cont);
  const postDeadline=path.join(scratch,'tests/contributor-journey/post-deadline-negative.test.ts');
  await cp(new URL('./fixtures/contributor-private-host-post-deadline.test.ts',import.meta.url),postDeadline);
  const files=[managed,...[
    'public-relationship.test.ts','installed.test.ts','hosted-live-empty.test.ts',
    'config.test.ts','measurement-scope.test.ts','original-continuation.test.ts',
    'post-deadline-negative.test.ts',
  ].map(file=>path.join(scratch,'tests/contributor-journey',file))];
  const child=spawn(process.execPath,['--import',path.join(neo,'services/contributor-journey/node_modules/tsx/dist/loader.mjs'),
    '--test','--test-concurrency=1',...files],{cwd:scratch,stdio:'inherit',env:{...process.env,
      CONTRIBUTOR_JOURNEY_TEST_SDS_ROOT:sds,CONTRIBUTOR_JOURNEY_TEST_USE_VENDOR:'1',
      CONTRIBUTOR_RELATIONSHIP_MANAGED:'1',CONTRIBUTOR_JOURNEY_TEST_DESK_HOST:'1'}});
  const [code,signal]=await once(child,'exit');
  assert.equal(signal,null,'owned test child must exit normally');process.exitCode=code??1;
}finally{
  await rm(scratch,{recursive:true,force:true});
}
