// Source-only admission shared by release and qualification. Git is authority;
// a saved receipt, product label, dependency directory or caller Boolean is not.
// dependenciesCompatible is reported only after the selected consumers load.
import fs from 'node:fs';
import path from 'node:path';
import {execFile, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';

const exec = promisify(execFile);
const OID = /^[a-f0-9]{40}$/;
const HEX = /^[a-f0-9]{64}$/;
const SCRIPT = 'server/scripts/qualify-contributor-https-edge.mjs';
const EDGE = 'server/lib/contributor-https-qualification.js';
// These are the installed signature consumer's two artifact protocols. Member
// lists, versions, commits, imports and bytes come from the selected Git source.
const ARTIFACTS = [
  ['vendor/neomorphic-contributor-journey', 'neomorphic.contributor-journey.artifact.v1'],
  ['vendor/neomorphic-contributor-desk', 'neomorphic.contributor-desk.assets.v1'],
];
// The loaded capability module hashes this package and the host pin. Staging
// selects those bytes from the manifest Git tree; the staged directory itself
// is not a Git checkout. Signing admission leaves this closure off.
const ENTRY_PACKAGE = 'vendor/hosted-wallet-market';
const ENTRY_DIRECTORIES = ['bin', 'client', 'contracts', 'schema', 'src', 'runtime'];
const ENTRY_ROOTS = [
  ENTRY_PACKAGE + '/bin/machine-profile.mjs',
  ENTRY_PACKAGE + '/src/machine-profile-document.mjs',
  ENTRY_PACKAGE + '/src/release-profile.mjs',
  ENTRY_PACKAGE + '/src/machine-market.mjs',
];
// Library consumers. The bin writes a capability file on load, so admission
// loads the producer and runtime readers instead of executing it. One import
// is not the whole consumer: release, the capability document, and the runtime
// reader each have to evaluate, which resolves their static runtime imports.
export const ENTRY_CONSUMERS = Object.freeze([
  ENTRY_PACKAGE + '/src/release-profile.mjs',
  ENTRY_PACKAGE + '/src/machine-profile-document.mjs',
  ENTRY_PACKAGE + '/src/machine-market.mjs',
]);
const HOST_PIN = 'server/foundry/activation/private-control-pin.json';
const LIMIT = {tree: 100000, files: 20000, fileBytes: 16 * 1024 * 1024, totalBytes: 128 * 1024 * 1024, depth: 48};
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
export const gitBlob = bytes => hash('sha1', Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
const digest = bytes => hash('sha256', bytes);
function fail(reason) { throw Object.assign(Error(reason), {providerMutated: false, sent: false, replayed: false}); }
function need(ok, reason) { if (!ok) fail(reason); }
// Journey and desk identities come from the trusted manifest. An omitted desk
// identity means the legacy same-commit pair. An artifact sourceCommit is a
// claim to check, never the authorization to choose a different commit.
export function expectedArtifactIdentities(manifest) {
  const journey = manifest?.neomorphicCommit;
  const desk = manifest && Object.hasOwn(manifest, 'neomorphicDeskCommit') ? manifest.neomorphicDeskCommit : journey;
  need(OID.test(journey ?? '') && OID.test(desk ?? ''), 'source_identity_required');
  return {journey, desk};
}
export function safeSourcePath(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 4096 && !name.startsWith('/') &&
    !name.includes('\\') && !/[\x00-\x1f\x7f]/.test(name) && name.split('/').length <= LIMIT.depth &&
    name.split('/').every(part => part && part !== '.' && part !== '..' && part.toLowerCase() !== '.git');
}
function sourcePath(name) {
  need(safeSourcePath(name) && name !== 'node_modules' && !name.startsWith('node_modules/'), 'source_path_refused');
  return name;
}
function directory(root) {
  need(typeof root === 'string' && path.isAbsolute(root), 'issuer_source_required');
  const absolute = path.resolve(root);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split('/').filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch { fail('source_directory_required'); }
    need(stat.isDirectory() && !stat.isSymbolicLink(), 'source_path_refused');
  }
  return absolute;
}
function localBytes(root, name) {
  sourcePath(name);
  const parts = name.split('/');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch { fail('source_member_missing'); }
    need(stat.isDirectory() && !stat.isSymbolicLink(), 'source_path_refused');
  }
  let fd;
  try {
    fd = fs.openSync(path.join(root, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    need(stat.isFile() && stat.size <= LIMIT.fileBytes, 'source_path_refused');
    const bytes = fs.readFileSync(fd);
    need(bytes.length === stat.size, 'source_member_changed');
    return bytes;
  } catch (error) {
    if (error.code === 'ENOENT') fail('source_member_missing');
    if (error.code === 'ELOOP') fail('source_path_refused');
    throw error;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function parse(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail('source_manifest_refused'); }
}
function present(filename) {
  try { fs.lstatSync(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Reconstruct every tree, including the root. A response with omitted entries
// fails even if it falsely claims truncated:false. Git's directory sort uses '/'.
function treeIndex(tree, rootOid) {
  need(Array.isArray(tree) && tree.length > 0 && tree.length <= LIMIT.tree && OID.test(rootOid), 'source_tree_unreceived');
  const entries = new Map(), children = new Map([['', []]]);
  for (const row of tree) {
    need(safeSourcePath(row?.path) && !entries.has(row.path) && OID.test(row.sha ?? '') &&
      (row.type === 'tree' && row.mode === '040000' || row.type === 'blob' && ['100644', '100755', '120000'].includes(row.mode) ||
       row.type === 'commit' && row.mode === '160000'), 'source_tree_refused');
    entries.set(row.path, row);
    if (row.type === 'tree') children.set(row.path, []);
  }
  for (const row of entries.values()) {
    const parent = path.posix.dirname(row.path);
    const list = children.get(parent === '.' ? '' : parent);
    need(list, 'source_tree_unreceived');
    list.push(row);
  }
  for (const [folder, rows] of children) {
    rows.sort((a, b) => Buffer.compare(Buffer.from(path.posix.basename(a.path) + (a.type === 'tree' ? '/' : '')),
      Buffer.from(path.posix.basename(b.path) + (b.type === 'tree' ? '/' : ''))));
    const bytes = Buffer.concat(rows.map(row => Buffer.concat([
      Buffer.from(`${row.type === 'tree' ? '40000' : row.mode} ${path.posix.basename(row.path)}\0`), Buffer.from(row.sha, 'hex'),
    ])));
    const actual = hash('sha1', Buffer.concat([Buffer.from(`tree ${bytes.length}\0`), bytes]));
    need(actual === (folder ? entries.get(folder).sha : rootOid), 'source_tree_unreceived');
  }
  return entries;
}

function gitBatch(checkout, env, signal) {
  const child = spawn('git', ['--no-replace-objects', '-C', checkout, 'cat-file', '--batch'], {env, stdio: ['pipe', 'pipe', 'pipe']});
  const waiters = [];
  let buf = Buffer.alloc(0);
  let dead = null;
  let closed = false;
  const refuse = reason => Object.assign(Error(reason), {providerMutated: false, sent: false, replayed: false});
  function die(error) {
    if (dead) return;
    dead = error;
    try { child.kill(); } catch { /* already gone */ }
    while (waiters.length) waiters.shift().reject(error);
  }
  if (signal?.aborted) die(signal.reason);
  else signal?.addEventListener('abort', () => die(signal.reason), {once: true});
  child.on('error', () => die(refuse('git_source_unreceived')));
  child.stderr.on('data', () => {});
  child.on('close', () => { if (waiters.length) die(refuse('git_source_unreceived')); });
  function pump() {
    while (waiters.length && !dead) {
      const nl = buf.indexOf(10);
      if (nl < 0) return;
      const header = buf.subarray(0, nl).toString('utf8');
      if (header.endsWith(' missing')) {
        buf = buf.subarray(nl + 1);
        waiters.shift().reject(refuse('git_source_unreceived'));
        continue;
      }
      const match = /^([a-f0-9]{40}) \S+ (\d+)$/.exec(header);
      const size = match ? Number(match[2]) : NaN;
      if (!match || match[1] !== waiters[0].sha || !Number.isSafeInteger(size) || size > LIMIT.fileBytes) {
        die(refuse('git_source_unreceived'));
        return;
      }
      const start = nl + 1;
      if (buf.length < start + size + 1) return;
      if (buf[start + size] !== 10) { die(refuse('git_source_unreceived')); return; }
      const bytes = Buffer.from(buf.subarray(start, start + size));
      buf = buf.subarray(start + size + 1);
      waiters.shift().resolve(bytes);
    }
  }
  child.stdout.on('data', chunk => { buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]); pump(); });
  return {
    read(sha) {
      if (dead) return Promise.reject(dead);
      return new Promise((resolve, reject) => {
        waiters.push({sha, resolve, reject});
        try { child.stdin.write(sha + '\n'); }
        catch (error) { waiters.pop(); reject(error); }
      });
    },
    close() {
      if (closed) return;
      closed = true;
      try { child.stdin.end(); } catch { /* already gone */ }
    },
  };
}

async function trustedGit({manifest, sourceCheckout, sourceRequest, signal}) {
  const {repository, commit} = manifest ?? {};
  need(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') &&
    repository.split('/').every(part => !['.', '..'].includes(part)) && OID.test(commit ?? ''), 'source_identity_required');
  let entries, tree, blob;
  let closeGit = () => {};
  if (sourceCheckout) {
    const checkout = directory(sourceCheckout);
    const env = {...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0'};
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
    const git = async (args, encoding = 'utf8', maxBuffer = 32 * 1024 * 1024) => {
      try { return (await exec('git', ['--no-replace-objects', '-C', checkout, ...args], {env, encoding, signal, timeout: 30000, maxBuffer})).stdout; }
      catch { if (signal?.aborted) throw signal.reason; fail('git_source_unreceived'); }
    };
    const origin = (await git(['remote', 'get-url', 'origin'])).trim();
    need([`https://github.com/${repository}.git`, `https://github.com/${repository}`, `git@github.com:${repository}.git`].includes(origin), 'source_repository_mismatch');
    const bytes = await git(['cat-file', 'commit', commit], 'buffer');
    need(hash('sha1', Buffer.concat([Buffer.from(`commit ${bytes.length}\0`), bytes])) === commit, 'source_commit_unreceived');
    tree = /^tree ([a-f0-9]{40})\n/.exec(bytes.toString('utf8'))?.[1];
    const raw = await git(['ls-tree', '-r', '-t', '-l', '-z', commit]);
    entries = treeIndex(raw.split('\0').filter(Boolean).map(line => {
      const match = /^(\d{6}) (blob|tree|commit) ([a-f0-9]{40}) +([0-9]+|-)\t([\s\S]+)$/.exec(line);
      need(match, 'source_tree_refused');
      return {mode: match[1], type: match[2], sha: match[3], size: match[4] === '-' ? undefined : Number(match[4]), path: match[5]};
    }), tree);
    let batch;
    blob = row => {
      batch ??= gitBatch(checkout, env, signal);
      return batch.read(row.sha);
    };
    closeGit = () => batch?.close();
  } else {
    const api = async route => {
      if (signal?.aborted) throw signal.reason;
      try {
        if (sourceRequest) return await sourceRequest(repository, route, {signal});
        const {stdout} = await exec('gh', ['api', `repos/${repository}/${route}`], {
          encoding: 'utf8', signal, timeout: 30000, maxBuffer: 32 * 1024 * 1024,
          env: {...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat'},
        });
        return JSON.parse(stdout);
      } catch { if (signal?.aborted) throw signal.reason; fail('git_source_unreceived'); }
    };
    const received = await api('git/commits/' + commit);
    need(received?.sha === commit && OID.test(received.tree?.sha ?? ''), 'source_commit_unreceived');
    tree = received.tree.sha;
    const response = await api('git/trees/' + tree + '?recursive=1');
    need(response?.sha === tree && response.truncated === false, 'source_tree_unreceived');
    entries = treeIndex(response.tree, tree);
    blob = async row => {
      const response = await api('git/blobs/' + row.sha);
      need(response?.sha === row.sha && response.encoding === 'base64' && response.size === row.size &&
        typeof response.content === 'string' && response.content.length <= LIMIT.fileBytes * 1.5, 'source_blob_unreceived');
      const encoded = response.content.replace(/\n/g, '');
      const bytes = Buffer.from(encoded, 'base64');
      need(bytes.toString('base64') === encoded, 'source_blob_unreceived');
      return bytes;
    };
  }
  const cache = new Map();
  const member = name => {
    sourcePath(name);
    const row = entries.get(name);
    need(row?.type === 'blob' && ['100644', '100755'].includes(row.mode) && Number.isSafeInteger(row.size) &&
      row.size >= 0 && row.size <= LIMIT.fileBytes, 'source_member_refused');
    return row;
  };
  async function read(name) {
    const row = member(name);
    if (!cache.has(name)) {
      const bytes = await blob(row);
      need(bytes.length === row.size && gitBlob(bytes) === row.sha, 'source_blob_unreceived');
      cache.set(name, bytes);
    }
    return cache.get(name);
  }
  return {repository, commit, tree, entries, read, member, close: closeGit};
}

function imports(source) {
  // Only parse literal module specifiers; never evaluate source to discover it.
  const specs = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const match of text.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"\n]+)['"]/g)) specs.push(match[1]);
  for (const match of text.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g)) specs.push(match[1]);
  return specs;
}

export function declaredSourceMembers(source) {
  const block = /\bconst\s+MEMBERS\s*=\s*(?:Object\.freeze\()?\s*\[([^\]]*)\]/.exec(source);
  need(block, 'source_members_required');
  // Unknown computed/spread syntax must be implemented deliberately, never
  // silently reduced to whichever string literals the parser happens to see.
  need(block[1].replace(/['"][^'"]+['"]/g, '').replace(/[\s,]/g, '') === '', 'source_members_required');
  const declared = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => sourcePath(match[1]));
  need(declared.length > 0 && declared.length <= 64 && new Set(declared).size === declared.length, 'source_members_required');
  return declared;
}
async function sourcePlan(options) {
  const git = await trustedGit(options);
  try {
  const selected = new Set(['package.json', 'package-lock.json', SCRIPT, EDGE]);
  const source = (await git.read(EDGE)).toString('utf8');
  const declared = declaredSourceMembers(source);
  for (const name of declared) selected.add(name);
  // Follow the actual signing imports, not all of the server entrypoint's
  // unrelated application imports. Declared edge members are still byte-bound.
  const pending = [SCRIPT], seen = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    seen.add(name); need(seen.size <= 128, 'source_import_closure_refused');
    selected.add(name);
    for (const spec of imports((await git.read(name)).toString('utf8'))) {
      if (!spec.startsWith('.')) {
        need(!spec.startsWith('/') && !spec.startsWith('file:') && !spec.startsWith('data:'), 'source_import_refused');
        continue; // Installed package compatibility is checked by real inspect.
      }
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
      sourcePath(base);
      const resolved = [base, base + '.js', base + '.mjs', base + '/index.js', base + '/index.mjs']
        .find(candidate => git.entries.get(candidate)?.type === 'blob');
      need(resolved, 'source_import_closure_refused');
      pending.push(resolved);
    }
  }
  const lock = await git.read('package-lock.json');
  parse(await git.read('package.json')); parse(lock);
  const expected = expectedArtifactIdentities(options.manifest);
  for (const [root, schema] of ARTIFACTS) {
    const name = root + '/SOURCE.json', manifest = parse(await git.read(name));
    const expectedCommit = root === 'vendor/neomorphic-contributor-desk' ? expected.desk : expected.journey;
    need(manifest.schema === schema && manifest.sourceCommit === expectedCommit &&
      Array.isArray(manifest.files) && manifest.files.length <= 3000, 'source_artifact_identity_refused');
    if (manifest.hostLockSha256 !== undefined) need(manifest.hostLockSha256 === digest(lock), 'source_artifact_lock_refused');
    selected.add(name);
    const artifact = new Set([name]);
    for (const file of manifest.files) {
      const relative = sourcePath(file.path), member = root + '/' + relative;
      need(!artifact.has(member) && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && HEX.test(file.sha256 ?? ''), 'source_artifact_manifest_refused');
      const row = git.member(member);
      need(row.size === file.bytes, 'source_artifact_manifest_refused');
      artifact.add(member); selected.add(member);
    }
    const actual = [...git.entries.values()].filter(row => row.path.startsWith(root + '/') && row.type !== 'tree');
    need(actual.length === artifact.size && actual.every(row => artifact.has(row.path)), 'source_artifact_members_refused');
  }
  if (options.entryClosure === true) await bindEntryClosure(git, selected);
  // Node consults nearer package.json files. Bind tracked ones, including
  // files the entry closure added, and refuse untracked package-scope overrides.
  for (const name of [...selected]) {
    for (let dir = path.posix.dirname(name); dir !== '.'; dir = path.posix.dirname(dir)) {
      if (git.entries.has(dir + '/package.json')) selected.add(dir + '/package.json');
    }
  }
  const members = [...selected].sort().map(name => git.member(name));
  need(members.length <= LIMIT.files && members.reduce((total, row) => total + row.size, 0) <= LIMIT.totalBytes, 'source_closure_limit');
  return {git, members, memberCount: declared.length, entryClosure: options.entryClosure === true};
  } catch (error) {
    git.close();
    throw error;
  }
}

