// Exact manifest byte receiving. Inputs and retained bodies stay in private storage.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

process.umask(0o077);
const [manifestPath, baseRoot, preimagePath, referencePath, output] = process.argv.slice(2);
if (process.argv.length !== 7 || ![manifestPath, baseRoot, preimagePath, referencePath, output].every(path.isAbsolute)) throw Error('five_absolute_paths_required');
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || process.env.NODE_EXTRA_CA_CERTS || process.env.SSL_CERT_FILE) throw Error('normal_tls_required');
const hash = b => createHash('sha256').update(b).digest('hex');
const read = p => JSON.parse(fs.readFileSync(p));
const save = (p, x) => fs.writeFileSync(p, JSON.stringify(x, null, 2) + '\n', {flag: 'wx', mode: 0o600});
const manifestBytes = fs.readFileSync(manifestPath), manifest = JSON.parse(manifestBytes), preimage = read(preimagePath);
const inputBindings = ['sourceReceiving', 'providerOrigin', 'bindings', 'humanInventory'];
function verifyFiles() {
  for (const name of inputBindings) if (hash(fs.readFileSync(preimage[name].path)) !== preimage[name].sha256) throw Error('changed_' + name);
  if (hash(fs.readFileSync(manifestPath)) !== hash(manifestBytes)) throw Error('manifest_changed');
  if (hash(fs.readFileSync(manifest.publicInputEvidence.path)) !== manifest.publicInputEvidence.sha256) throw Error('input_metadata_changed');
  if (hash(fs.readFileSync(manifest.baseBuild.path)) !== manifest.baseBuild.sha256) throw Error('base_build_receipt_changed');
}
verifyFiles();
if (hash(fs.readFileSync(referencePath)) !== '74d35659ace156ccb4af74853e521a5cd2d2fb6dbd2fd570114efcb304a41de0') throw Error('literal_reference_mismatch');
const {validateBindings, createNodeTransport} = await import(pathToFileURL(referencePath));
const bindings = read(preimage.bindings.path), sourceRead = read(preimage.sourceReceiving.path), provider = read(preimage.providerOrigin.path), human = read(preimage.humanInventory.path);
const expected = {origin: bindings.origin, installationId: manifest.hostedBuild, sdsCommit: manifest.source};
function verifyAuthority() {
  validateBindings(bindings, expected);
  if (manifest.source !== preimage.source || manifest.hostedBuild !== preimage.build || sourceRead.actual?.state !== 'completed' || sourceRead.actual.commit !== manifest.source || sourceRead.actual.uuid !== manifest.hostedBuild || sourceRead.source !== manifest.source || sourceRead.build !== manifest.hostedBuild || sourceRead.acceptedIntendedPostimageOwnsValues !== true) throw Error('source_build_binding_mismatch');
  if (bindings.providerOrigin.authority.artifactSha256 !== preimage.providerOrigin.sha256 || provider.domain !== new URL(bindings.origin).hostname || provider.address !== bindings.providerOrigin.address || provider.observedAt !== bindings.observedAt) throw Error('provider_origin_mismatch');
  for (const at of [sourceRead.observedAt, provider.observedAt]) if (!(Date.now() >= Date.parse(at) && Date.now() - Date.parse(at) < 3600000)) throw Error('source_or_provider_observation_stale');
}
verifyAuthority();
if (manifest.rows.length !== 352 || new Set(manifest.rows.map(x => x.path)).size !== 352) throw Error('complete_352_manifest_required');
const byPath = new Map(manifest.rows.map(x => [x.path, x]));
if (human.source !== manifest.source || human.build !== manifest.hostedBuild || human.rows.length !== 139 || !human.rawEqual || human.rows.some(x => !byPath.has(x.path) || x.bytes !== byPath.get(x.path).bytes || x.sha256 !== byPath.get(x.path).sha256)) throw Error('accepted_139_subset_mismatch');
for (const row of manifest.rows) {
  if (typeof row.path !== 'string' || row.path.startsWith('/') || row.path.split('/').some(x => !x || x === '.' || x === '..') || row.path.includes('\\') || row.path.includes('?') || row.path.includes('#') || !Number.isInteger(row.bytes) || row.bytes < 0 || row.bytes > 8 * 1048576 || !/^[a-f0-9]{64}$/.test(row.sha256)) throw Error('unsafe_manifest_member');
  const b = fs.readFileSync(path.join(baseRoot, row.path));
  if (b.length !== row.bytes || hash(b) !== row.sha256) throw Error('local_manifest_bytes_changed');
}
fs.mkdirSync(output, {mode: 0o700});
const startedAt = new Date().toISOString(), overallUntil = Date.now() + 360000;
const limits = {concurrency: 4, requestMs: 15000, redirects: 2, bodyBytes: 8 * 1048576, aggregateBytes: 256 * 1048576, overallMs: 360000};
let aggregateBytes = 0, cursor = 0, createdSockets = 0, closedSockets = 0;
const ages = () => ({providerSeconds: (Date.now() - Date.parse(provider.observedAt)) / 1000, sourceSeconds: (Date.now() - Date.parse(sourceRead.observedAt)) / 1000});
save(path.join(output, 'INTENT.json'), {startedAt, expected, limits, manifest: {path: manifestPath, sha256: hash(manifestBytes)}, preimage: {path: preimagePath, sha256: hash(fs.readFileSync(preimagePath))}, observationAges: ages(), valuesRead: false, credentialsSent: false, ambientProxyUsed: false});
const readinessTransport = createNodeTransport({timeoutMs: 12000});
const readiness = [];
for (const target of [bindings.frontDoor, bindings.providerOrigin]) {
  const got = await readinessTransport({origin: bindings.origin, target, task: {stage: 'HTTPS', method: 'GET', path: '/api/health', variant: 0}});
  readiness.push({role: target.role, ...got});
}
save(path.join(output, 'READINESS.json'), {at: new Date().toISOString(), rows: readiness});
if (readiness.some(x => !x.transportOk || x.status !== 200 || !x.tls?.authorized || !x.ownedSocketClosed || (x.role === 'provider-origin' && x.peerAddress !== bindings.providerOrigin.address))) throw Error('normal_tls_origin_readiness_failed');

