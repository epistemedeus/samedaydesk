// Source-bound machine capability documents. No signer, qualification, or file trust
// beyond a mode-0600 regular file. Hash equality is the caller's check.
import {constants, openSync, closeSync, fstatSync, lstatSync, readFileSync} from 'node:fs';
import {dirname, isAbsolute, relative, resolve, parse, join} from 'node:path';
import {installedSourceSha256, hostSourceSha256} from './native-debt.mjs';
import {machineNetworkSource} from './machine-network-source.mjs';

const PREFIX = 'source-bound:';
const SWITCH = /^(?:0|1|true|false|on|off|yes|no|unfunded|sandbox|qualified)$/i;
const KEYS = Object.freeze(['schema', 'profile', 'origin', 'tenant', 'sourceSha256', 'hostSha256', 'discovery', 'money', 'networkSource', 'execution', 'participation']);
const TENANT = /^[a-z][a-z0-9_-]{2,63}$/;
const HASH = /^[0-9a-f]{64}$/;
const PART = /^[A-Za-z0-9._-]{1,128}$/;

const refuse = code => { throw Object.assign(new Error(code), {code, codeName: code, http: 409}); };

export function confinedRelative(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 512) return false;
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0') || /[\r\n]/.test(value)) return false;
  const parts = value.split('/');
  return parts.every(part => part !== '.' && part !== '..' && PART.test(part));
}

function httpsOrigin(value) {
  if (typeof value !== 'string' || value.length > 200) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password;
  } catch { return false; }
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) refuse('machine_profile_refused');
  if (Object.keys(input).some(key => !KEYS.includes(key))) refuse('machine_profile_refused');
  const document = {};
  for (const key of KEYS) if (input[key] !== undefined) document[key] = input[key];
  if (document.schema !== 'pilot.machine-market.capability.v1' || document.profile !== 'machine-market') refuse('machine_profile_refused');
  if (!httpsOrigin(document.origin) || !TENANT.test(document.tenant || '')) refuse('machine_profile_refused');
  if (!HASH.test(document.sourceSha256 || '') || !HASH.test(document.hostSha256 || '')) refuse('machine_profile_refused');
  if (document.discovery !== 'qualified-source' || !['unfunded', 'sandbox', 'qualified'].includes(document.money)) refuse('machine_profile_refused');
  if (document.participation !== undefined && (document.participation !== 'voluntary-artifact-v1' || document.money !== 'unfunded')) refuse('machine_profile_refused');
  if (document.networkSource !== undefined && (!document.networkSource || typeof document.networkSource !== 'object' || Array.isArray(document.networkSource))) refuse('machine_profile_refused');
  if (document.execution !== undefined) {
    const execution = document.execution;
    if (!execution || typeof execution !== 'object' || Array.isArray(execution)) refuse('machine_profile_refused');
    if (Object.keys(execution).some(key => key !== 'class' && key !== 'forkId')) refuse('machine_profile_refused');
    if (!['public', 'owned-fork'].includes(execution.class)) refuse('machine_profile_refused');
    if (execution.class === 'owned-fork' && !/^[-a-zA-Z0-9_.]{1,64}$/.test(execution.forkId || '')) refuse('machine_profile_refused');
    document.execution = {class: execution.class, ...(execution.forkId ? {forkId: execution.forkId} : {})};
  }
  return document;
}

export function canonicalMachineProfile(document) {
  return JSON.stringify(normalize(document));
}

export function classifyMachineProfileValue(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16384 || value.includes('\0')) refuse('machine_profile_refused');
  if (SWITCH.test(value)) refuse('machine_profile_refused');
  if (value.startsWith(PREFIX)) {
    let parsed;
    try { parsed = JSON.parse(value.slice(PREFIX.length)); }
    catch { refuse('machine_profile_refused'); }
    const document = normalize(parsed);
    if (canonicalMachineProfile(document) !== value.slice(PREFIX.length)) refuse('machine_profile_refused');
    return {form: 'source-bound', document};
  }
  if (value.startsWith('/')) {
    if (value.includes('..') || /[\r\n]/.test(value)) refuse('machine_profile_refused');
    return {form: 'absolute-path'};
  }
  if (!confinedRelative(value)) refuse('machine_profile_refused');
  return {form: 'relative-path'};
}

// Check every directory before reading or creating a leaf. In particular, a
// relative generator output must not write through a symlink before refusal.
export function machineProfileFile(value, {sdsRoot} = {}) {
  const {form} = classifyMachineProfileValue(value);
  if (!['absolute-path','relative-path'].includes(form)) refuse('machine_profile_refused');
  if (form === 'relative-path' && (!sdsRoot || !isAbsolute(sdsRoot))) refuse('machine_profile_refused');
  const file = form === 'absolute-path' ? value : resolve(sdsRoot, value);
  if (form === 'relative-path') {
    const rel = relative(resolve(sdsRoot), file);
    if (rel.startsWith('..') || isAbsolute(rel)) refuse('machine_profile_refused');
  }
  let current = parse(file).root;
  try {
    for (const part of dirname(file).slice(current.length).split('/').filter(Boolean)) {
      current = join(current, part);
      const st = lstatSync(current);
      if (!st.isDirectory() || st.isSymbolicLink()) refuse('machine_profile_refused');
    }
  } catch { refuse('machine_profile_refused'); }
  return file;
}

function readRegular(file) {
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const st = fstatSync(fd);
    if (!st.isFile() || (st.mode & 0o077) || st.size > 65536 || st.size < 2) refuse('machine_profile_refused');
    const bytes = readFileSync(fd);
    if (bytes.length !== st.size) refuse('machine_profile_refused');
    return normalize(JSON.parse(bytes.toString('utf8')));
  } catch { refuse('machine_profile_refused'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function admitMachineCapability(input, {sdsRoot, origin, tenant} = {}) {
  if (!input) return null;
  const document = loadMachineProfile(input, {sdsRoot});
  if (document.origin !== origin || document.tenant !== tenant ||
      document.sourceSha256 !== installedSourceSha256() || document.hostSha256 !== hostSourceSha256(sdsRoot)) refuse('machine_profile_refused');
  if (document.networkSource) {
    try { machineNetworkSource(document.networkSource); }
    catch { refuse('machine_profile_refused'); }
  }
  if (document.money === 'qualified' && (!document.networkSource || !document.execution)) refuse('machine_profile_refused');
  return Object.freeze({...document});
}

/** Parse a profile object, source-bound document, absolute file, or sdsRoot-relative file. */
export function loadMachineProfile(input, {sdsRoot} = {}) {
  if (typeof input === 'string') {
    const classified = classifyMachineProfileValue(input);
    if (classified.form === 'source-bound') return classified.document;
    return readRegular(machineProfileFile(input, {sdsRoot}));
  }
  return normalize(input);
}