async function bindEntryClosure(git, selected) {
  for (const name of ENTRY_ROOTS) need(git.entries.get(name)?.type === 'blob', 'source_import_closure_refused');
  const pending = [...ENTRY_ROOTS], seen = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    need(seen.size <= 2048, 'source_import_closure_refused');
    selected.add(name);
    for (const spec of imports((await git.read(name)).toString('utf8'))) {
      if (!spec.startsWith('.')) {
        need(!spec.startsWith('/') && !spec.startsWith('file:') && !spec.startsWith('data:'), 'source_import_refused');
        continue; // Installed package compatibility is checked by loading ENTRY_CONSUMERS.
      }
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
      sourcePath(base);
      const resolved = [base, base + '.js', base + '.mjs', base + '/index.js', base + '/index.mjs']
        .find(candidate => git.entries.get(candidate)?.type === 'blob');
      need(resolved, 'source_import_closure_refused');
      pending.push(resolved);
    }
  }
  for (const dir of ENTRY_DIRECTORIES) {
    const prefix = ENTRY_PACKAGE + '/' + dir + '/';
    const rows = [...git.entries.values()].filter(row => row.path.startsWith(prefix) && row.type !== 'tree');
    need(rows.length > 0, 'source_import_closure_refused');
    for (const row of rows) {
      need(row.type === 'blob' && ['100644', '100755'].includes(row.mode), 'source_member_refused');
      selected.add(row.path);
    }
  }
  for (const name of [ENTRY_PACKAGE + '/package.json', ENTRY_PACKAGE + '/package-lock.json']) {
    git.member(name);
    selected.add(name);
  }
  const pin = parse(await git.read(HOST_PIN));
  selected.add(HOST_PIN);
  const files = pin && typeof pin.files === 'object' && !Array.isArray(pin.files) ? Object.keys(pin.files) : null;
  need(files && files.length > 0 && files.length <= 4000 &&
    files.every(name => !name.startsWith('/') && !name.includes('..') && !name.includes('\\')), 'source_artifact_manifest_refused');
  for (const file of files) {
    sourcePath(file);
    git.member(file);
    selected.add(file);
  }
}

