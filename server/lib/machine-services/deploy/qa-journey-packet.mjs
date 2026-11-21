#!/usr/bin/env node
// Explicit QA journey install packet. The enrollment default still grants only
// lockfile.delta and http.capture. This packet does not infer url.extract from
// that overlay. Root supplies the credential hash and the URL-extraction binding
// as private files; this module never reads a live URL.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readPrivateJson, writePrivateJson } from '../../contributor-environment-packet.js';
import { EXTRACTION_SCHEMA } from '../extraction.mjs';
import { validate } from '../../../vendor/machine-gateway/src/schemas.mjs';

export const QA_TENANT_ID = 'owner-qa-243001';
export const QA_FREE_URL_ROUTES = Object.freeze(['url.extract.submit', 'url.extract.poll', 'url.extract.result']);
export const QA_URL_BINDING = Object.freeze({
  schema: EXTRACTION_SCHEMA,
  tenantId: 'sds-u2',
  actorId: 'sds-gateway',
});
const QA_MAX_CALLS = 40;
const INITIAL_OVERLAY_ROUTES = Object.freeze(['lockfile.delta', 'http.capture']);

function coded(code) {
  return Object.assign(new Error(code), { code });
}

function sameList(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index]);
}

export function qaJourneyInstall({ tenantId, tokenSha256, routes, binding, maxUnits = 0 } = {}) {
  if (tenantId !== QA_TENANT_ID) throw coded('qa_tenant_refused');
  if (maxUnits !== 0) throw coded('qa_free_route_refused');
  if (!Array.isArray(routes) || routes.length === 0) throw coded('qa_url_routes_refused');
  if (sameList(routes, INITIAL_OVERLAY_ROUTES) || !sameList(routes, QA_FREE_URL_ROUTES)) throw coded('qa_url_routes_refused');
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) throw coded('url_extract_binding_missing');
  const keys = Object.keys(binding);
  if (keys.length !== 3 || !keys.every(key => ['schema', 'tenantId', 'actorId'].includes(key)) ||
      binding.schema !== QA_URL_BINDING.schema || binding.tenantId !== QA_URL_BINDING.tenantId ||
      binding.actorId !== QA_URL_BINDING.actorId) throw coded('qa_url_binding_refused');
  if (typeof tokenSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(tokenSha256)) throw coded('qa_credential_hash_refused');
  const tenants = {
    tenants: [{
      id: QA_TENANT_ID,
      tokenSha256,
      routes: [...QA_FREE_URL_ROUTES],
      maxUnits: 0,
      maxCalls: QA_MAX_CALLS,
      maxConcurrent: 1,
    }],
  };
  validate('tenantConfig', tenants);
  const bindingValue = { schema: QA_URL_BINDING.schema, tenantId: QA_URL_BINDING.tenantId, actorId: QA_URL_BINDING.actorId };
  return {
    tenants,
    binding: bindingValue,
    overlay: {
      env_vars: [
        { key: 'MACHINE_GATEWAY_TENANTS_JSON', value: JSON.stringify(tenants) },
        { key: 'MACHINE_GATEWAY_URL_EXTRACT_JSON', value: JSON.stringify(bindingValue) },
      ],
    },
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? '' : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw coded('qa_journey_packet_arguments_refused');
  return value;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const binding = await readPrivateJson(argument('--binding'));
    const credential = await readPrivateJson(argument('--token-sha-file'));
    const packet = qaJourneyInstall({
      tenantId: QA_TENANT_ID,
      tokenSha256: credential?.tokenSha256,
      routes: [...QA_FREE_URL_ROUTES],
      binding,
    });
    const output = argument('--overlay');
    await writePrivateJson(output, packet.overlay);
    process.stdout.write(`${JSON.stringify({
      schema: 'sds.qa-journey-install.v1',
      tenantId: QA_TENANT_ID,
      routes: [...QA_FREE_URL_ROUTES],
      maxUnits: 0,
      bindingSupplied: true,
      sent: false,
    })}\n`);
  } catch (error) {
    const known = new Set([
      'qa_tenant_refused', 'qa_free_route_refused', 'qa_url_routes_refused', 'url_extract_binding_missing',
      'qa_url_binding_refused', 'qa_credential_hash_refused', 'qa_journey_packet_arguments_refused',
    ]);
    process.stderr.write(`${known.has(error?.code) ? error.code : 'qa_journey_packet_refused'}\n`);
    process.exitCode = 1;
  }
}