async function get(url, target, maxBytes, until, hops = 0, trace = []) {
  if (Date.now() >= until) return {error: 'request_deadline', trace};
  const got = await new Promise(resolve => {
    let req, socket, timer, finished = false, socketClosed = false, closeFallback;
    const finish = observation => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      const done = () => { clearTimeout(closeFallback); resolve({...observation, socketCreated: Boolean(socket), ownedSocketClosed: !socket || socketClosed}); };
      if (socket && !socketClosed) {
        socket.once('close', done); closeFallback = setTimeout(done, 500); socket.destroy();
      } else done();
      req?.destroy();
    };
    try {
      const host = new URL(bindings.origin).hostname;
      const options = {method: 'GET', agent: false, rejectUnauthorized: true, servername: host,
        headers: {'accept-encoding': 'identity', connection: 'close', 'user-agent': 'SameDayDesk-owned-manifest-byte-receiver/1.0'},
        ...(target.role === 'provider-origin' ? {lookup: (_h, opts, cb) => opts.all ? cb(null, [{address: target.address, family: isIP(target.address)}]) : cb(null, target.address, isIP(target.address))} : {})};
      req = https.get(url, options, res => {
        const common = {status: res.statusCode, tls: res.socket.authorized === true, peerAddress: res.socket.remoteAddress, noCookie: !res.headers['set-cookie'], contentEncoding: res.headers['content-encoding'] ?? null, contentLength: res.headers['content-length'] ?? null};
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) return finish({...common, redirect: res.headers.location});
        let size = 0; const chunks = [];
        res.on('data', b => {
          size += b.length; aggregateBytes += b.length;
          if (size > maxBytes || aggregateBytes > limits.aggregateBytes) return finish({...common, error: 'body_or_aggregate_bound', bytes: size});
          chunks.push(b);
        });
        res.once('aborted', () => finish({...common, error: 'response_aborted', bytes: size}));
        res.once('error', () => finish({...common, error: 'response_error', bytes: size}));
        res.once('end', () => finish({...common, bytes: size, body: Buffer.concat(chunks)}));
      });
      req.once('socket', s => {socket = s; createdSockets++; s.once('close', () => {socketClosed = true; closedSockets++;});});
      req.once('error', e => finish({error: e.code ?? 'request_error'}));
      timer = setTimeout(() => finish({error: 'request_deadline'}), Math.max(1, until - Date.now()));
    } catch {finish({error: 'request_setup_error'});}
  });
  const {body, ...entry} = got; trace.push({url: url.href, ...entry});
  if (got.redirect) {
    const next = new URL(got.redirect, url);
    if (!got.ownedSocketClosed || !got.tls || hops >= limits.redirects || next.origin !== bindings.origin || next.username || next.password) return {error: 'unsafe_or_excess_redirect', trace};
    return get(next, target, maxBytes, until, hops + 1, trace);
  }
  return {...got, trace};
}