function verifySelectedTree(root, relative, selected) {
  if (!present(path.join(root, relative))) fail('source_member_missing');
  const top = fs.lstatSync(path.join(root, relative));
  need(top.isDirectory() && !top.isSymbolicLink(), 'source_path_refused');
  const found = new Set();
  let directories = 0;
  function walk(current, depth) {
    need(depth <= LIMIT.depth && ++directories <= LIMIT.files, 'source_closure_limit');
    let names;
    try { names = fs.readdirSync(path.join(root, current)); }
    catch { fail('source_member_missing'); }
    for (const name of names) {
      const member = sourcePath(current + '/' + name);
      const stat = fs.lstatSync(path.join(root, member));
      need(!stat.isSymbolicLink(), 'source_path_refused');
      if (stat.isDirectory()) walk(member, depth + 1);
      else {
        need(stat.isFile() && selected.has(member), 'source_artifact_members_refused');
        found.add(member);
      }
    }
  }
  walk(relative, 0);
  return found;
}

function verifyLocal(plan, root) {
  const proof = [];
  const selected = new Set(plan.members.map(row => row.path));
  for (const row of plan.members) {
    const bytes = localBytes(root, row.path);
    need(bytes.length === row.size && gitBlob(bytes) === row.sha, 'source_member_mismatch');
    proof.push({path: row.path, blob: row.sha, bytes: bytes.length});
    for (let dir = path.posix.dirname(row.path); dir !== '.'; dir = path.posix.dirname(dir)) {
      const filename = dir + '/package.json';
      need(selected.has(filename) || !present(path.join(root, filename)), 'source_package_scope_refused');
      const modules = dir + '/node_modules';
      need(!present(path.join(root, modules)) || [...selected].some(member => member.startsWith(modules + '/')), 'source_dependency_scope_refused');
    }
  }
  for (const [artifact] of ARTIFACTS) {
    const found = new Set(); let directories = 0;
    function walk(relative, depth = 0) {
      need(depth <= LIMIT.depth && ++directories <= LIMIT.files, 'source_closure_limit');
      for (const name of fs.readdirSync(path.join(root, relative))) {
        const member = sourcePath(relative + '/' + name), stat = fs.lstatSync(path.join(root, member));
        if (stat.isDirectory()) walk(member, depth + 1);
        else { need(stat.isFile() && selected.has(member), 'source_artifact_members_refused'); found.add(member); }
      }
    }
    walk(artifact);
    need(plan.members.filter(row => row.path.startsWith(artifact + '/')).every(row => found.has(row.path)), 'source_member_missing');
  }
  if (plan.entryClosure === true) {
    for (const dir of ENTRY_DIRECTORIES) {
      const relative = ENTRY_PACKAGE + '/' + dir;
      const found = verifySelectedTree(root, relative, selected);
      need(plan.members.filter(row => row.path.startsWith(relative + '/')).every(row => found.has(row.path)), 'source_member_missing');
    }
  }
  return {schema: 'pilot.release-source-admission.v1', repository: plan.git.repository, sourceCommit: plan.git.commit,
    sourceTree: plan.git.tree, files: proof.length, bytes: proof.reduce((total, row) => total + row.bytes, 0),
    memberDigest: digest(JSON.stringify(proof)), memberCount: plan.memberCount};
}

