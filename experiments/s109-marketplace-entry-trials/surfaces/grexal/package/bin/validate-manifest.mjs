#!/usr/bin/env node
/**
 * Offline grexal.json check aligned with grexal@0.4.1 dist/index.js validateManifest.
 * Does not call the Grexal API, does not require login, does not spend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REJECTED_FIELDS = {
  name: '`name` is no longer set in grexal.json. Run `grexal init --name <slug>` or `grexal agent set-name <slug>`.',
  description: '`description` is no longer set in grexal.json. Run `grexal agent set-description "..."`.',
  category: '`category` is no longer set in grexal.json. Run `grexal agent set-category <slug>`.',
  tags: '`tags` are no longer set in grexal.json. Run `grexal agent set-tags <a,b,c>`.',
  homepage: '`homepage` is no longer set in grexal.json. Run `grexal agent set-homepage <url>`.',
  repository: '`repository` is no longer set in grexal.json. Run `grexal agent set-repository <url>`.',
  icon: '`icon` is no longer set in grexal.json. Run `grexal agent set-icon <local-path>`.',
  is_open_source: '`is_open_source` is no longer set in grexal.json. Run `grexal agent set-is-open-source <true|false>`.',
  pricing: '`pricing` is no longer set in grexal.json. Use `grexal agent price add` (CLI 0.4.1 reject text still says set-price).',
  visibility: '`visibility` is not a grexal.json field. Use `grexal agent set-visibility public|private` after first push.',
};

const LANGUAGES = ['python', 'typescript'];
const CPU_OPTIONS = [1, 2, 4, 8];
const SANDBOX_TEMPLATES = ['standard', 'desktop'];
const MEMORY_MIN = 512;
const MEMORY_MAX = 8192;
const TIMEOUT_MIN = 10;
const TIMEOUT_MAX = 86400;
const TYPED_FIELD_TYPES = ['text', 'file', 'number', 'boolean', 'json'];
const INPUT_SCHEMA_PROPERTY_TYPES = ['string', 'number', 'boolean', 'array', 'object'];
const LANGUAGE_EXTENSIONS = {
  python: ['.py'],
  typescript: ['.ts', '.js'],
};
const MAX_PROPS = 50;
const MAX_DESC = 500;

function isV1Schema(schema) {
  return typeof schema === 'object' && schema !== null && !Array.isArray(schema) && schema.type === 'object';
}

function validateTypedSchema(errors, schema, pathPrefix) {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    errors.push({ path: pathPrefix, message: 'Must be an object' });
    return;
  }
  const keys = Object.keys(schema);
  if (keys.length > MAX_PROPS) {
    errors.push({ path: pathPrefix, message: `Maximum ${MAX_PROPS} properties allowed` });
  }
  for (const key of keys) {
    const prop = schema[key];
    const fieldPath = `${pathPrefix}.${key}`;
    if (typeof prop !== 'object' || prop === null || Array.isArray(prop)) {
      errors.push({ path: fieldPath, message: 'Must be an object' });
      continue;
    }
    if (typeof prop.type !== 'string' || !TYPED_FIELD_TYPES.includes(prop.type)) {
      errors.push({
        path: `${fieldPath}.type`,
        message: `Must be one of: ${TYPED_FIELD_TYPES.join(', ')}`,
      });
    }
    if (prop.description !== undefined) {
      if (typeof prop.description !== 'string') {
        errors.push({ path: `${fieldPath}.description`, message: 'Must be a string' });
      } else if (prop.description.length > MAX_DESC) {
        errors.push({ path: `${fieldPath}.description`, message: `Maximum ${MAX_DESC} characters` });
      }
    }
    if (prop.required !== undefined && typeof prop.required !== 'boolean') {
      errors.push({ path: `${fieldPath}.required`, message: 'Must be a boolean' });
    }
  }
}

function validateInputSchemaV1(errors, schema) {
  if (schema.type !== 'object') {
    errors.push({ path: 'input_schema.type', message: 'Must be "object"' });
  }
  if (schema.properties !== undefined) {
    if (typeof schema.properties !== 'object' || schema.properties === null || Array.isArray(schema.properties)) {
      errors.push({ path: 'input_schema.properties', message: 'Must be an object' });
    } else {
      for (const [key, prop] of Object.entries(schema.properties)) {
        const prefix = `input_schema.properties.${key}`;
        if (typeof prop !== 'object' || prop === null || Array.isArray(prop)) {
          errors.push({ path: prefix, message: 'Must be an object' });
          continue;
        }
        if (typeof prop.type !== 'string' || !INPUT_SCHEMA_PROPERTY_TYPES.includes(prop.type)) {
          errors.push({
            path: `${prefix}.type`,
            message: `Must be one of: ${INPUT_SCHEMA_PROPERTY_TYPES.join(', ')}`,
          });
        }
      }
    }
  }
}

function validateRuntime(errors, runtime) {
  if (runtime === undefined) {
    errors.push({ path: 'runtime', message: 'Required' });
    return null;
  }
  if (typeof runtime !== 'object' || runtime === null || Array.isArray(runtime)) {
    errors.push({ path: 'runtime', message: 'Must be an object' });
    return null;
  }
  if (runtime.language === undefined) {
    errors.push({ path: 'runtime.language', message: 'Required' });
  } else if (!LANGUAGES.includes(runtime.language)) {
    errors.push({ path: 'runtime.language', message: `Must be one of: ${LANGUAGES.join(', ')}` });
  }
  if (runtime.memory_mb !== undefined) {
    if (typeof runtime.memory_mb !== 'number') {
      errors.push({ path: 'runtime.memory_mb', message: 'Must be a number' });
    } else {
      if (runtime.memory_mb < MEMORY_MIN || runtime.memory_mb > MEMORY_MAX) {
        errors.push({ path: 'runtime.memory_mb', message: `Must be between ${MEMORY_MIN} and ${MEMORY_MAX}` });
      }
      if (runtime.memory_mb % 2 !== 0) {
        errors.push({ path: 'runtime.memory_mb', message: 'Must be an even number' });
      }
    }
  }
  if (runtime.timeout_seconds !== undefined) {
    if (typeof runtime.timeout_seconds !== 'number') {
      errors.push({ path: 'runtime.timeout_seconds', message: 'Must be a number' });
    } else if (runtime.timeout_seconds < TIMEOUT_MIN || runtime.timeout_seconds > TIMEOUT_MAX) {
      errors.push({
        path: 'runtime.timeout_seconds',
        message: `Must be between ${TIMEOUT_MIN} and ${TIMEOUT_MAX}`,
      });
    }
  }
  if (runtime.cpu !== undefined) {
    if (typeof runtime.cpu !== 'number' || !CPU_OPTIONS.includes(runtime.cpu)) {
      errors.push({ path: 'runtime.cpu', message: `Must be one of: ${CPU_OPTIONS.join(', ')}` });
    }
  }
  if (runtime.sandbox_template !== undefined) {
    if (!SANDBOX_TEMPLATES.includes(runtime.sandbox_template)) {
      errors.push({
        path: 'runtime.sandbox_template',
        message: `Must be one of: ${SANDBOX_TEMPLATES.join(', ')}`,
      });
    }
  }
  return runtime;
}

export function validateManifest(manifest, { entrypointExists } = {}) {
  const errors = [];
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    return [{ path: '', message: 'Manifest must be a JSON object' }];
  }
  if (manifest.manifest_version !== undefined) {
    if (![1, 2, 3].includes(manifest.manifest_version)) {
      errors.push({ path: 'manifest_version', message: 'Supported versions: 1, 2, 3' });
    }
  }
  for (const [field, message] of Object.entries(REJECTED_FIELDS)) {
    if (manifest[field] !== undefined) {
      errors.push({ path: field, message });
    }
  }
  if (manifest.entrypoint === undefined || manifest.entrypoint === '') {
    errors.push({ path: 'entrypoint', message: 'Required' });
  } else if (typeof manifest.entrypoint !== 'string') {
    errors.push({ path: 'entrypoint', message: 'Must be a string' });
  }
  const runtime = validateRuntime(errors, manifest.runtime);
  if (manifest.input_schema !== undefined) {
    if (isV1Schema(manifest.input_schema)) {
      validateInputSchemaV1(errors, manifest.input_schema);
    } else {
      validateTypedSchema(errors, manifest.input_schema, 'input_schema');
    }
  }
  if (manifest.output_schema !== undefined) {
    if (isV1Schema(manifest.input_schema)) {
      errors.push({
        path: 'output_schema',
        message: 'output_schema requires v2 typed schema format (remove the type/properties wrapper from input_schema)',
      });
    } else {
      validateTypedSchema(errors, manifest.output_schema, 'output_schema');
    }
  }
  if (manifest.connections !== undefined && !Array.isArray(manifest.connections)) {
    errors.push({ path: 'connections', message: 'Must be an array' });
  }
  if (typeof manifest.entrypoint === 'string' && runtime?.language) {
    const allowed = LANGUAGE_EXTENSIONS[runtime.language] || [];
    if (allowed.length && !allowed.some((ext) => manifest.entrypoint.endsWith(ext))) {
      errors.push({
        path: 'entrypoint',
        message: `Extension must be ${allowed.join(' or ')} for language '${runtime.language}'`,
      });
    }
  }
  if (entrypointExists === false) {
    errors.push({
      path: 'entrypoint',
      message: `File '${manifest.entrypoint}' not found in project`,
    });
  }
  return errors;
}

function main() {
  const manifestPath = process.argv[2] || path.join(__dirname, '..', 'grexal.json');
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: `cannot read ${manifestPath}: ${e.message}` })}\n`);
    process.exit(1);
  }
  let m;
  try {
    m = JSON.parse(raw);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: `invalid JSON: ${e.message}` })}\n`);
    process.exit(1);
  }
  const projectRoot = path.dirname(path.resolve(manifestPath));
  let entrypointExists;
  if (typeof m.entrypoint === 'string') {
    entrypointExists = fs.existsSync(path.join(projectRoot, m.entrypoint));
  }
  const errors = validateManifest(m, { entrypointExists });
  const identityPath = path.join(projectRoot, '.grexal', 'agent.json');
  let identity = null;
  if (fs.existsSync(identityPath)) {
    try {
      identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    } catch {
      identity = { error: 'unreadable' };
    }
  }
  const out = {
    ok: errors.length === 0,
    cashBoundaryUsd: 0,
    manifestPath: path.relative(process.cwd(), manifestPath) || manifestPath,
    manifest_version: m.manifest_version ?? null,
    entrypoint: m.entrypoint ?? null,
    runtimeLanguage: m.runtime?.language ?? null,
    identityStub: identity,
    identityNote:
      'Local .grexal/agent.json is {name} until first grexal push, which this worker will not run. After push it becomes {agentId}.',
    errors,
    rejectedIfPresent: Object.keys(REJECTED_FIELDS),
    metadataSplit:
      'grexal.json = runtime/IO; marketplace name/description/category/tags/pricing/visibility via dashboard or grexal agent set-* / grexal agent price after first push. Source: docs.grexal.ai/docs/agent-manifest + grexal@0.4.1 validator.',
    alignedWith: 'grexal@0.4.1 validateManifest (unpacked tarball, not executed via npx unless noted)',
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(errors.length ? 1 : 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
