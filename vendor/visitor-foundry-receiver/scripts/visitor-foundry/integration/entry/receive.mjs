import {hash} from '../../capabilities/src/index.mjs';
import {need,exact,contributionProfile} from '../../entry/src/contract.mjs';
import {entryBinding} from './profile.mjs';
import {portablePolicy} from '../src/portable-profile.mjs';

const digest=/^sha256:[a-f0-9]{64}$/;
// Read-only, secret-free operator observation. Neither runtime mismatch nor a
// read performs a migration, installs authority, or replays visitor work.
export async function inspectInstallation(entry,receiver){
 return entry.tx(async c=>{
  const e=(await c.query('SELECT * FROM correspondence_vf10_installation WHERE singleton FOR SHARE')).rows[0];
  const h=(await c.query('SELECT config FROM correspondence_vf12_host WHERE singleton FOR SHARE')).rows[0]?.config;
  need(e&&h,409,'receiving_installation_missing');
  const counts=(await c.query(`SELECT
   (SELECT count(*)::int FROM correspondence_vf10_registrations) registrations,
   (SELECT count(*)::int FROM correspondence_vf12_admissions) admissions,
   (SELECT count(*)::int FROM correspondence_vf04_pools) pools`)).rows[0];
  return {hostConfigId:h.configId,hostSchema:h.schema,entryTermsHash:e.active_profile?.termsHash??null,
   originalTermsHash:e.profile.termsHash,charged:e.charged,maxEnrollments:e.max_enrollments,
   maxAdmissions:h.maxAdmissions,maxPhysical:h.maxPhysical,...counts,
   desiredHostConfigId:receiver.config.configId,allocationMatches:hash(h)===hash(receiver.config)};
 });
}

// No populated v1 migration: its registrations signed the old runtime binding.
// Future v2 execution changes use configureVerification/requestRevalidation.
export async function receiveUnconsumed(entry,receiver,input){
 exact(input,['expectedHostConfigId','expectedEntryTermsHash']);
 need(digest.test(input.expectedHostConfigId)&&digest.test(input.expectedEntryTermsHash),400,'receiving_expected_identity_required');
 const intent={schema:'neomorphic.foundry.allocation-receive.v1',...input,nextHostConfigId:receiver.config.configId};
 const id=hash(intent);
 return entry.tx(async c=>{
  // Entry admission reserves under this same row lock. Nothing can become charged
  // between the zero-work checks and atomic host/profile/receipt readback.
  const e=(await c.query('SELECT * FROM correspondence_vf10_installation WHERE singleton FOR UPDATE')).rows[0];
  const h=(await c.query('SELECT config FROM correspondence_vf12_host WHERE singleton FOR UPDATE')).rows[0]?.config;
  need(e?.active_profile&&h,409,'receiving_installation_missing');
  const next=contributionProfile(e.profile,{id:e.active_profile.profileId,binding:receiver.binding()});
  const old=(await c.query('SELECT record FROM correspondence_vf12_allocation_receipts WHERE id=$1',[id])).rows[0]?.record;
  if(old){
   need(hash(old.intent)===hash(intent)&&hash(h)===hash(old.nextHost)&&hash(e.active_profile)===hash(old.nextEntry)
    &&e.active_receiver_id===receiver.id,409,'receiving_replay_conflict');
   return {id,replayed:true,hostConfigId:h.configId,entryTermsHash:e.active_profile.termsHash,charged:e.charged};
  }
  need(h.configId===input.expectedHostConfigId&&e.active_profile.termsHash===input.expectedEntryTermsHash,409,'receiving_identity_conflict');
  need(e.receiver_id==='disabled'&&e.active_receiver_id===receiver.id,409,'receiving_receiver_conflict');
  need(h.schema==='neomorphic.foundry.entry-host-profile.v1'&&digest.test(h.runtimePin)&&digest.test(h.environmentDigest),409,'receiving_legacy_profile_required');
  // Reconstruct the entire canonical v1 body using ONLY its old execution pins.
  // Any changed authority, cap, evaluator, terms or extra field fails equality.
  const {configId:nextId,...allocation}=receiver.config;
  const legacyBody={...allocation,schema:h.schema,runtimePin:h.runtimePin,environmentDigest:h.environmentDigest};
  const legacy={...legacyBody,configId:hash(legacyBody)};
  need(hash(h)===hash(legacy)&&hash(e.active_profile)===hash(contributionProfile(e.profile,{id:next.profileId,binding:entryBinding(h)})),409,'receiving_authority_conflict');
  const counts=(await c.query(`SELECT
   (SELECT count(*)::int FROM correspondence_vf10_registrations) registrations,
   (SELECT count(*)::int FROM correspondence_vf12_admissions) admissions,
   (SELECT count(*)::int FROM correspondence_vf04_pools) pools`)).rows[0];
  need(e.charged===0&&Object.values(counts).every(n=>n===0),409,'receiving_populated_cohort_requires_reconciliation');
  const p=portablePolicy();
  const record={intent,originalInstallation:e,previousHost:h,previousEntry:e.active_profile,
   nextHost:receiver.config,nextEntry:next,executionObservation:{runtimePin:p.runtimePin,environmentDigest:p.environmentDigest},counts,
   evidenceTrusted:false,visitorWorkReplayed:false};
  await c.query('UPDATE correspondence_vf12_host SET config=$1 WHERE singleton',[receiver.config]);
  await c.query('UPDATE correspondence_vf10_installation SET active_profile=$1 WHERE singleton',[next]);
  await c.query('INSERT INTO correspondence_vf12_allocation_receipts(id,record) VALUES($1,$2)',[id,record]);
  const check=(await c.query('SELECT i.*,h.config AS host FROM correspondence_vf10_installation i CROSS JOIN correspondence_vf12_host h WHERE i.singleton AND h.singleton')).rows[0];
  const {active_profile:beforeActive,...before}=e,{active_profile:afterActive,host,...after}=check;
  need(hash(before)===hash(after)&&hash(afterActive)===hash(next)&&hash(host)===hash(receiver.config),500,'receiving_atomic_readback_failed');
  return {id,replayed:false,hostConfigId:host.configId,entryTermsHash:afterActive.termsHash,charged:check.charged};
 });
}
