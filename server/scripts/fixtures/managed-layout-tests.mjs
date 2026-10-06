// Reuse the received missing-utilities VM harness. No parent runtime mutation,
// production environment, skipped acceptance, profile change or alternate engine.
import {withoutHostUtilities} from '../../foundry/activation/receiving-100502/namespace.mjs';
import {materializeReferenceRuntime} from '../../foundry/materialize-runtime.mjs';
import {runBounded} from '../../foundry/bounded-child.mjs';
const testFile=(process.argv[2]==='--inside'?process.argv[3]:process.argv[2])??'server/scripts/test-foundry-private-pass.js';
if(!['server/scripts/test-foundry-private-pass.js','server/scripts/test-foundry-contribution-transport.js'].includes(testFile))throw new Error('managed_test_selection_invalid');
if(process.argv[2]==='--inside'){
 try{
  await materializeReferenceRuntime({deployable:true,tarball:process.env.FOUNDRY_CPYTHON_TARBALL});
  const result=await runBounded(process.execPath,['--test','--test-concurrency=1',testFile],{
   env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C',LC_ALL:'C'},capture:true,stdoutLimit:2000000,outputLimit:4000000,timeoutMs:180000});
  process.stdout.write(result.stdout);if(result.reason)process.stderr.write('managed_test_bounded_failure\n');process.exitCode=result.reason?1:result.code??1;
 }catch{process.stderr.write('managed_test_setup_failed\n');process.exitCode=1;}
}else{
 const result=await withoutHostUtilities(['server/scripts/fixtures/managed-layout-tests.mjs','--inside',testFile],{fresh:true,timeoutMs:240000});
 process.stdout.write(result.stdout);if(result.reason)process.stderr.write('managed_test_bounded_failure\n');process.exitCode=result.reason?1:result.code??1;
}
