import {installation as portableInstallation} from '../../execution/src/supervisor.mjs';
import {PORTABLE_KIND,portableVerification} from './portable-profile.mjs';
// Installed authority only. No visitor route accepts policy, runtime or source.
import {digest,requireThat as need,jsonBounded} from '../../validation/src/index.mjs';
import {runtimePin,environmentDigest,evaluator,requiredChecks,SOURCE_PIN,sourcePinsMatch,installationPins,SOURCE_PROBE_DIGEST} from './recipe.mjs';
export const MAX_GENERATIONS=4;
export function verificationFor(config,{revision=config.policies[0].revision,validityMs=3600000}={}) {
  if(config.kind===PORTABLE_KIND)return portableVerification(config,{revision,validityMs});
  need(sourcePinsMatch(installationPins),'installed_source_changed');
  need(typeof revision==='string'&&revision.length>0&&revision.length<=256,'invalid_policy_revision');
  need(Number.isInteger(validityMs)&&validityMs>=100&&validityMs<=3600000,'invalid_evidence_validity');
  const policy={...config.policies[0],revision,evaluator,environmentDigest,requiredChecks};
  const body={schema:'neomorphic.foundry.verification-generation-policy.v1',projectId:config.scope.slice(8),
    sourceRevision:SOURCE_PIN,sourceDigest:SOURCE_PROBE_DIGEST,runtimePin,policy,validityMs};
  return {...body,id:digest(body)};
}
export function checkInstalledVerification(profile,config) {
  jsonBounded(profile);
  if(config.kind===PORTABLE_KIND)need(profile?.runtimePin===portableInstallation().runtimePin,'installed_verification_changed');
  need(profile&&digest(profile)===digest(verificationFor(config,{revision:profile.policy?.revision,validityMs:profile.validityMs})),
    'installed_verification_changed');
  return profile;
}
