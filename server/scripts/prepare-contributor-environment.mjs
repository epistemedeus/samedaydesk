import {prepareContributorEnvironment,readPrivateJson,writePrivateJson} from '../lib/contributor-environment-packet.js';

try{
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){
    if(!['--existing','--listed','--overlay','--install','--rollback'].includes(args[i])||!args[i+1]||options[args[i]])
      throw new Error('arguments refused');
    options[args[i]]=args[i+1];
  }
  if(Object.keys(options).length!==5)throw new Error('complete private packet paths required');
  const result=prepareContributorEnvironment({existing:await readPrivateJson(options['--existing']),
    listed:await readPrivateJson(options['--listed']),overlay:await readPrivateJson(options['--overlay'])});
  // Preserve the original full set before writing a candidate replacement.
  await writePrivateJson(options['--rollback'],result.rollback);
  await writePrivateJson(options['--install'],result.install);
  process.stdout.write(JSON.stringify(result.receipt)+'\n');
}catch{
  process.stderr.write('contributor environment packet refused; verify owner-only authoritative values, key coverage, masks and disabled flags\n');
  process.exitCode=1;
}
