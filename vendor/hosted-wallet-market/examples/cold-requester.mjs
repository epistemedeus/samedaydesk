#!/usr/bin/env node
// Agent HTTP example for the existing unfunded machine market.
// The public 0.1.1 client posts /v1/tasks and discovers /v1/discover.
// This script uses the machine routes already mounted on the host.
// Passwords, recovery codes, cookies, and proofs stay in the mode 0600 file.
import {randomBytes} from 'node:crypto';
import {chmodSync, readFileSync, renameSync, statSync, writeFileSync} from 'node:fs';
import https from 'node:https';
import net from 'node:net';

const PREFIX = '/api/neomorphic-contributor-journey';
const args = process.argv.slice(2);
const command = args[0];
const flag = name => {
  const index = args.indexOf('--' + name);
  return index < 0 ? undefined : args[index + 1];
};
const refusedFlags = ['password', 'cookie', 'token', 'secret', 'recovery-code', 'private-key', 'seed', 'csrf', 'session'];
if (args.some(arg => refusedFlags.includes(String(arg).replace(/^--/, '')))) {
  console.log(JSON.stringify({ok: false, code: 'secret_flag_refused'}));
  process.exit(1);
}

function originOf() {
  const origin = flag('origin');
  let url;
  try { url = new URL(origin); }
  catch { fail('origin_required', 1); }
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) fail('origin_required', 1);
  return origin;
}

function fail(code, status = 1, extra = {}) {
  console.log(JSON.stringify({ok: false, code, ...extra}));
  process.exit(status);
}

function loadSecret(file) {
  const st = statSync(file);
  if (!st.isFile() || (st.mode & 0o077)) fail('secret_file_refused');
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (parsed?.schema !== 'ae.password-file.v1' || typeof parsed.password !== 'string' || parsed.password.length < 16) fail('secret_file_refused');
  return parsed;
}

function saveSecret(file, value) {
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(value) + '\n', {mode: 0o600});
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

function request(origin, route, {method = 'GET', body, headers = {}} = {}) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const ca = flag('ca-file') ? readFileSync(flag('ca-file')) : undefined;
  const hostname = new URL(origin).hostname;
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const req = https.request(origin + route, {
      method, ca, ...(net.isIP(hostname) ? {} : {servername: hostname}), headers: {
        'x-ae-wire-version': flag('wire') || 'c0-1',
        ...(payload ? {'content-type': 'application/json', 'content-length': String(payload.length)} : {}),
        ...headers,
      }, timeout: 20000,
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        const setCookie = res.headers['set-cookie'];
        const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find(row => String(row || '').startsWith('__Host-neo_contributor='));
        finish({
          status: res.statusCode,
          body: parsed,
          cookie: cookie ? String(cookie).split(';')[0] : null,
          csrf: res.headers['x-cj-csrf'] || null,
        });
      });
    });
    req.on('error', () => finish({status: 0, body: null, cookie: null, csrf: null}));
    req.on('timeout', () => req.destroy());
    req.end(payload);
  });
}

function proof() { return randomBytes(32).toString('base64url'); }
function operation(name) { return `cold-${name}-${randomBytes(8).toString('hex')}`; }
function emit(value, ok = value.ok !== false) {
  console.log(JSON.stringify(value));
  process.exit(ok ? 0 : 1);
}
function codeOf(response) {
  return response.body?.code || response.body?.error?.code || null;
}

const origin = originOf();
const secretFile = flag('secret-file');

if (command === 'profile') {
  const response = await request(origin, PREFIX + '/v1/market/profile');
  const capability = response.body?.value?.capability;
  emit({
    ok: response.status === 200 && response.body?.ok === true,
    status: response.status,
    code: codeOf(response),
    money: capability?.money ?? null,
    signerAuthority: response.body?.value?.signerAuthority ?? null,
    discovery: capability?.discovery ?? null,
  });
}

if (command === 'wrong-wire') {
  const response = await request(origin, PREFIX + '/v1/market/profile', {headers: {'x-ae-wire-version': '1'}});
  emit({ok: false, status: response.status, code: codeOf(response)});
}

if (command === 'discover') {
  const response = await request(origin, PREFIX + '/v1/market/discover?limit=20');
  const items = response.body?.value?.items || [];
  let matched = null;
  if (secretFile) {
    const taskId = loadSecret(secretFile).taskId;
    matched = taskId ? items.find(item => item.taskId === taskId) || null : null;
  }
  emit({
    ok: response.status === 200 && response.body?.ok === true,
    status: response.status,
    code: codeOf(response),
    publicEnabled: response.body?.value?.publicEnabled ?? null,
    moneyQualified: response.body?.value?.moneyQualified ?? null,
    signerAuthority: response.body?.value?.signerAuthority ?? null,
    count: items.length,
    matched: Boolean(matched),
    fundingState: matched?.fundingState ?? null,
    assigned: matched?.assigned ?? null,
  });
}

function sessionHeaders(secret, {csrf = true, originHeader = true} = {}) {
  return {
    ...(originHeader ? {origin} : {}),
    cookie: secret.cookie,
    ...(csrf ? {'x-cj-csrf': secret.csrf} : {}),
  };
}

