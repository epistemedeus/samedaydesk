import {hash} from '../../capabilities/src/index.mjs';
import {portableArtifact} from '../src/portable-profile.mjs';
import {decodeComponent} from '../src/portable-upload-wire.mjs';
import {identity} from '../src/wire.mjs';
import {failure} from './transport.mjs';
export function uploadIntent(artifact,terms) {
 return {schema:'neomorphic.foundry.component-upload-intent.v1',key:`upload:${artifact.descriptor.id}`,body:{artifact,termsVersion:terms.id}};
}
export function checkUploadIntent(intent,artifact,termsId) {
 if(!intent || Object.keys(intent).sort().join(',')!=='body,key,schema' || intent.schema!=='neomorphic.foundry.component-upload-intent.v1'
  || !intent.body || Object.keys(intent.body).sort().join(',')!=='artifact,termsVersion' || intent.body.termsVersion!==termsId
  || intent.key!==`upload:${artifact.descriptor.id}` || hash(portableArtifact(decodeComponent(intent.body.artifact)))!==hash(artifact))throw failure('local_intent_mismatch');
 return intent;
}
export function checkUploadReceipt(result,artifact) {
 const expected={componentRef:{uri:`https://foundry.invalid/approved/${artifact.descriptor.id.slice(7)}`,digest:artifact.descriptor.id},
  identity:identity(artifact.descriptor.capability),bytes:Buffer.from(artifact.moduleBase64,'base64').length};
 if(!result || typeof result!=='object' || typeof result.replayed!=='boolean')throw failure('upload_receipt_invalid');
 const {replayed,...body}=result;
 if(hash(body)!==hash(expected))throw failure('upload_receipt_invalid');
 return result;
}
export async function upload(client,artifact,terms,{loadIntent,persistIntent}) {
 const saved=await loadIntent('upload');const intent=saved?checkUploadIntent(saved,artifact,terms.id):uploadIntent(artifact,terms);
 await persistIntent('upload',intent);
 const receipt=await loadIntent('upload-receipt');if(receipt)return checkUploadReceipt(receipt,artifact);
 if(await loadIntent('upload-started'))throw failure('upload_outcome_unknown');
 // Durable before sending; every failure requires explicit same-intent reconciliation.
 await persistIntent('upload-started',{intentDigest:hash(intent)});
 const result=checkUploadReceipt(await client.submitComponent(intent,terms),artifact);
 await persistIntent('upload-receipt',result);return result;
}
