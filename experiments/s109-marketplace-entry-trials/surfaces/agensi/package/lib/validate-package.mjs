/**
 * Offline Agensi package validator.
 * No Cloudflare Access, no listing, no spend, no $ref fetch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { validateJsonSchema } from './json-schema.mjs';

export const PIN = 'epistemedeus/x402-data-gateway-skills@82d0f019713c7223898806144da08fdbeed5c666';
export const PIN_SHA = '82d0f019713c7223898806144da08fdbeed5c666';
export const FORBIDDEN_FLAGS = [
  '--list',
  '--publish',
  '--sell',
  '--buy',
  '--signup',
  '--auth',
  '--login',
  '--access',
];

const EXPECTED_RECIPES = [
  'samedaydesk-machine-commerce',
  'company-enrich',
  'wallet-enrich',
  'web-extract',
  'repo-security-scan',
  'schema-generate',
  'deep-audit',
  'morpho-risk',
  'opportunity-preflight',
  'agent-discoverability-audit',
  'payment-offer-preflight',
  'contract-qualified-search',
  'agent-surface-budget-audit',
  'settlement-proof',
  'transaction-receipt',
  'wallet-policy-safety',
];

export function refuseForbiddenArgs(argv) {
  const hit = argv.find((a) => FORBIDDEN_FLAGS.includes(a));
  if (!hit) return null;
  return {
    ok: false,
    cashBoundaryUsd: 0,
    error: `Refusing ${hit}. This package is offline schema validation only; it does not list, authenticate, or spend.`,
  };
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function pushErrors(into, prefix, result) {
  for (const e of result.errors) {
    into.push(`${prefix}${e.path}: ${e.message}`);
  }
}

export function validateAgensiPackage(pkgDir, options = {}) {
  const errors = [];
  const descriptorPath = path.resolve(
    options.descriptorPath || path.join(pkgDir, 'offer-descriptor.json'),
  );
  const schemaPath = path.resolve(
    options.schemaPath || path.join(pkgDir, 'offer-descriptor.schema.json'),
  );
  const baseDir = path.dirname(descriptorPath);

  let schema;
  let descriptor;
  try {
    schema = readJson(schemaPath);
  } catch (e) {
    return fail(`cannot read schema ${schemaPath}: ${e.message}`);
  }
  try {
    descriptor = readJson(descriptorPath);
  } catch (e) {
    return fail(`cannot read descriptor ${descriptorPath}: ${e.message}`);
  }

  pushErrors(errors, 'descriptor ', validateJsonSchema(descriptor, schema, { root: schema }));

  const checklistPath = path.resolve(
    baseDir,
    descriptor.listingChecklistPath || './listing-checklist.json',
  );
  const handoffPath = path.resolve(
    baseDir,
    descriptor.accessHandoffPath || './access-handoff.json',
  );

  let checklist;
  let handoff;
  try {
    checklist = readJson(checklistPath);
  } catch (e) {
    errors.push(`cannot read listing checklist ${checklistPath}: ${e.message}`);
  }
  try {
    handoff = readJson(handoffPath);
  } catch (e) {
    errors.push(`cannot read access handoff ${handoffPath}: ${e.message}`);
  }

  if (checklist) {
    pushErrors(
      errors,
      'listingChecklist ',
      validateJsonSchema(checklist, schema.$defs.listingChecklist, { root: schema }),
    );
  }
  if (handoff) {
    pushErrors(
      errors,
      'accessHandoff ',
      validateJsonSchema(handoff, schema.$defs.accessHandoff, { root: schema }),
    );
  }

  semanticChecks(errors, descriptor, checklist, handoff);

  const ok = errors.length === 0;
  const report = {
    ok,
    cashBoundaryUsd: 0,
    offline: true,
    networkCalls: 0,
    publicListingSupported: false,
    claimsProprietaryOwnershipOfFreeRecipes: false,
    skillRecipePin: descriptor.skillRecipePin || null,
    schemaPath: rel(schemaPath),
    descriptorPath: rel(descriptorPath),
    listingChecklistPath: rel(checklistPath),
    accessHandoffPath: rel(handoffPath),
    listingChecklistItems: checklist?.items?.length ?? 0,
    accessHandoffSteps: handoff?.steps?.length ?? 0,
    referencedPublicRecipes: descriptor.referencedPublicRecipes?.length ?? 0,
    listingChecklist: (checklist?.items || []).map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      actor: i.actor,
    })),
    publicListingNote:
      'Anonymous worker cannot complete /sell; Root must finish Cloudflare Access (GitHub) on www.agensi.dev and/or an agensi.io creator session, then paste verified payout-method state before any listing copy goes public. This package will not list.',
    nextMeasurableEvent:
      descriptor.nextMeasurableEvent ||
      'Root CF Access session + paste of sell-page payout section',
    authenticatedStepNeeded: true,
    errors,
  };
  return report;
}

function semanticChecks(errors, descriptor, checklist, handoff) {
  if (descriptor.cashBoundaryUsd !== 0) {
    errors.push('cashBoundaryUsd must be 0');
  }
  if (descriptor.willNotListFromWorker !== true) {
    errors.push('willNotListFromWorker must be true');
  }
  if (descriptor.providerNeutral !== true) {
    errors.push('providerNeutral must be true (no Agensi SDK dependency)');
  }
  if (descriptor.skillRecipePin !== PIN) {
    errors.push(`skillRecipePin must be ${PIN}`);
  }
  if (!String(descriptor.skillRecipePin || '').includes(PIN_SHA)) {
    errors.push(`skillRecipePin must include ${PIN_SHA}`);
  }
  if (descriptor.ownershipClaim?.claimsProprietaryOwnershipOfFreeRecipes !== false) {
    errors.push('ownershipClaim.claimsProprietaryOwnershipOfFreeRecipes must be false');
  }
  const statement = descriptor.ownershipClaim?.statement || '';
  if (!/does not claim proprietary ownership of (the )?free (public )?recipes/i.test(statement)) {
    errors.push('ownershipClaim.statement must deny proprietary ownership of free recipes');
  }
  if (/exclusive ownership of (the )?free recipes/i.test(JSON.stringify(descriptor))) {
    errors.push('descriptor must not claim exclusive ownership of free recipes');
  }

  const recipes = descriptor.referencedPublicRecipes || [];
  for (const name of EXPECTED_RECIPES) {
    if (!recipes.includes(name)) {
      errors.push(`referencedPublicRecipes missing ${name}`);
    }
  }

  if (checklist) {
    const ids = (checklist.items || []).map((i) => i.id);
    const summary = descriptor.listingChecklistSummary || [];
    if (ids.length !== summary.length || ids.some((id, i) => id !== summary[i])) {
      errors.push('listingChecklistSummary must match listing-checklist.json item ids in order');
    }
    if (checklist.skillRecipePin !== descriptor.skillRecipePin) {
      errors.push('listing-checklist skillRecipePin must match descriptor');
    }
    if (checklist.willNotListFromWorker !== true) {
      errors.push('listing-checklist willNotListFromWorker must be true');
    }
    const attr = (checklist.items || []).find((i) => i.id === 'attribution-no-proprietary');
    if (!attr) errors.push('listing checklist missing attribution-no-proprietary');
    const cash = (checklist.items || []).find((i) => i.id === 'cash-boundary');
    if (cash && cash.workerMustNotPerform !== true) {
      errors.push('cash-boundary must set workerMustNotPerform');
    }
  }

  if (handoff) {
    if (handoff.cloudflareAccessUrl !== descriptor.rootHandoff?.cloudflareAccessUrl) {
      errors.push('access-handoff cloudflareAccessUrl must match descriptor.rootHandoff');
    }
    if (handoff.workerMustNotAuthenticate !== true) {
      errors.push('access-handoff workerMustNotAuthenticate must be true');
    }
    if (handoff.skillRecipePin !== descriptor.skillRecipePin) {
      errors.push('access-handoff skillRecipePin must match descriptor');
    }
    if (!Array.isArray(handoff.steps) || handoff.steps.length < 6) {
      errors.push('access-handoff.steps needs ≥6 concrete UI steps');
    }
    const blob = handoff.steps.join('\n');
    if (!/Cloudflare Access/i.test(blob)) {
      errors.push('access-handoff steps must mention Cloudflare Access');
    }
    if (!blob.includes(PIN_SHA)) {
      errors.push('access-handoff steps must cite the gateway pin SHA');
    }
  }
}

function fail(message) {
  return {
    ok: false,
    cashBoundaryUsd: 0,
    offline: true,
    networkCalls: 0,
    publicListingSupported: false,
    errors: [message],
  };
}

function rel(p) {
  const r = path.relative(process.cwd(), p);
  return r || p;
}
