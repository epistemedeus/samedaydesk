import {WorkCellError} from '../../../../services/correspondence/dist/visitor-work-cells/contracts.js';
import { createRequire } from 'node:module';
import { FoundryError } from '../../validation/src/index.mjs';
import { UnsupportedWire } from './wire.mjs';
import { IntegrationError } from '../../../../services/correspondence/dist/visitor-foundry/boundary.js';
import {COMPONENT_WIRE,parseComponentRequest} from './portable-upload-wire.mjs';
const require = createRequire(new URL('../../../../services/correspondence/package.json', import.meta.url));
const { Router } = require('express');
export function createIntegrationRouter(store) {
  const router = Router(); const base = '/v1/projects/:projectId/foundry';
  const ctx = req => ({ projectId: req.params.projectId, token: req.header('authorization')?.replace(/^Bearer /, '') ?? '' });
  router.use(parseComponentInput);
  for (const [path, method] of [['withdraw','withdraw'], ['task','task'], ['components','uploadComponent'], ['participation','participate'], ['resolve','resolve'], ['gap','gap'], ['candidates','admit'], ['invoke','invoke'], ['observe','observe'], ['decline','decline'], ['environment-evidence','submitEnvironmentEvidence']]) {
    router.post(`${base}/${path}`, async (req, res) => res.json(await store[method](ctx(req), req.body, req.header('idempotency-key'))));
  }
  router.get(`${base}/participation/terms`,async(req,res)=>res.json(await store.participationTerms(ctx(req))));
  router.get(`${base}/participation/cells/:cellId`,async(req,res)=>res.json(await store.participationRead(ctx(req),req.params.cellId)));
  router.get(`${base}/environment-evidence`, async (req,res)=>res.json(await store.environmentEvidence(ctx(req))));
  router.get(`${base}/status`, async (req, res) => res.json(await store.status(ctx(req))));
  router.use(integrationFailure);
  return router;
}

export function integrationFailure(error, _req, res, _next) {
    if(error instanceof UnsupportedWire)return res.status(422).json(error.result);
    const vf01 = ['INVALID_INPUT','LIMIT_EXCEEDED','CONTENT_MISMATCH','TARGET_MISMATCH','NOT_A_GAP','COORDINATE_CONTENT_CONFLICT','IDENTITY_BINDING_MISMATCH'].includes(error.code);
    const expected = error instanceof IntegrationError || error instanceof WorkCellError || error instanceof FoundryError || vf01;
    res.status(expected ? error.status ?? (vf01 ? 400 : 409) : 503).json({ error: { code: expected ? error.code : 'outcome_unknown',
      nextAction: expected ? error.nextAction ?? 'Correct the bounded request; authority fields are supplied only by the host.' : 'Reconcile the same command; an unavailable acknowledgement does not prove rollback.' } });
}

// Protocol parsing at the existing route, also mounted after base parser/rate limits
// and before entry grant lookups. Valid requests still traverse all authority gates.
export function parseComponentInput(req,res,next) {
 if(req.method!=='POST' || !/^\/v1\/projects\/[^/]+\/foundry\/components\/?$/i.test(req.path))return next();
 res.set('x-foundry-component-wire',COMPONENT_WIRE);
 try{req.body=parseComponentRequest(req.body);next();}catch(error){integrationFailure(error,req,res,next);}
}
