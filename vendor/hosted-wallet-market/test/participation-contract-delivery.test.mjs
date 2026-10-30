import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer, request} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {deliverJsonResponse} from '../src/response-completion.mjs';
import {MOUNTED_PUBLIC_READS, mountedPublicRead} from '../src/public-route-limit.mjs';

const root = join(import.meta.dirname, '../../..');
const PREFIX = '/api/neomorphic-contributor-journey';
const ROUTE = '/v1/market/participation-contract';
const FILE_SHA256 = '8018fca0904cdf86259a19d9ca48f4d90938b631e937a56b46ac50eda7c28d22';
const BODY_SHA256 = 'f4c6b459773121ebd1355199950c5f7971cd241b9bdd9132a40bd09f89d7b737';
const BODY_BYTES = 39996;
const contractPath = join(root, 'vendor/hosted-wallet-market/contracts/voluntary-participation.openapi.json');
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes);
const expectedBody = Buffer.from(JSON.stringify(contract));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixtureGitEnv() {
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (key === 'GIT_DIR' || key === 'GIT_WORK_TREE' || key === 'GIT_INDEX_FILE' ||
        key === 'GIT_OBJECT_DIRECTORY' || key === 'GIT_ALTERNATE_OBJECT_DIRECTORIES' ||
        key === 'GIT_COMMON_DIR' || key === 'GIT_NAMESPACE' || key === 'GIT_PREFIX' ||
        key === 'GIT_CONFIG_PARAMETERS' || key === 'GIT_CONFIG_COUNT' ||
        key.startsWith('GIT_CONFIG_KEY_') || key.startsWith('GIT_CONFIG_VALUE_')) delete env[key];
  }
  env.GIT_CONFIG_COUNT = '0';
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}

function git(args, cwd, env) {
  const result = spawnSync('git', args, {cwd, env, encoding: 'utf8', timeout: 15000});
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return (result.stdout || '').trim();
}

function acceptContract(status, body) {
  if (status !== 200 || !Buffer.isBuffer(body) || body.length !== BODY_BYTES || sha256(body) !== BODY_SHA256) {
    return {ok: false, reason: body?.length ? 'contract_bytes' : 'empty_contract'};
  }
  const document = JSON.parse(body.toString('utf8'));
  const paths = document.paths && typeof document.paths === 'object' ? Object.keys(document.paths) : [];
  const operations = paths.every(path => document.paths[path]?.post?.operationId);
  if (document.openapi !== '3.1.0' || paths.length !== 11 || !operations || !document.components || !document.info) {
    return {ok: false, reason: 'schema'};
  }
  return {ok: true, operations: paths.length, title: document.info.title};
}

function listen(handler) {
  const directory = mkdtempSync(join(tmpdir(), 'h10700-contract-'));
  const socketPath = join(directory, 'node.sock');
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(error => {
      if (!res.headersSent && !res.destroyed) res.destroy(error);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => resolve({
      socketPath,
      async close() {
        server.closeAllConnections();
        await new Promise(done => server.close(done));
        rmSync(directory, {recursive: true, force: true});
      },
    }));
  });
}

function get(socketPath, path) {
  return new Promise((resolve, reject) => {
    const req = request({socketPath, path, method: 'GET', agent: false, headers: {host: 'desk.invalid', connection: 'close'}}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)}));
    });
    req.setTimeout(3000, () => req.destroy(new Error('fixture_deadline')));
    req.on('error', reject);
    req.end();
  });
}

