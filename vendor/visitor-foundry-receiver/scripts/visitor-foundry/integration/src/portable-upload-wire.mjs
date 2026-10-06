// Transport declaration only: decode before the unchanged portableArtifact validator/journal.
import {portableArtifact} from './portable-profile.mjs';
import {ensurePostgresJson} from './wire.mjs';
import {createHash} from 'node:crypto';
import {requireThat as need,canonical,jsonBounded} from '../../validation/src/index.mjs';
export const LEGACY_COMPONENT_WIRE='neomorphic.foundry.portable-component-wire.v1';
export const COMPONENT_WIRE='neomorphic.foundry.portable-component-wire.v2';
export const COMPONENT_ENCODING='base64-utf8-canonical-json';
export const MAX_COMPONENT_BYTES=392000,MAX_COMPONENT_REQUEST_BYTES=524288;
export const COMPONENT_TRANSPORT=Object.freeze({schema:COMPONENT_WIRE,encoding:COMPONENT_ENCODING,maxArtifactBytes:MAX_COMPONENT_BYTES,maxRequestBytes:MAX_COMPONENT_REQUEST_BYTES,legacySchemas:Object.freeze([LEGACY_COMPONENT_WIRE])});
const sha=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function decodeBase64(value,maxBytes,code) {
 need(typeof value==='string' && value.length<=4*Math.ceil(maxBytes/3),code);
 const bytes=Buffer.from(value,'base64');
 need(bytes.length<=maxBytes && bytes.toString('base64')===value,code);
 return bytes;
}
function decodeUtf8(bytes,code) {
 let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{need(false,code);}
 need(Buffer.from(text).equals(bytes),code);return text;
}
export function decodeComponent(artifact) {
 if(!artifact || typeof artifact!=='object' || !Object.hasOwn(artifact,'schema'))return artifact; // legacy
 if(artifact.schema===COMPONENT_WIRE){
  need(Object.keys(artifact).sort().join(',')==='digest,encoding,payloadBase64,schema' && artifact.encoding===COMPONENT_ENCODING,'invalid_component_wire');
  need(typeof artifact.digest==='string' && /^sha256:[a-f0-9]{64}$/.test(artifact.digest),'invalid_component_digest');
  const bytes=decodeBase64(artifact.payloadBase64,MAX_COMPONENT_BYTES,'invalid_component_encoding');
  need(sha(bytes)===artifact.digest,'component_digest_mismatch');
  const text=decodeUtf8(bytes,'invalid_component_encoding');let decoded;
  try{decoded=JSON.parse(text);}catch{need(false,'invalid_component_encoding');}
  decoded=jsonBounded(decoded,MAX_COMPONENT_BYTES);
  need(canonical(decoded)===text,'invalid_component_encoding');
  // Exactly one layer. Nested envelopes are not canonical artifacts.
  need(decoded && typeof decoded==='object' && !Array.isArray(decoded) && !Object.hasOwn(decoded,'schema'),'invalid_portable_package');
  return decoded;
 }
 need(Object.keys(artifact).sort().join(',')==='descriptor,kind,moduleBase64,schema,sourceBase64' && artifact.schema===LEGACY_COMPONENT_WIRE,'invalid_component_wire');
 const sourceText=decodeUtf8(decodeBase64(artifact.sourceBase64,32768,'invalid_source_encoding'),'invalid_source_encoding');
 return {kind:artifact.kind,descriptor:artifact.descriptor,moduleBase64:artifact.moduleBase64,sourceText};
}
export function encodeComponent(artifact,advertisement) {
 if(advertisement?.schema===COMPONENT_WIRE){
  need(advertisement.encoding===COMPONENT_ENCODING,'invalid_component_wire');
  need(typeof artifact?.sourceText==='string','invalid_source_encoding');
  const source=Buffer.from(artifact.sourceText,'utf8');
  need(source.length<=32768 && source.toString('utf8')===artifact.sourceText,'invalid_source_encoding');
  const text=canonical(jsonBounded(artifact,MAX_COMPONENT_BYTES)),bytes=Buffer.from(text,'utf8');
  need(bytes.toString('utf8')===text,'invalid_component_encoding');
  return {schema:COMPONENT_WIRE,encoding:COMPONENT_ENCODING,digest:sha(bytes),payloadBase64:bytes.toString('base64')};
 }
 if(advertisement==null)return artifact; // explicitly supported pre-declaration legacy host
 need(advertisement.schema===LEGACY_COMPONENT_WIRE && advertisement.sourceEncoding==='base64-utf8' && advertisement.moduleEncoding==='base64','invalid_component_wire');
 need(typeof artifact.sourceText==='string','invalid_source_encoding');
 const bytes=Buffer.from(artifact.sourceText,'utf8');
 need(bytes.length<=32768 && bytes.toString('utf8')===artifact.sourceText,'invalid_source_encoding');
 return {schema:LEGACY_COMPONENT_WIRE,kind:artifact.kind,descriptor:artifact.descriptor,moduleBase64:artifact.moduleBase64,sourceBase64:bytes.toString('base64')};
}
export function decodeComponentRequest(raw) {
 need(raw && typeof raw==='object' && !Array.isArray(raw),'invalid_participation_input');
 const full=raw?.artifact?.schema===COMPONENT_WIRE;
 const body=jsonBounded(raw,full?MAX_COMPONENT_REQUEST_BYTES:490000);
 need(Object.keys(body).sort().join(',')==='artifact,termsVersion','invalid_participation_input');
 body.artifact=decodeComponent(body.artifact);
 return jsonBounded(body,490000); // unchanged decoded request/journal ceiling
}
export function componentRequest(body,advertisement) {
 const decoded=decodeComponentRequest(body);
 const encoded={...decoded,artifact:encodeComponent(decoded.artifact,advertisement)};
 jsonBounded(encoded,encoded.artifact?.schema===COMPONENT_WIRE?MAX_COMPONENT_REQUEST_BYTES:490000);
 need(canonical(decodeComponentRequest(encoded))===canonical(decoded),'component_digest_mismatch');
 return encoded;
}

// Shared protocol parser. All portable validation stays mandatory before auth/journaling.
export function parseComponentRequest(raw) {
 const body=decodeComponentRequest(raw);body.artifact=portableArtifact(body.artifact);ensurePostgresJson(body);return body;
}