const tasks = [bindings.frontDoor, bindings.providerOrigin].flatMap(target => manifest.rows.map(row => ({target, row})));
const rows = new Array(tasks.length);
await Promise.all(Array.from({length: limits.concurrency}, async () => {
  for (;;) {
    const i = cursor++; if (i >= tasks.length) return;
    const {target, row} = tasks[i], at = new Date().toISOString();
    let got;
    if (Date.now() >= overallUntil) got = {error: 'overall_deadline', trace: []};
    else got = await get(new URL('/' + row.path.split('/').map(encodeURIComponent).join('/'), bindings.origin), target, Math.min(limits.bodyBytes, row.bytes + 65536), Math.min(overallUntil, Date.now() + limits.requestMs));
    const {body, ...observation} = got;
    let bodyFile = null, directByteEqual = false, bodySha256 = null;
    if (body) {
      bodyFile = path.join(target.role, ...row.path.split('/'));
      const file = path.join(output, 'bodies', bodyFile); fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700}); fs.writeFileSync(file, body, {flag: 'wx', mode: 0o600});
      const retained = fs.readFileSync(file), expectedBytes = fs.readFileSync(path.join(baseRoot, row.path));
      bodySha256 = hash(retained); directByteEqual = retained.equals(expectedBytes);
    }
    const peerMatches = target.role !== 'provider-origin' || got.peerAddress === target.address;
    const allClosed = got.trace?.every(x => x.ownedSocketClosed) === true;
    const pass = !got.error && got.status === 200 && got.tls === true && got.noCookie === true && (!got.contentEncoding || got.contentEncoding === 'identity') && peerMatches && allClosed && got.bytes === row.bytes && bodySha256 === row.sha256 && directByteEqual;
    rows[i] = {path: row.path, role: target.role, at, expectedBytes: row.bytes, expectedSha256: row.sha256, ...observation, bodyFile: bodyFile && path.join('bodies', bodyFile), sha256: bodySha256, directByteEqual, peerMatches, allSocketsClosed: allClosed, pass};
    if ((i + 1) % 88 === 0) console.log(JSON.stringify({received: rows.filter(Boolean).length, failed: rows.filter(x => x && !x.pass).length}));
  }
}));
verifyFiles(); verifyAuthority();
const receivedAt = new Date().toISOString(), passed = rows.every(x => x.pass) && createdSockets === closedSockets;
const receipt = {schema: 'pilot.root4732-hosted-before.v1', startedAt, receivedAt, source: manifest.source, hostedBuild: manifest.hostedBuild,
  manifest: {path: manifestPath, sha256: hash(manifestBytes)}, publicInputEvidence: manifest.publicInputEvidence,
  bindings: preimage.bindings, limits, observationAges: ages(), uniqueManifestPaths: manifest.rows.length, received: rows.length,
  perRoute: Object.fromEntries([bindings.frontDoor, bindings.providerOrigin].map(t => {const r = rows.filter(x => x.role === t.role); return [t.role, {files: r.length, passed: r.filter(x => x.pass).length, failed: r.filter(x => !x.pass).length}];})),
  aggregateBytes, createdSockets, closedSockets, rawByteEquality: rows.every(x => x.directByteEqual), passed, rows,
  humanSubsetPaths: human.rows.length, normalization: 'none', ownerQA: true, deployment: false, after: 'held for Root actual new source/build receipt and same original ROOT4732 context'};
save(path.join(output, 'BEFORE.json'), receipt);
console.log(JSON.stringify({passed, uniqueManifestPaths: manifest.rows.length, received: rows.length, failures: rows.filter(x => !x.pass).length, createdSockets, closedSockets}));
process.exitCode = passed ? 0 : 1;
