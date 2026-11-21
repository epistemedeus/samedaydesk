import {issueContributorHttpsQualification,readContributorEdgeIdentity} from '../lib/contributor-https-qualification.js';
import {readPrivateJson,writePrivateJson} from '../lib/contributor-environment-packet.js';

try{
  const [action,input,output]=process.argv.slice(2);
  if(action==='inspect'&&!input){
    const identity=await readContributorEdgeIdentity(process.env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT);
    process.stdout.write(JSON.stringify({schema:'sds.contributor-edge-identity.v1',...identity,
      providerReceived:false,qualificationIssued:false,publicEnabled:false})+'\n');
  }else if(action==='issue'&&input&&output&&process.argv.length===5){
    const {qualification,payload}=await issueContributorHttpsQualification(await readPrivateJson(input),process.env);
    await writePrivateJson(output,{env_vars:[{key:'CONTRIBUTOR_DESK_INGRESS_MODE',value:'litespeed-https-only'},
      {key:'CONTRIBUTOR_DESK_TRUSTED_PROXY_IPS',value:'[]'},
      {key:'CONTRIBUTOR_DESK_INSTALLATION_ID',value:payload.binding.installationId},
      {key:'CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT',value:payload.binding.sdsCommit},
      {key:'CONTRIBUTOR_DESK_HTTPS_QUALIFICATION',value:qualification}]});
    process.stdout.write(JSON.stringify({schema:'sds.contributor-https-qualification-issued.v2',
      qualificationIssued:true,sourceCommit:payload.binding.productCommit,sdsCommit:payload.binding.sdsCommit,
      lifecycle:payload.lifecycle,issuedAt:payload.issuedAt,sent:false,publicEnabled:false,releaseAccepted:false})+'\n');
  }else throw new Error('invalid usage');
}catch{
  process.stderr.write('HTTPS-only qualification refused; use inspect or issue PRIVATE_RECEIVING_JSON NEW_PRIVATE_OVERLAY_JSON with exact sources, fresh full controller receiving and existing stable credentials; no provider call is made\n');
  process.exitCode=1;
}
