import {fileURLToPath} from 'node:url';
import {verifyContributorRuntime} from '../lib/contributor-artifact.js';

const root=new URL('../../vendor/neomorphic-contributor-journey/',import.meta.url),action=process.argv[2];
if(!['migrate','enroll','inspect'].includes(action))throw new Error('usage: node --env-file=/private/stable.env server/scripts/enroll-contributor-journey.mjs migrate|enroll|inspect');
try{
  const expected=process.env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT;
  if(!/^[a-f0-9]{40}$/.test(expected??''))throw new Error('exact source required');
  await verifyContributorRuntime(fileURLToPath(root),expected);
  const service=await import(new URL('services/contributor-journey/dist/index.js',root));
  if(action==='inspect'){
    const runtime=await service.createJourneyRuntime();
    try{
      if(!runtime.installed)throw new Error('installed profile disabled');
      await runtime.installed.admission.checkReady();
      process.stdout.write(JSON.stringify({ready:true,profile:runtime.config.mode,sourceCommit:expected,
        publicReadsConfigured:runtime.config.installed.publicReads===true,publicEnabled:false,releaseAccepted:false,settlement:'not_configured'})+'\n');
    }finally{await runtime.close();}
  }else process.stdout.write(JSON.stringify({sourceCommit:expected,...await service.prepareJourneyDeployment({enroll:action==='enroll'})})+'\n');
}catch{
  process.stderr.write('contributor enrollment refused; verify artifact, exact selected profile, existing sources and stable store/origin/keys\n');
  process.exitCode=1;
}
