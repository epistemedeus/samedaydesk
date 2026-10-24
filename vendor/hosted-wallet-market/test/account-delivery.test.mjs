import test from 'node:test';
import assert from 'node:assert/strict';
import {sealSecrets,openSecrets,RECOVERY_TTL_MS} from '../src/seal.mjs';
import {spawnSync} from 'node:child_process';

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

test('ordinary debt administration refuses with its JSON error alone, without loading a journal',()=>{
  const result=spawnSync(process.execPath,['--max-old-space-size=512',new URL('../bin/installed-debt.mjs',import.meta.url).pathname,'inspect'],{env:{PATH:process.env.PATH,UV_THREADPOOL_SIZE:'1',OMP_NUM_THREADS:'1'},encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.deepEqual(JSON.parse(result.stderr),{ok:false,code:'database_refused',secretPrinted:false});
});