async function inspect(root, productCommit, signal) {
  let identity;
  try {
    const child = await exec(process.execPath, [path.join(root, SCRIPT), 'inspect'], {
      cwd: root, signal, timeout: 60000, maxBuffer: 32768,
      env: {PATH: process.env.PATH ?? '', CONTRIBUTOR_JOURNEY_SOURCE_COMMIT: productCommit},
    });
    identity = JSON.parse(child.stdout);
  } catch { if (signal?.aborted) throw signal.reason; fail('issuer_source_unreceived'); }
  need(identity?.schema === 'sds.contributor-edge-identity.v1' && identity.productCommit === productCommit &&
    identity.providerReceived === false && identity.qualificationIssued === false && identity.publicEnabled === false &&
    ['edgeSha256', 'runtimeManifestSha256', 'deskManifestSha256'].every(key => HEX.test(identity[key] ?? '')), 'issuer_source_unreceived');
  return identity;
}

// Re-evaluate every admission: nested installed dependency bytes are mutable.
async function loadEntryConsumers(root, memberDigest, signal) {
  // A new process resolves the linked store. This process must not reuse an
  // evaluation from a different listing or from Node's module cache.
  const script = `import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const names = JSON.parse(process.env.PILOT_ENTRY_CONSUMERS);
for (const name of names) await import(pathToFileURL(join(process.env.PILOT_ENTRY_ROOT, name)).href);
`;
  try {
    await exec(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root, signal, timeout: 60000, maxBuffer: 1024 * 1024,
      env: {
        PATH: process.env.PATH ?? '',
        PILOT_ENTRY_ROOT: root,
        PILOT_ENTRY_CONSUMERS: JSON.stringify(ENTRY_CONSUMERS),
      },
    });
  } catch { if (signal?.aborted) throw signal.reason; fail('issuer_source_unreceived'); }
}

