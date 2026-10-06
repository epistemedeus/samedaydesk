// Transport declaration only: decode before the unchanged portableArtifact validator/journal.
import {requireThat as need} from '../../validation/src/index.mjs';
export const COMPONENT_WIRE='neomorphic.foundry.portable-component-wire.v1';
export const COMPONENT_TRANSPORT=Object.freeze({schema:COMPONENT_WIRE,sourceEncoding:'base64-utf8',moduleEncoding:'base64',maxSourceBytes:32768,maxRequestBytes:490000});
export function decodeComponent(artifact) {
 if(!artifact || typeof artifact!=='object' || !Object.hasOwn(artifact,'schema'))return artifact; // legacy
 need(Object.keys(artifact).sort().join(',')==='descriptor,kind,moduleBase64,schema,sourceBase64' && artifact.schema===COMPONENT_WIRE,'invalid_component_wire');
 need(typeof artifact.sourceBase64==='string' && artifact.sourceBase64.length<=43692,'invalid_source_encoding');
 const bytes=Buffer.from(artifact.sourceBase64,'base64');
 need(bytes.length<=32768 && bytes.toString('base64')===artifact.sourceBase64,'invalid_source_encoding');
 let sourceText;try{sourceText=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{need(false,'invalid_source_encoding');}
 need(Buffer.from(sourceText).equals(bytes),'invalid_source_encoding');
 return {kind:artifact.kind,descriptor:artifact.descriptor,moduleBase64:artifact.moduleBase64,sourceText};
}
export function encodeComponent(artifact,advertisement) {
 if(advertisement?.schema!==COMPONENT_WIRE || advertisement.sourceEncoding!=='base64-utf8' || advertisement.moduleEncoding!=='base64')return artifact;
 need(typeof artifact.sourceText==='string','invalid_source_encoding');
 const bytes=Buffer.from(artifact.sourceText,'utf8');
 need(bytes.length<=32768 && bytes.toString('utf8')===artifact.sourceText,'invalid_source_encoding');
 return {schema:COMPONENT_WIRE,kind:artifact.kind,descriptor:artifact.descriptor,moduleBase64:artifact.moduleBase64,sourceBase64:bytes.toString('base64')};
}