test('synthetic git fixtures clear inherited origin injection and push only over a local path', () => {
  const parent = mkdtempSync(join(tmpdir(), 'h10700-git-'));
  const leaked = join(parent, 'leaked');
  const bare = join(parent, 'bare.git');
  const work = join(parent, 'work');
  const isolated = fixtureGitEnv();
  const poisoned = {...isolated, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'remote.origin.url',
    GIT_CONFIG_VALUE_0: 'https://github.com/epistemedeus/samedaydesk.git'};
  try {
    git(['init', '-q', leaked], parent, poisoned);
    const leakedRemote = git(['remote', '-v'], leaked, poisoned);
    assert.match(leakedRemote, /^origin\thttps:\/\/github\.com\/epistemedeus\/samedaydesk\.git \(fetch\)$/m);
    assert.match(leakedRemote, /^origin\thttps:\/\/github\.com\/epistemedeus\/samedaydesk\.git \(push\)$/m);
    git(['init', '--bare', '-q', bare], parent, isolated);
    git(['init', '-q', work], parent, isolated);
    assert.equal(git(['remote'], work, isolated), '');
    git(['remote', 'add', 'origin', bare], work, isolated);
    const origin = git(['remote', 'get-url', 'origin'], work, isolated);
    assert.equal(origin, bare);
    assert.equal(origin.includes('github.com'), false);
    assert.equal(origin.includes('://'), false);
    writeFileSync(join(work, 'note.txt'), 'local fixture\n');
    git(['add', 'note.txt'], work, isolated);
    git(['-c', 'user.email=h10700-fixture@invalid', '-c', 'user.name=h10700-fixture', 'commit', '-q', '-m', 'fixture'], work, isolated);
    git(['push', 'origin', 'HEAD:refs/heads/fixture'], work, isolated);
    const published = git(['ls-remote', bare, 'refs/heads/fixture'], parent, isolated);
    assert.match(published, /refs\/heads\/fixture$/);
  } finally {
    rmSync(parent, {recursive: true, force: true});
  }
});

test('the installed artifact is the nonempty OpenAPI document the route serves', () => {
  assert.equal(contractBytes.length > BODY_BYTES, true);
  assert.equal(sha256(contractBytes), FILE_SHA256);
  assert.equal(expectedBody.length, BODY_BYTES);
  assert.equal(sha256(expectedBody), BODY_SHA256);
  const voluntary = readFileSync(join(root, 'vendor/hosted-wallet-market/src/voluntary-market.mjs'), 'utf8');
  const actions = [...voluntary.match(/const ACTIONS = \[([\s\S]*?)\]/)[1].matchAll(/'([A-Za-z]+)'/g)].map(match => match[1]);
  assert.equal(actions.length, 11);
  assert.deepEqual(Object.keys(contract.paths).sort(), actions.map(action => `/v1/market/${action}`).sort());
  for (const action of actions) {
    assert.equal(contract.paths[`/v1/market/${action}`].post.operationId, action);
  }
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract.info.title, 'Voluntary machine participation');
  const received = acceptContract(200, expectedBody);
  assert.equal(received.ok, true);
  assert.equal(received.operations, 11);
});

