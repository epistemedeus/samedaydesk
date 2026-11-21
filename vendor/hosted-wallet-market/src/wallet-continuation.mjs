// Future binding only. The existing operation journal owns intent/readback;
// quotes, grants, rail journals, allocations and debts are never written here.
import {randomBytes} from 'node:crypto';
import {digest} from './canonical.mjs';
import {recoverPersonalSigner} from './signature.mjs';
import {readAccountCode, readConfiguredChain, readPublicChain} from './chain.mjs';

const SCHEMA='pilot.wallet-continuation.v1';
const TTL_MS=300000;
const address=value=>typeof value==='string' && /^0x[0-9a-f]{40}$/.test(value) && value!=='0x'+'0'.repeat(40);
const refuse=(code,status=409)=>{throw Object.assign(new Error(code),{http:status,codeName:code});};
function exact(body,keys) {
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!keys.includes(k)))refuse('body_refused',400);
}
const messages=intent=>({
  oldMessage:SCHEMA+':release-future-binding:'+digest(intent),
  newMessage:SCHEMA+':accept-future-binding:'+digest(intent),
});

export function createWalletContinuation({profile,currentCapability,now}) {
  function current() {
    // This callback invokes the admitted machine adapter's own current-source
    // check. A legacy route or a saved challenge cannot supply admission.
    const capability=currentCapability();
    if(!capability || capability.origin!==profile.origin || capability.tenant!==profile.tenant ||
       (capability.networkSource && capability.networkSource.chain!==profile.chain))refuse('machine_capability_required');
    return {sourceSha256:capability.sourceSha256,hostSha256:capability.hostSha256,
      profile:capability.profile,money:capability.money,networkIdentityDigest:capability.networkSource?.identityDigest??null};
  }
  async function eoas(oldAddress,newAddress) {
    // Read only, on the configured chain. Contract/7702/smart-wallet authority
    // needs a separately supported protocol, not an EOA recovery fallback.
    if(profile.publicChain)await readPublicChain(profile.rpcUrl,profile.chain);
    else await readConfiguredChain(profile.rpcUrl,profile.chain);
    for(const target of [oldAddress,newAddress]) {
      const code=await readAccountCode(profile.rpcUrl,target);
      if(code!=='0x' && code!=='0x0')refuse('contract_wallet_unsupported');
    }
  }
  const lockedWallet=async(tx,accountId)=>{
    const row=(await tx.query('SELECT address,revocation_epoch FROM hosted_wallet_market.wallets WHERE account_id=$1 FOR UPDATE',[accountId])).rows[0];
    if(!row)refuse('old_wallet_required');
    if(!Number.isSafeInteger(row.revocation_epoch) || row.revocation_epoch>=2147483647)refuse('wallet_epoch_exhausted');
    return row;
  };
  async function challenge(tx,accountId,body,operationKey) {
    exact(body,['address','scheme']);
    if(body.scheme!==undefined && body.scheme!=='eoa-personal-sign')refuse('wallet_scheme_unsupported');
    if(!address(body.address))refuse('address_refused',400);
    const admission=current(),row=await lockedWallet(tx,accountId);
    if(!address(row.address))refuse('old_wallet_required');
    if(row.address===body.address)refuse('replacement_wallet_required');
    await eoas(row.address,body.address);
    if(digest(admission)!==digest(current()))refuse('machine_profile_refused');
    const intent={schema:SCHEMA,scheme:'eoa-personal-sign',origin:profile.origin,tenant:profile.tenant,accountId,network:profile.chain,
      oldAddress:row.address,newAddress:body.address,epoch:row.revocation_epoch,operationKey,
      nonce:randomBytes(32).toString('hex'),expiresAt:new Date(now()+TTL_MS).toISOString(),admission};
    return {value:{schema:SCHEMA,kind:'challenge',intent,challengeDigest:digest(intent),...messages(intent),
      futureBindingOnly:true,obligationsRewritten:false}};
  }
  async function commit(tx,accountId,body) {
    exact(body,['challengeKey','challengeDigest','oldSignature','newSignature']);
    if(typeof body.challengeKey!=='string' || body.challengeKey.length>161 || !/^[0-9a-f]{64}$/.test(body.challengeDigest||''))refuse('wallet_challenge_required');
    if(typeof body.oldSignature!=='string' || !/^0x[0-9a-fA-F]{130}$/.test(body.oldSignature))refuse('old_wallet_control_required');
    if(typeof body.newSignature!=='string' || !/^0x[0-9a-fA-F]{130}$/.test(body.newSignature))refuse('replacement_wallet_control_required');
    const admission=current(),row=await lockedWallet(tx,accountId);
    const saved=(await tx.query(`SELECT principal_id,response_json FROM earned_work_idempotency
      WHERE scope='hosted-wallet-market' AND task_id='' AND key=$1`,[body.challengeKey])).rows[0];
    if(!saved || saved.principal_id!==accountId)refuse('not_found',404);
    const value=saved.response_json?.value,intent=value?.intent;
    if(value?.schema!==SCHEMA || value.kind!=='challenge' || !intent || value.challengeDigest!==body.challengeDigest ||
       digest(intent)!==body.challengeDigest || intent.schema!==SCHEMA || intent.scheme!=='eoa-personal-sign' ||
       intent.operationKey!==body.challengeKey || intent.accountId!==accountId || intent.origin!==profile.origin ||
       intent.tenant!==profile.tenant || intent.network!==profile.chain || intent.oldAddress!==row.address || intent.epoch!==row.revocation_epoch ||
       !address(intent.newAddress) || intent.newAddress===row.address || !/^[0-9a-f]{64}$/.test(intent.nonce||'') ||
       !Number.isFinite(Date.parse(intent.expiresAt)) || Date.parse(intent.expiresAt)<=now() ||
       digest(intent.admission)!==digest(admission))refuse('wallet_continuation_stale');
    const {oldMessage,newMessage}=messages(intent);
    if(recoverPersonalSigner(oldMessage,body.oldSignature.toLowerCase())!==intent.oldAddress)refuse('old_wallet_control_required');
    if(recoverPersonalSigner(newMessage,body.newSignature.toLowerCase())!==intent.newAddress)refuse('replacement_wallet_control_required');
    await eoas(intent.oldAddress,intent.newAddress);
    if(Date.parse(intent.expiresAt)<=now() || digest(admission)!==digest(current()))refuse('wallet_continuation_stale');
    const epoch=row.revocation_epoch+1;
    // The caller's transaction also writes the ordinary operation receipt.
    // Clearing the old proof prevents it from authorizing future work. A new
    // control challenge uses the unchanged machine walletChallenge/walletProve.
    await tx.query(`UPDATE hosted_wallet_market.wallets
      SET address=$2,revocation_epoch=$3,control_epoch=NULL,control_digest=NULL,control_challenge=NULL WHERE account_id=$1`,
      [accountId,intent.newAddress,epoch]);
    return {value:{schema:SCHEMA,kind:'committed',accountId,network:profile.chain,oldAddress:intent.oldAddress,address:intent.newAddress,
      revocationEpoch:epoch,challengeKey:body.challengeKey,challengeDigest:body.challengeDigest,
      futureBindingOnly:true,futureControlRequired:true,obligationsRewritten:false,transferInitiated:false}};
  }
  return {current,challenge,commit};
}
