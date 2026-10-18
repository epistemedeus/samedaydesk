import test from 'node:test';
import assert from 'node:assert/strict';
import {sealSecrets,openSecrets,RECOVERY_TTL_MS} from '../src/seal.mjs';

test('cookie-only login delivery, recovery delivery, tamper and expiry use the same authenticated seal',()=>{
  const key='ab'.repeat(32),now=Date.now(),cookie='__Host-neo_contributor=fixture-only';
  for(const value of [{cookie},{cookie,recoveryCode:'fixture-recovery'}]){
    const sealed=sealSecrets(key,value,now);assert.deepEqual(openSecrets(key,sealed,now),value);
    assert.equal(openSecrets(key,{...sealed,tag:'AA'},now),null);
    assert.equal(openSecrets(key,sealed,now+RECOVERY_TTL_MS),null);
    assert.equal(openSecrets('cd'.repeat(32),sealed,now),null);
  }
  for(const invalid of [{cookie,recoveryCode:4},{recoveryCode:'fixture'}])assert.equal(openSecrets(key,sealSecrets(key,invalid,now),now),null);
});
