import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

function flag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function emit(payload, status) {
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(status);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function digest(value) {
  function sort(node) {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.keys(node).sort().map((key) => [key, sort(node[key])]));
    }
    return node;
  }
  return sha256(JSON.stringify(sort(value)));
}

function request(url, ca) {
  const library = url.protocol === 'https:' ? https : http;
  const options = {method: 'GET', timeout: 30000};
  if (ca && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')) options.ca = ca;
  return new Promise((resolve, reject) => {
    const req = library.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(chunks)}));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function label(text, name) {
  const match = text.match(new RegExp('(?:^|\\n)\\s*-?\\s*' + name + ':\\s*(\\S.*\\S|\\S)', 'm'));
  return match ? match[1].trim() : null;
}

function factsFromText(text) {
  const schema = label(text, 'Query-key caller schema');
  const runnerLine = label(text, 'Query-key runner');
  const archive = label(text, 'Query-key archive');
  const sha = label(text, 'Query-key archive sha256');
  const bytes = Number(label(text, 'Query-key archive bytes'));
  const acquire = label(text, 'Query-key acquire');
  const apply = label(text, 'Query-key apply');
  const repository = label(text, 'Query-key source repository');
  const commit = label(text, 'Query-key source commit');
  const sourcePath = label(text, 'Query-key source path');
  const acceptedWork = label(text, 'Accepted work');
  const artifactPath = label(text, 'Query-key artifact path');
  const schemaPath = label(text, 'Query-key artifact schema path');
  const digestPath = label(text, 'Query-key artifact digest path');
  const listPath = label(text, 'Query-key list path');
  if (!schema || !runnerLine || !archive || !sha || !acquire || !apply || !repository || !commit || !sourcePath || !acceptedWork || !artifactPath || !schemaPath || !digestPath || !listPath) {
    return null;
  }
  const [name, version] = runnerLine.split(/\s+/);
  return {
    schema,
    runner: {name, version, archive, sha256: sha, bytes},
    acquire,
    apply,
    source: {repository, commit, path: sourcePath},
    acceptedWork,
    extract: {artifact: artifactPath, schema: schemaPath, digest: digestPath, list: listPath},
  };
}

function findConsumer(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.schema === 'string' && value.runner && typeof value.acquire === 'string' && typeof value.apply === 'string' && value.source) {
    return value;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = findConsumer(child);
    if (found) return found;
  }
  return null;
}

function sameFacts(left, right) {
  return left.schema === right.schema
    && left.runner.sha256 === right.runner.sha256
    && left.runner.archive === right.runner.archive
    && left.runner.bytes === right.runner.bytes
    && left.acquire === right.acquire
    && left.apply === right.apply
    && left.source.commit === right.source.commit
    && left.source.path === right.source.path
    && left.source.repository === right.source.repository
    && left.extract?.artifact === right.extract?.artifact
    && left.extract?.schema === right.extract?.schema
    && left.extract?.digest === right.extract?.digest
    && left.extract?.list === right.extract?.list;
}

function rewrite(origin, href) {
  const url = new URL(href, origin);
  if (url.hostname === 'samedaydesk.com' || url.hostname === 'www.samedaydesk.com') {
    const base = new URL(origin);
    url.protocol = base.protocol;
    url.host = base.host;
  }
  return url;
}