async function runtimeIdentity(root, productCommit, entryClosure, memberDigest, signal) {
  const identity = await inspect(root, productCommit, signal);
  if (entryClosure === true) await loadEntryConsumers(root, memberDigest, signal);
  return identity;
}

/** Re-read trusted Git and member bytes for each mutation, including old journals. */
export async function admitReleaseSource(options) {
  const root = directory(options.sdsRoot);
  const plan = await sourcePlan(options);
  try {
    const proof = verifyLocal(plan, root);
    const identity = await runtimeIdentity(root, options.manifest.neomorphicCommit, plan.entryClosure, proof.memberDigest, options.signal);
    need(JSON.stringify(verifyLocal(plan, root)) === JSON.stringify(proof), 'source_member_changed');
    return {...proof, identity, dependenciesCompatible: true, providerMutated: false, qualificationIssued: false};
  } finally { plan.git.close(); }
}

/** Exclusive, bounded source staging. Reuses only byte-equal source and the
 * existing top-level installed store; declared nested node_modules are source. */
export async function stageReleaseSource(options) {
  need(typeof options.sdsRoot === 'string' && path.isAbsolute(options.sdsRoot), 'issuer_source_required');
  const root = path.resolve(options.sdsRoot), parent = directory(path.dirname(root));
  need(!fs.existsSync(root) && !fs.lstatSync(parent).isSymbolicLink(), 'source_destination_exists');
  const reuse = options.reuseSource ? directory(options.reuseSource) : null;
  if (reuse) need(root !== reuse && !root.startsWith(reuse + '/') && !reuse.startsWith(root + '/'), 'source_disjoint_roots_required');
  const dependencies = options.dependenciesRoot ? directory(options.dependenciesRoot) : reuse;
  need(dependencies, 'issuer_dependency_unavailable');
  const modules = path.join(dependencies, 'node_modules');
  need(fs.existsSync(modules) && fs.statSync(modules).isDirectory(), 'issuer_dependency_unavailable');
  const plan = await sourcePlan(options);
  try {
  fs.mkdirSync(root, {mode: 0o700});
  let reused = 0;
  for (const row of plan.members) {
    if (options.signal?.aborted) throw options.signal.reason;
    let bytes;
    if (reuse) {
      try { const candidate = localBytes(reuse, row.path); if (candidate.length === row.size && gitBlob(candidate) === row.sha) {bytes = candidate; reused++;} }
      catch (error) { if (error.message !== 'source_member_missing') throw error; }
    }
    bytes ??= await plan.git.read(row.path);
    fs.mkdirSync(path.dirname(path.join(root, row.path)), {recursive: true, mode: 0o700});
    fs.writeFileSync(path.join(root, row.path), bytes, {flag: 'wx', mode: row.mode === '100755' ? 0o700 : 0o600});
  }
  const proof = verifyLocal(plan, root);
  fs.symlinkSync(modules, path.join(root, 'node_modules'), 'dir');
  const identity = await runtimeIdentity(root, options.manifest.neomorphicCommit, plan.entryClosure, proof.memberDigest, options.signal);
  need(JSON.stringify(verifyLocal(plan, root)) === JSON.stringify(proof), 'source_member_changed');
  const receipt = {...proof, identity, reused, fetched: plan.members.length - reused, dependenciesCompatible: true,
    nodeModulesReused: true, providerMutated: false, qualificationIssued: false};
  fs.writeFileSync(path.join(root, 'SOURCE-IDENTITY.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return receipt;
  } finally { plan.git.close(); }
}
