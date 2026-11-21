// Appended only to the task-owned copy of Neo's exact managed-edge fixtures.
// These tests exercise the real SDS entrypoint and compiled vendor artifact.
const privatePrefix='/api/neomorphic-contributor-journey';
async function hiddenDesk(f:any){
  assert.equal(f.manifest.files.length,45);
  for(const route of ['/contribute',...f.manifest.files.map((member:any)=>member.url),
    '/contribute/not-a-route','/contribute/_assets/missing.css','/contribute/account/index.html']){
    for(const method of ['GET','HEAD','POST']){
      const answer=await f.request(route,{method});assert.equal(answer.status,404,method+' '+route);
      assert.equal(answer.headers['set-cookie'],undefined);
      assert.ok(!answer.text.includes('<html'),'hidden desk must not fall through to SPA HTML');
    }
  }
}

for(const transport of ['tcp','passenger','litespeed'] as const)test(
  'private managed '+transport+': live API/signup/session/Origin/CSRF/recovery/restart with every asset off',async t=>{
    const f=await fixture('live',true,transport,'pinned',transport==='litespeed'?'inherited':'path');t.after(f.close);
    const qualification=transport==='litespeed'?await f.qualify():{};
    await f.restart({...qualification,CONTRIBUTOR_DESK_ASSETS_ENABLED:'0',CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF:undefined});
    const status=await f.request(privatePrefix+'/healthz');assert.equal(status.status,200);assert.equal(status.body.publicEnabled,false);
    await hiddenDesk(f);
    assert.deepEqual((await f.request('/')).bytes,await readFile(sds+'/client/dist/index.html'));
    assert.equal((await f.request('/x402')).status,200);assert.equal((await f.request('/api/health')).status,200);
    const signup=async()=>{
      const answer=await f.request(privatePrefix+'/v1/account/signup',{body:{password:'synthetic-private-host-qa-password'},
        headers:{origin:f.origin,'x-account-operation-proof':randomBytes(32).toString('base64url'),'idempotency-key':key('private-signup')}});
      assert.equal(answer.status,200);assert.equal(answer.body.sessionDelivery,'cookie');assert.equal(answer.body.sessionToken,undefined);
      const cookies=answer.headers['set-cookie'] as string[],session=cookies.find(cookie=>cookie.startsWith('__Host-neo_contributor='))!;
      assert.ok(session);for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/'])assert.ok(session.includes(flag));assert.ok(!session.includes('Domain='));
      return {account:answer.body.account,recovery:answer.body.recoveryCode,cookie:cookies.map(cookie=>cookie.split(';')[0]).join('; ')};
    };
    const first=await signup(),second=await signup();assert.notEqual(first.account.accountId,second.account.accountId);
    const session=await f.request(privatePrefix+'/v1/account/session',{headers:{cookie:first.cookie}});
    assert.equal(session.status,200);const csrf=String(session.headers['x-cj-csrf']);assert.ok(csrf);
    assert.equal((await f.request(privatePrefix+'/v1/account/session',{headers:{cookie:first.cookie,origin:'https://foreign.invalid'}})).status,403);
    const body={expectedVersion:0,displayName:'Private QA alias',visibilityConsent:false};
    assert.equal((await f.request(privatePrefix+'/v1/profile',{method:'PUT',body,headers:{cookie:first.cookie,origin:f.origin,'idempotency-key':key('private-no-csrf')}})).status,403);
    assert.equal((await f.request(privatePrefix+'/v1/profile',{method:'PUT',body,headers:{cookie:second.cookie,origin:f.origin,'x-cj-csrf':csrf,'idempotency-key':key('private-cross-account')}})).status,403);
    assert.equal((await f.request(privatePrefix+'/v1/profile',{method:'PUT',body,headers:{cookie:first.cookie,origin:f.origin,'x-cj-csrf':csrf,'idempotency-key':key('private-profile')}})).status,200);
    assert.equal((await f.request(privatePrefix+'/v1/showcase/works')).status,404);
    await f.restart();assert.equal((await f.request(privatePrefix+'/v1/account/session',{headers:{cookie:first.cookie}})).status,200);
    const recovered=await f.request(privatePrefix+'/v1/account/recover',{body:{accountId:first.account.accountId,recoveryCode:first.recovery,newPassword:'synthetic-private-qa-new-password'},
      headers:{origin:f.origin,'x-account-operation-proof':randomBytes(32).toString('base64url'),'idempotency-key':key('private-recover')}});
    assert.equal(recovered.status,200);assert.equal(recovered.body.account.accountId,first.account.accountId);
    assert.equal((await f.request(privatePrefix+'/v1/account/session',{headers:{cookie:first.cookie}})).status,401);
    assert.equal((await f.request(privatePrefix+'/v1/account/session',{headers:{cookie:second.cookie}})).status,200);
    for(const table of ['opportunity_rounds','opportunity_obligations','earned_work_tasks','earned_work_obligations'])
      assert.equal((await f.sql('SELECT count(*)::int AS n FROM '+table)).rows[0].n,0);
    await hiddenDesk(f);
  });

test('private managed publication matrix: default/invalid config refuses assets independently of live API',async t=>{
  const f=await fixture('live',true,'litespeed','pinned','inherited');t.after(f.close);
  const qualification=await f.qualify();
  for(const [enabled,review] of [[undefined,undefined],['0',undefined],['0','malformed'],
    ['true','review_synthetic_asset_fixture_only'],['','review_synthetic_asset_fixture_only'],
    ['1',undefined],['1',''],['1','malformed'],['1','review_short'],['1','review_synthetic_asset_fixture_only\n']] as const){
    await f.restart({...qualification,CONTRIBUTOR_DESK_ASSETS_ENABLED:enabled,CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF:review});
    assert.equal((await f.request(privatePrefix+'/healthz')).status,200,'page review must not become API admission');
    await hiddenDesk(f);
  }
  await f.restart({...qualification,CONTRIBUTOR_DESK_ASSETS_ENABLED:'1',CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF:'review_synthetic_asset_fixture_only'});
  for(const member of f.manifest.files){const answer=await f.request(member.url);assert.equal(answer.status,200);
    assert.equal(createHash('sha256').update(answer.bytes).digest('hex'),member.sha256);}
  assert.equal((await f.request('/contribute')).status,308);
  assert.equal((await f.request(privatePrefix+'/healthz')).body.publicEnabled,false);
  assert.equal((await f.request(privatePrefix+'/v1/showcase/works')).status,404,'reviewed human assets do not enable public-work reads');
  await f.restart({CONTRIBUTOR_DESK_ASSETS_ENABLED:'0'});await hiddenDesk(f);
  await f.restart({CONTRIBUTOR_JOURNEY_PUBLIC_READS:'1'});
  assert.equal((await f.request(privatePrefix+'/healthz')).status,200);
  assert.equal((await f.request(privatePrefix+'/healthz')).body.publicEnabled,true);
  assert.equal((await f.request(privatePrefix+'/v1/showcase/works')).status,200);
  await hiddenDesk(f);
  await f.restart({CONTRIBUTOR_DESK_ASSETS_ENABLED:'1',CONTRIBUTOR_JOURNEY_PUBLIC_READS:'1',CONTRIBUTOR_JOURNEY_PUBLIC_REVIEW_REF:undefined});
  assert.equal((await f.request(privatePrefix+'/healthz')).status,503,'public-read composition review still required');
  await hiddenDesk(f);
});
