import {loadContributorDeskAssets} from '../lib/contributor-desk-assets.js';

try{
  const {manifest}=await loadContributorDeskAssets(process.env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT);
  process.stdout.write(JSON.stringify({schema:'neomorphic.contributor-desk.install-artifact.v1',
    artifactsVerified:true,sourceCommit:manifest.sourceCommit,deskMembers:manifest.files.length,
    deskPath:manifest.placement.deskPath,assetPrefix:manifest.placement.assetPrefix,apiPath:manifest.apiPath,
    enrollmentPerformed:false,publicEnabled:false,releaseAccepted:false})+'\n');
}catch{
  process.stderr.write('managed contributor artifact refused; verify exact source, both manifests and host lock/dependencies\n');
  process.exitCode=1;
}
