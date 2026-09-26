// Deterministic public conformance vectors. Synthetic data, no credentials.
import { hash, refOf, createGap } from '../../capabilities/src/index.mjs';
import { version, request, snapshot, options } from '../../capabilities/examples/fixtures.mjs';
import { identity, toValidationIdentity, toGapBinding, ports } from '../src/wire.mjs';
const max = (prefix,unit) => prefix+unit.repeat(Math.floor((512-prefix.length)/unit.length))+'x'.repeat((512-prefix.length)%unit.length);
export function vectors() {
  const dependencies=Array.from({length:100},(_,i)=>refOf(version({capabilityId:max(`fixture:D${i}-`,i%2?'界':'🧪'),version:max('v+?= /','🧬')})));
  const target=version({capabilityId:max('fixture:T-','界'),version:max('v+?= /','🧬'),dependencies});
  const original=identity(target,dependencies),s=snapshot([]);
  const gap=createGap(s,request({taskId:max('task:','界'),outcome:'genuine-gap'}),options(s),{
    gapId:max('gap:','🧪'),reproducer:{ref:max('synthetic:','界'),permission:'synthetic'},funding:{kind:'voluntary',ref:null}});
  return {ports,maximum:{manifest:target,identity:original,binding:toValidationIdentity(original)},
    gap:toGapBinding(gap,{uri:'https://fixtures.invalid/max-gap',digest:hash('max-gap')}),
    conflictingTarget:{...original.target,contentId:hash('same coordinate different content')},
    malformed:{overlong:{...original.target,version:original.target.version+'x'},
      duplicateDependencies:[dependencies[0],dependencies[0]]}};
}