async function main() {
  const origin = flag('--origin');
  const caPath = flag('--ca-file');
  if (!origin) emit({ok: false, code: 'usage'}, 1);
  const ca = caPath ? readFileSync(caPath) : null;
  const gets = [];
  async function get(url) {
    const response = await request(url, ca);
    gets.push({
      method: 'GET',
      url: url.href,
      status: response.status,
      bytes: response.body.length,
      sha256: sha256(response.body),
    });
    return response;
  }
  const llms = await get(new URL('/llms.txt', origin));
  if (llms.status !== 200) emit({ok: false, code: 'llms_unavailable', gets}, 1);
  const textFacts = factsFromText(llms.body.toString('utf8'));
  if (!textFacts) emit({ok: false, code: 'facts_missing', gets}, 1);
  const linked = [];
  const llmsText = llms.body.toString('utf8');
  for (const href of llmsText.match(/https:\/\/[^\s)<]+/g) || []) {
    let url;
    try { url = new URL(href); }
    catch { continue; }
    const path = url.pathname;
    if (path.endsWith('/openapi.json') || path.endsWith('/agent-card.json') || path === '/for-agents' || path.endsWith('/accepted-work')) {
      linked.push(rewrite(origin, href).href);
    }
  }
  const seen = new Set();
  const bodies = new Map();
  const consumers = [textFacts];
  for (const href of linked) {
    if (seen.has(href)) continue;
    seen.add(href);
    const response = await get(new URL(href));
    if (response.status !== 200) emit({ok: false, code: 'instruction_unavailable', url: href, gets}, 1);
    const text = response.body.toString('utf8');
    bodies.set(href, text);
    const fromText = factsFromText(text);
    if (fromText) consumers.push(fromText);
    try {
      const fromJson = findConsumer(JSON.parse(text));
      if (fromJson) consumers.push(fromJson);
    } catch { /* HTML and plain text stay on the line parser. */ }
  }
  if (!consumers.every((item) => sameFacts(textFacts, item))) emit({ok: false, code: 'facts_mismatch', gets}, 1);
  const listUrl = rewrite(origin, textFacts.acceptedWork);
  if (!bodies.has(listUrl.href)) {
    const listResponse = await get(listUrl);
    if (listResponse.status !== 200) emit({ok: false, code: 'accepted_work_unavailable', gets}, 1);
    bodies.set(listUrl.href, listResponse.body.toString('utf8'));
  }
  const listBody = JSON.parse(bodies.get(listUrl.href));
  const items = Array.isArray(listBody.value?.items) ? listBody.value.items : [];
  let item = null;
  let artifactBody = null;
  let artifactBodyText = null;
  for (const row of items) {
    if (!row || typeof row.taskId !== 'string') continue;
    if (row.consumer && !sameFacts(textFacts, row.consumer)) emit({ok: false, code: 'facts_mismatch', gets}, 1);
    const base = listUrl.href.replace(/\/$/, '');
    const detail = await get(new URL(base + '/' + row.taskId));
    const artifact = await get(new URL(base + '/' + row.taskId + '/artifact'));
    if (detail.status !== 200 || artifact.status !== 200) continue;
    let parsed = null;
    let detailBody = null;
    const artifactText = artifact.body.toString('utf8');
    try {
      parsed = JSON.parse(artifactText);
      detailBody = JSON.parse(detail.body.toString('utf8'));
    } catch {
      continue;
    }
    if (detailBody?.value?.consumer && !sameFacts(textFacts, detailBody.value.consumer)) {
      emit({ok: false, code: 'facts_mismatch', gets}, 1);
    }
    if (parsed?.value?.consumer && !sameFacts(textFacts, parsed.value.consumer)) {
      emit({ok: false, code: 'facts_mismatch', gets}, 1);
    }
    const publicArtifact = parsed?.value?.publicArtifact;
    if (!publicArtifact || publicArtifact.schema !== textFacts.schema) continue;
    item = row;
    artifactBody = parsed;
    artifactBodyText = artifactText;
    break;
  }
  if (!item || !artifactBody) emit({ok: false, code: 'accepted_work_unavailable', gets}, 1);
  const publicArtifact = artifactBody.value.publicArtifact;
  const artifactDigest = digest(publicArtifact);
  if (artifactDigest !== artifactBody.value.publicArtifactDigest) emit({ok: false, code: 'artifact_digest_mismatch', gets}, 1);
  const archiveUrl = new URL(textFacts.runner.archive);
  const archive = await get(archiveUrl);
  if (archive.status !== 200 || archive.body.length !== textFacts.runner.bytes || sha256(archive.body) !== textFacts.runner.sha256) {
    emit({ok: false, code: 'runner_mismatch', gets}, 1);
  }
  const directory = mkdtempSync(join(tmpdir(), 'agl-cold-'));
  const finish = (payload, status) => {
    rmSync(directory, {recursive: true, force: true});
    emit(payload, status);
  };
  const archiveFile = join(directory, 'query-key.tar.gz');
  const acquired = spawnSync('curl', ['-fsSL', '-o', archiveFile, archiveUrl.href], {encoding: 'utf8'});
  const acquiredBytes = acquired.status === 0 ? readFileSync(archiveFile) : Buffer.alloc(0);
  gets.push({
    method: 'GET',
    url: archiveUrl.href,
    status: acquired.status === 0 ? 200 : acquired.status,
    bytes: acquiredBytes.length,
    sha256: sha256(acquiredBytes),
    command: textFacts.acquire,
  });
  if (acquired.status !== 0 || sha256(acquiredBytes) !== textFacts.runner.sha256) finish({ok: false, code: 'acquire_failed', gets}, 1);
  const extracted = spawnSync('tar', ['-xzf', archiveFile, '-C', directory], {encoding: 'utf8'});
  if (extracted.status !== 0) finish({ok: false, code: 'archive_refused', gets}, 1);
  const cwd = join(directory, 'query-key-1.1.0');
  const callerPath = join(directory, 'caller.json');
  writeFileSync(callerPath, JSON.stringify(publicArtifact));
  function runApply(input) {
    const child = spawnSync(process.execPath, ['apply.mjs', 'apply', '--artifact', 'corpus.json', '--input', input], {cwd, encoding: 'utf8'});
    let result = null;
    try { result = child.stdout ? JSON.parse(child.stdout) : null; }
    catch { result = null; }
    return {status: child.status, result, stderr: child.stderr || ''};
  }
  const exampleRun = runApply('examples/next-consumer.json');
  const artifactRun = runApply(callerPath);
  if (exampleRun.status !== 0 || artifactRun.status !== 0 || artifactRun.result?.executed !== false) {
    finish({ok: false, code: 'apply_failed', gets, exampleRun, artifactRun}, 1);
  }
  finish({
    ok: true,
    gets,
    schema: textFacts.schema,
    runner: textFacts.runner,
    acquire: textFacts.acquire,
    apply: textFacts.apply,
    source: textFacts.source,
    extract: textFacts.extract,
    raw: {
      llms: llms.body.toString('utf8'),
      openapi: bodies.get([...seen].find((href) => href.includes('/openapi.json'))) || null,
      agentCard: bodies.get([...seen].find((href) => href.includes('/agent-card.json'))) || null,
      forAgents: bodies.get([...seen].find((href) => new URL(href).pathname === '/for-agents')) || null,
      list: bodies.get(listUrl.href) || null,
      artifact: artifactBodyText,
    },
    taskId: item.taskId,
    artifactDigest,
    exampleRun: {status: exampleRun.status, executed: exampleRun.result.executed, wire: exampleRun.result.wire},
    artifactRun: {status: artifactRun.status, executed: artifactRun.result.executed, wire: artifactRun.result.wire},
  }, 0);
}

main().catch((error) => emit({ok: false, code: 'cold_caller_failed', message: error.message}, 1));
