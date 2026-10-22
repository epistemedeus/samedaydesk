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
  const files=[managed,...[
    'public-relationship.test.ts','installed.test.ts','hosted-live-empty.test.ts',
    'config.test.ts','measurement-scope.test.ts','original-continuation.test.ts',
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