test('mounted GET delivers that document, and status or length cannot accept an empty contract', async () => {
  const serverSource = readFileSync(join(root, 'vendor/hosted-wallet-market/src/server.mjs'), 'utf8');
  const marketSource = readFileSync(join(root, 'vendor/hosted-wallet-market/src/machine-market.mjs'), 'utf8');
  const mountSource = readFileSync(join(root, 'server/lib/hosted-wallet-market-mount.js'), 'utf8');
  const clientSource = readFileSync(join(root, 'vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs'), 'utf8');
  assert.match(serverSource, /path === '\/v1\/market\/participation-contract' && req\.method === 'GET' && machine\?\.participationContract/);
  assert.match(serverSource, /return send\(res,200,machine\.participationContract\);/);
  assert.match(marketSource, /participationContract:voluntary\.contract/);
  assert.match(mountSource, /PREFIX \+ '\/v1\/market\/'/);
  assert.equal(clientSource.includes('participation-contract'), false);
  assert.match(clientSource, /request\('\/v1\/market\/profile'/);
  assert.equal(mountedPublicRead(PREFIX, PREFIX + ROUTE, 'GET'), true);
  assert.equal(mountedPublicRead(PREFIX, PREFIX + ROUTE, 'POST'), false);
  assert.ok(MOUNTED_PUBLIC_READS.includes(ROUTE));
  const pin = JSON.parse(readFileSync(join(root, 'server/foundry/activation/private-control-pin.json'), 'utf8'));
  for (const file of [
    'vendor/hosted-wallet-market/src/response-completion.mjs',
    'vendor/hosted-wallet-market/src/server.mjs',
    'vendor/hosted-wallet-market/src/voluntary-market.mjs',
    'vendor/hosted-wallet-market/src/machine-market.mjs',
    'vendor/hosted-wallet-market/contracts/voluntary-participation.openapi.json',
    'server/lib/hosted-wallet-market-mount.js',
  ]) {
    assert.equal(pin.files[file], sha256(readFileSync(join(root, file))), file);
  }

  let enabled = true;
  let drop = false;
  const origin = await listen((req, res) => {
    const path = new URL(req.url, 'https://127.0.0.1').pathname;
    if (path === ROUTE && req.method === 'GET' && enabled) return deliverJsonResponse(res, 200, contract);
    return deliverJsonResponse(res, 404, {ok: false, code: 'not_found'});
  });
  const edge = await listen((req, res) => new Promise((resolve, reject) => {
    const incoming = request({socketPath: origin.socketPath, path: req.url, method: 'GET', agent: false}, reply => {
      const chunks = [];
      reply.on('data', chunk => chunks.push(chunk));
      reply.on('end', () => {
        const upstream = Buffer.concat(chunks);
        if (drop) {
          res.writeHead(reply.statusCode, {'content-type': reply.headers['content-type'], 'content-length': '0'});
          res.end();
        } else {
          res.writeHead(reply.statusCode, {
            'content-type': reply.headers['content-type'],
            'content-length': String(upstream.length),
          });
          res.end(upstream);
        }
        resolve();
      });
    });
    incoming.setTimeout(3000, () => incoming.destroy());
    incoming.on('error', reject);
    incoming.end();
  }));
  try {
    const served = await get(origin.socketPath, ROUTE);
    assert.equal(served.status, 200);
    assert.equal(served.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(served.headers['content-length'], String(BODY_BYTES));
    assert.equal(served.headers.connection, 'close');
    assert.equal(served.headers['cache-control'], 'no-store');
    assert.equal(served.headers['x-ae-wire-version'], 'c0-1');
    assert.equal(served.headers['x-ae-server-class'], 'live');
    assert.equal(served.headers.vary, undefined);
    assert.equal(served.headers['transfer-encoding'], undefined);
    assert.equal(served.body.equals(expectedBody), true);
    assert.deepEqual(acceptContract(served.status, served.body), {ok: true, operations: 11, title: 'Voluntary machine participation'});

    const missing = await get(origin.socketPath, '/v1/market/missing');
    assert.equal(missing.status, 404);
    assert.equal(acceptContract(missing.status, missing.body).ok, false);
    enabled = false;
    const refused = await get(origin.socketPath, ROUTE);
    assert.equal(refused.status, 404);
    assert.equal(JSON.parse(refused.body.toString()).code, 'not_found');
    assert.equal(acceptContract(refused.status, refused.body).reason, 'contract_bytes');
    enabled = true;

    const naiveLength = (status, declared, body) => status === 200 && declared === BODY_BYTES && body.length === 0;
    assert.equal(naiveLength(200, BODY_BYTES, Buffer.alloc(0)), true);
    assert.equal(acceptContract(200, Buffer.alloc(0)).reason, 'empty_contract');
    assert.equal(acceptContract(200, Buffer.from('{}')).reason, 'contract_bytes');

    drop = true;
    const lost = await get(edge.socketPath, ROUTE);
    assert.equal(lost.status, 200);
    assert.equal(lost.headers['content-length'], '0');
    assert.equal(lost.body.length, 0);
    assert.equal(acceptContract(lost.status, lost.body).reason, 'empty_contract');
    drop = false;
    const restored = await get(edge.socketPath, ROUTE);
    assert.equal(restored.status, 200);
    assert.equal(restored.body.equals(expectedBody), true);
    assert.equal(acceptContract(restored.status, restored.body).ok, true);
  } finally {
    await edge.close();
    await origin.close();
  }
});