if (command === 'signup') {
  const displayName = flag('display-name');
  const role = flag('role');
  if (!secretFile || !displayName || !['requester', 'contributor'].includes(role)) fail('signup_arguments_refused');
  const password = randomBytes(24).toString('hex');
  const idempotencyKey = operation('signup');
  const proofValue = proof();
  const body = {password, displayName, role};
  const response = await request(origin, PREFIX + '/v1/account/signup', {
    method: 'POST', body, headers: {origin, 'idempotency-key': idempotencyKey, 'x-account-operation-proof': proofValue},
  });
  if (response.status !== 200 || !response.cookie || !response.csrf) emit({ok: false, status: response.status, code: codeOf(response)});
  saveSecret(secretFile, {
    schema: 'ae.password-file.v1', password, displayName, role,
    accountId: response.body?.value?.account?.accountId,
    recoveryCode: response.body?.value?.recoveryCode,
    cookie: response.cookie, csrf: response.csrf,
    operations: {signup: {idempotencyKey, proof: proofValue, body: {displayName, role}}},
  });
  emit({ok: true, status: response.status, role: response.body?.value?.account?.role ?? null, recoveryStored: Boolean(response.body?.value?.recoveryCode)});
}

if (command === 'replay-signup' || command === 'readback') {
  const secret = loadSecret(secretFile);
  const stored = secret.operations?.signup;
  if (!stored) fail('signup_operation_required');
  const body = command === 'readback'
    ? {operation: flag('operation') || 'signup'}
    : {password: secret.password, displayName: stored.body.displayName, role: stored.body.role};
  const route = command === 'readback' ? '/v1/account/readback' : '/v1/account/signup';
  const response = await request(origin, PREFIX + route, {
    method: 'POST', body, headers: {origin, 'idempotency-key': stored.idempotencyKey, 'x-account-operation-proof': stored.proof},
  });
  const same = response.body?.value?.account?.accountId === secret.accountId;
  if (response.body?.value?.recoveryCode) secret.recoveryCode = response.body.value.recoveryCode;
  if (response.cookie) secret.cookie = response.cookie;
  if (response.csrf) secret.csrf = response.csrf;
  saveSecret(secretFile, secret);
  emit({ok: response.status === 200 && same, status: response.status, code: codeOf(response), replay: same, recoveryStored: Boolean(secret.recoveryCode)});
}

if (command === 'login' || command === 'recover') {
  const secret = loadSecret(secretFile);
  const idempotencyKey = operation(command);
  const proofValue = proof();
  const newPassword = command === 'recover' ? randomBytes(24).toString('hex') : null;
  const body = command === 'login'
    ? {accountId: secret.accountId, password: secret.password}
    : {accountId: secret.accountId, recoveryCode: secret.recoveryCode, newPassword};
  const response = await request(origin, PREFIX + '/v1/account/' + command, {
    method: 'POST', body, headers: {origin, 'idempotency-key': idempotencyKey, 'x-account-operation-proof': proofValue},
  });
  if (response.status !== 200) emit({ok: false, status: response.status, code: codeOf(response)});
  if (newPassword) secret.password = newPassword;
  if (response.body?.value?.recoveryCode) secret.recoveryCode = response.body.value.recoveryCode;
  secret.cookie = response.cookie;
  secret.csrf = response.csrf;
  secret.operations[command] = {idempotencyKey, proof: proofValue};
  saveSecret(secretFile, secret);
  emit({ok: response.body?.value?.account?.accountId === secret.accountId, status: response.status, role: response.body?.value?.account?.role ?? null});
}

function postBody(secret, title) {
  return {
    title: title || secret.operations.post.body.title,
    summary: flag('summary') || secret.operations.post.body.summary,
    criteria: [flag('criterion') || secret.operations.post.body.criteria[0]],
    payableKinds: ['usable'],
  };
}

if (command === 'post' || command === 'replay-post' || command === 'conflict-post' || command === 'post-without-csrf') {
  const secret = loadSecret(secretFile);
  const fresh = command === 'post';
  const idempotencyKey = fresh ? operation('post') : secret.operations?.post?.idempotencyKey;
  const body = command === 'conflict-post'
    ? {...secret.operations.post.body, title: 'Different unfunded title'}
    : fresh
      ? {title: flag('title'), summary: flag('summary'), criteria: [flag('criterion')], payableKinds: ['usable']}
      : secret.operations.post.body;
  const response = await request(origin, PREFIX + '/v1/market/post', {
    method: 'POST', body, headers: {
      ...sessionHeaders(secret, {csrf: command !== 'post-without-csrf'}),
      'idempotency-key': idempotencyKey,
    },
  });
  if (fresh && response.status === 200) {
    secret.taskId = response.body?.value?.result?.taskId;
    secret.operations.post = {idempotencyKey, body};
    saveSecret(secretFile, secret);
  }
  const state = response.body?.value?.result?.state ?? null;
  const replay = command === 'replay-post' && response.status === 200 && response.body?.value?.result?.taskId === secret.taskId;
  const created = command === 'post' && response.status === 200 && state === 'unfunded_interest';
  emit({
    ok: created || replay,
    status: response.status,
    code: codeOf(response),
    state,
    ...(command === 'replay-post' ? {replay} : {}),
  }, created || replay);
}

if (command === 'interest') {
  const secret = loadSecret(secretFile);
  const peer = loadSecret(flag('peer-secret'));
  const response = await request(origin, PREFIX + '/v1/market/interest', {
    method: 'POST',
    body: {taskId: peer.taskId, note: flag('note')},
    headers: {...sessionHeaders(secret), 'idempotency-key': operation('interest')},
  });
  emit({
    ok: response.status === 200 && response.body?.value?.result?.state === 'unfunded_interest',
    status: response.status,
    code: codeOf(response),
    state: response.body?.value?.result?.state ?? null,
    commissioned: false,
  });
}

if (command === 'fund') {
  const secret = loadSecret(secretFile);
  const response = await request(origin, PREFIX + '/v1/market/fund', {
    method: 'POST',
    body: {taskId: secret.taskId, quoteDigest: 'unfunded', proofId: 'unfunded'},
    headers: {...sessionHeaders(secret), 'idempotency-key': operation('fund')},
  });
  emit({ok: false, status: response.status, code: codeOf(response), paidWork: false});
}

fail('usage');
